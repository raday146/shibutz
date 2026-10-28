import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const DAY = '2026-11-02';
const iso = (hhmm: string): string => `${DAY}T${hhmm}:00.000Z`;
const stop = (jobId: number) => ({
  jobId, title: `Fix ${jobId}`, address: `Addr ${jobId}`, sequence: jobId, location: [34.8, 32.1], status: 'assigned', skillIds: [], serviceDurationS: 1800, driveS: 600, hasNote: false,
  eta: iso(`0${5 + jobId}:00`), etd: iso(`0${5 + jobId}:30`), actualArrival: null, actualDeparture: null,
});
const body: Record<string, unknown> = {
  '/technicians': [{ id: 1, name: 'Bob', home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [], color: 1 }],
  '/jobs': [],
  '/skills': [],
  [`/days/${DAY}/summary`]: {
    date: DAY,
    totals: { total: 2, assigned: 2, unassigned: 0, done: 0, driveS: 0 },
    technicians: [{ technicianId: 1, stopCount: 2, doneCount: 0, driveS: 0, expectedFinish: null, openIncidents: 1, stops: [] }],
  },
  [`/routes/1/${DAY}`]: { technicianId: 1, date: DAY, geometry: null, stops: [stop(1), stop(2)], summary: { doneCount: 0, driveS: 0, expectedFinish: null } },
  '/incidents/open': [{ id: 1, technicianId: 1, date: DAY, jobId: null, body: 'Gate locked', status: 'open', createdAt: iso('06:00'), updatedAt: iso('06:00'), reviewedAt: null }],
  [`/routes/1/${DAY}/cancellations`]: [],
  [`/technicians/1/days/${DAY}/incidents`]: [],
};

/**
 * Simulates an engine that has neither the popover API nor CSS anchor positioning (Safari before 26): the first attempt at these
 * overlays used both and rendered the menu as a full-height box there. Playwright's WebKit is new enough to have both, so the
 * features are hidden from the page instead.
 */
async function withoutModernPositioning(page: Page): Promise<void> {
  await page.addInitScript(() => {
    delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
    delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover;
    const supports = CSS.supports.bind(CSS);
    CSS.supports = ((...args: string[]) => (/anchor|position-area|position-try|popover/.test(args.join(' ')) ? false : supports(...(args as [string])))) as typeof CSS.supports;
  });
}

/** Nothing the app ships may depend on anchor positioning: no stylesheet rule and no inline style mentions it. */
async function expectNoAnchorPositioning(page: Page): Promise<void> {
  const used = await page.evaluate(() => {
    const css = [...document.styleSheets].flatMap((s) => { try { return [...s.cssRules].map((r) => r.cssText); } catch { return []; } });
    const inline = [...document.querySelectorAll('[style]')].map((e) => e.getAttribute('style') ?? '');
    return [...css, ...inline].filter((c) => /anchor-name|position-anchor|position-area|position-try|anchor\(|\[popover\]/.test(c));
  });
  expect(used).toEqual([]);
}

async function open(page: Page, lang: 'he' | 'en'): Promise<void> {
  await page.addInitScript(({ day, l }) => { localStorage.setItem('shibutz.date', day); localStorage.setItem('shibutz.lang', l); }, { day: DAY, l: lang });
  await page.route('**/*.tile.openstreetmap.org/**', (r) => r.abort());
  await page.route(/\/(technicians|jobs|routes|skills|days|incidents)(\/|$)/, (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() === 'POST' && pathname === '/incidents/1/review') return route.fulfill({ json: { ...(body['/incidents/open'] as object[])[0], status: 'reviewed', reviewedAt: iso('07:00') } });
    return pathname in body
      ? route.fulfill({ json: body[pathname] })
      : route.fulfill({ status: 404, json: { message: 'no fixture' } }); // reports and notes: none yet
  });
  await page.goto('/');
  await page.getByRole('list', { name: /Technicians|טכנאים/ }).getByRole('button').click();
  await expect(page.locator('aside.drawer')).toBeVisible();
}

/** The overlay is fully on screen and hangs directly below or above its trigger, overlapping it horizontally. */
async function expectNextTo(page: Page, overlay: Locator, trigger: Locator): Promise<void> {
  await expect(overlay).toBeVisible();
  const [o, t, view] = [await overlay.boundingBox(), await trigger.boundingBox(), page.viewportSize()];
  if (!o || !t || !view) throw new Error('nothing to measure');
  expect(o.width).toBeGreaterThan(40);
  expect(o.height).toBeGreaterThan(20);
  expect(o.height).toBeLessThan(view.height * 0.8); // not a full-height box
  expect(o.x).toBeGreaterThanOrEqual(0);
  expect(o.y).toBeGreaterThanOrEqual(0);
  expect(o.x + o.width).toBeLessThanOrEqual(view.width);
  expect(o.y + o.height).toBeLessThanOrEqual(view.height);
  const gap = Math.min(Math.abs(o.y - (t.y + t.height)), Math.abs(t.y - (o.y + o.height)));
  expect(gap).toBeLessThanOrEqual(12);
  expect(Math.min(o.x + o.width, t.x + t.width) - Math.max(o.x, t.x)).toBeGreaterThan(0);
}

for (const lang of ['he', 'en'] as const) {
  test.describe(lang, () => {
    test('stop overflow menu is visible, on screen and next to its button', async ({ page }) => {
      await open(page, lang);
      await page.locator('aside.drawer').getByRole('button', { name: /Fix 2/ }).click();
      const trigger = page.locator('[aria-haspopup=menu]');
      await trigger.click();
      await expectNextTo(page, page.getByRole('menu'), trigger);
      // Styled as a menu, not loose buttons: items stacked, inside a bordered box (the menu is portaled out of .stop-actions).
      const [first, second] = [await page.getByRole('menuitem').nth(0).boundingBox(), await page.getByRole('menuitem').nth(1).boundingBox()];
      expect(first && second && second.y > first.y + first.height - 1).toBe(true);
      await expect(page.getByRole('menu')).toHaveCSS('border-top-width', '1px');
      await expect(page.getByRole('menuitem')).toHaveCount(2);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });

    test('incidents popover is visible, on screen and next to its button', async ({ page }) => {
      await open(page, lang);
      const trigger = page.locator('[aria-controls=incidents-panel]');
      await trigger.click();
      await expectNextTo(page, page.locator('#incidents-panel'), trigger);
      // Safari and Firefox on macOS do not focus a button on click, so a click inside must not read as focus leaving.
      await page.locator('#incidents-panel li').getByRole('button').last().click();
      await expect(page.locator('#incidents-panel li')).toHaveCount(0);
      await expect(page.locator('#incidents-panel')).toBeVisible();
      await page.mouse.click(10, 300); // outside press closes it
      await expect(page.locator('#incidents-panel')).toHaveCount(0);
    });
  });
}

test.describe('without the popover API or anchor positioning', () => {
  for (const lang of ['he', 'en'] as const) {
    test(`overlays still work (${lang})`, async ({ page }) => {
      await withoutModernPositioning(page);
      await open(page, lang);
      await page.locator('aside.drawer').getByRole('button', { name: /Fix 2/ }).click();
      const more = page.locator('[aria-haspopup=menu]');
      await more.click();
      await expectNextTo(page, page.getByRole('menu'), more);
      await expectNoAnchorPositioning(page);
      await page.keyboard.press('Escape');
      const incidents = page.locator('[aria-controls=incidents-panel]');
      await incidents.click();
      await expectNextTo(page, page.locator('#incidents-panel'), incidents);
      await expectNoAnchorPositioning(page);
    });
  }
});

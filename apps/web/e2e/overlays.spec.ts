import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const DAY = '2026-11-02';
const iso = (hhmm: string): string => `${DAY}T${hhmm}:00.000Z`;
const stop = (jobId: number) => ({
  jobId, title: `Fix ${jobId}`, address: `Addr ${jobId}`, sequence: jobId, location: [34.8, 32.1], status: 'assigned', skillIds: [], serviceDurationS: 1800, driveS: 600, hasNote: false,
  eta: iso(`0${5 + jobId}:00`), etd: iso(`0${5 + jobId}:30`), actualArrival: null, actualDeparture: null,
});
const body: Record<string, unknown> = {
  '/technicians': [{ id: 1, name: 'Bob', home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', active: true, version: 0, skillIds: [], color: 1 },
    { id: 2, name: 'Dana', home: [34.9, 32.2], shiftStart: '08:00:00', shiftEnd: '16:00:00', active: false, version: 3, skillIds: [], color: null },
  ],
  '/jobs': [1, 2].map((id) => ({
    id, title: `Fix ${id}`, address: `Addr ${id}`, location: [34.8, 32.1], skillIds: [], serviceDurationS: 1800, windowStart: iso('05:00'), windowEnd: iso('12:00'),
    priority: 50, status: 'assigned', day: DAY, unassignedReason: null, unassignedAt: null,
  })),
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

async function open(page: Page, lang: 'he' | 'en', openDrawer = true): Promise<void> {
  await page.addInitScript(({ day, l }) => { localStorage.setItem('shibutz.date', day); localStorage.setItem('shibutz.lang', l); }, { day: DAY, l: lang });
  await page.route('**/*.tile.openstreetmap.org/**', (r) => r.abort());
  await page.route(/\/(technicians|jobs|routes|skills|days|incidents)(\/|$)/, (route) => {
    const { pathname } = new URL(route.request().url());
    if (route.request().method() === 'POST' && pathname === '/technicians/1/deactivate') return route.fulfill({ status: 409, json: { message: 'Technician has unfinished stops on a route', dates: ['2026-11-03', '2026-11-05'] } });
    if (route.request().method() === 'POST' && pathname === '/incidents/1/review') return route.fulfill({ json: { ...(body['/incidents/open'] as object[])[0], status: 'reviewed', reviewedAt: iso('07:00') } });
    return pathname in body
      ? route.fulfill({ json: body[pathname] })
      : route.fulfill({ status: 404, json: { message: 'no fixture' } }); // reports and notes: none yet
  });
  await page.goto('/');
  if (!openDrawer) return;
  await page.getByRole('list', { name: /Technicians|טכנאים/ }).getByRole('button').first().click();
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
      const trigger = page.locator('aside.drawer [aria-haspopup=menu]');
      await trigger.click();
      await expectNextTo(page, page.getByRole('menu'), trigger);
      // Styled as a menu, not loose buttons: items stacked, inside a bordered box (the menu is portaled out of .stop-actions).
      const [first, second] = [await page.getByRole('menuitem').nth(0).boundingBox(), await page.getByRole('menuitem').nth(1).boundingBox()];
      expect(first && second && second.y > first.y + first.height - 1).toBe(true);
      await expect(page.getByRole('menu')).toHaveCSS('border-top-width', '1px');
      await expect(page.getByRole('menuitem')).toHaveCount(3); // Edit job, Unassign, Cancel job
      await page.keyboard.press('Escape');
      await expect(page.getByRole('menu')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });

    test('Edit job in the stop menu opens the edit modal on screen, with the routed fields disabled, and Escape closes it', async ({ page }) => {
      await open(page, lang);
      await page.locator('aside.drawer').getByRole('button', { name: /Fix 2/ }).click();
      const trigger = page.locator('aside.drawer [aria-haspopup=menu]');
      await trigger.click();
      await page.getByRole('menuitem').first().click(); // Edit job is the first entry
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const [box, view] = [await dialog.boundingBox(), page.viewportSize()];
      if (!box || !view) throw new Error('nothing to measure');
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(view.width);
      expect(box.y + box.height).toBeLessThanOrEqual(view.height);
      await expect(dialog.locator('input[type=number]')).toBeDisabled();
      await expect(dialog.locator('input[type=time]').first()).toBeDisabled();
      await expect(dialog.locator('#job-title')).toBeEnabled();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
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

const words = {
  en: { add: 'Add technician', name: 'Name', pick: 'Set location on map', use: 'Use this point', next: 'Continue to review', back: 'Back to edit', home: 'Home location' },
  he: { add: 'הוספת טכנאי', name: 'שם', pick: 'הגדרת מיקום במפה', use: 'שימוש בנקודה הזו', next: 'המשך לסקירה', back: 'חזרה לעריכה', home: 'מיקום הבית' },
};

/** The box is fully on screen. */
async function expectOnScreen(page: Page, box: Locator): Promise<void> {
  const [b, view] = [await box.boundingBox(), page.viewportSize()];
  if (!b || !view) throw new Error('nothing to measure');
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(view.width);
  expect(b.y + b.height).toBeLessThanOrEqual(view.height);
}

for (const lang of ['he', 'en'] as const) {
  test(`add-technician dialog and review mini-map are laid out (${lang})`, async ({ page }) => {
    const w = words[lang];
    await open(page, lang, false);
    await page.getByRole('button', { name: w.add }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expectOnScreen(page, dialog);

    await dialog.getByLabel(w.name, { exact: true }).fill('Noa');
    await dialog.getByRole('button', { name: w.pick }).click();
    await expect(dialog).toBeHidden(); // the dialog steps aside for the map-pick
    await page.getByRole('button', { name: w.use }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: w.next }).click();

    // The mini-map has a real size inside the dialog, a rendered tile layer container and the pin.
    const mini = dialog.getByRole('img', { name: w.home });
    await expect(mini).toBeVisible();
    const [m, d] = [await mini.boundingBox(), await dialog.boundingBox()];
    if (!m || !d) throw new Error('nothing to measure');
    expect(m.height).toBeGreaterThan(100);
    expect(m.width).toBeGreaterThan(200);
    expect(m.x).toBeGreaterThanOrEqual(d.x);
    expect(m.x + m.width).toBeLessThanOrEqual(d.x + d.width + 1);
    await expect(mini.locator('.leaflet-container')).toBeVisible();
    const pin = mini.locator('.pin');
    await expect(pin).toBeVisible();
    const p = await pin.boundingBox();
    if (!p) throw new Error('no pin');
    expect(p.x).toBeGreaterThanOrEqual(m.x);
    expect(p.x + p.width).toBeLessThanOrEqual(m.x + m.width);
    expect(p.y).toBeGreaterThanOrEqual(m.y);
    expect(p.y + p.height).toBeLessThanOrEqual(m.y + m.height);
    await expectOnScreen(page, dialog);

    await dialog.getByRole('button', { name: w.back }).click();
    await expect(dialog.getByLabel(w.name, { exact: true })).toHaveValue('Noa');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}

const editWordsReview = { en: 'Continue to review', he: 'המשך לסקירה' };
const editWords = {
  en: { more: 'More actions', edit: 'Edit', title: 'Edit Bob', review: 'Review before saving changes', from: 'Shift start' },
  he: { more: 'פעולות נוספות', edit: 'עריכה', title: 'עריכת Bob', review: 'סקירה לפני שמירת השינויים', from: 'תחילת המשמרת' },
};

for (const lang of ['he', 'en'] as const) {
  test(`technician row menu and edit modal are laid out (${lang})`, async ({ page }) => {
    const w = editWords[lang];
    await open(page, lang, false);
    const trigger = page.getByRole('list', { name: /Technicians|טכנאים/ }).getByRole('button', { name: w.more });
    await trigger.click();
    const menu = page.getByRole('menu');
    await expectNextTo(page, menu, trigger);
    await expect(menu).toHaveCSS('border-top-width', '1px');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await page.getByRole('menuitem', { name: w.edit }).click();
    const dialog = page.getByRole('dialog', { name: w.title });
    await expect(dialog).toBeVisible();
    await expectOnScreen(page, dialog);
    await dialog.getByLabel(w.from).fill('09:00');
    await dialog.getByRole('button', { name: editWordsReview[lang] }).click();
    const review = page.getByRole('dialog', { name: w.review });
    await expect(review).toBeVisible();
    await expectOnScreen(page, review);
    await review.getByRole('button', { name: words[lang].back }).click();
    await expect(page.getByRole('dialog', { name: w.title }).getByLabel(w.from)).toHaveValue('09:00');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

const activityWords = {
  en: { more: 'More actions', deactivate: 'Deactivate', title: 'Deactivate Bob?', inactive: /^Inactive \(1\)$/, reactivate: 'Reactivate', review: 'Review before reactivating', open: /^Open / },
  he: { more: 'פעולות נוספות', deactivate: 'השבתה', title: 'להשבית את Bob?', inactive: /^לא פעילים \(1\)$/, reactivate: 'הפעלה מחדש', review: 'סקירה לפני הפעלה מחדש', open: /^פתיחת / },
};

for (const lang of ['he', 'en'] as const) {
  test(`deactivate confirm dialog and blocked-dates list are laid out (${lang})`, async ({ page }) => {
    const w = activityWords[lang];
    await open(page, lang, false);
    await page.getByRole('list', { name: /Technicians|טכנאים/ }).getByRole('button', { name: w.more }).click();
    await page.getByRole('menuitem', { name: w.deactivate }).click();
    const confirm = page.getByRole('alertdialog', { name: w.title });
    await expect(confirm).toBeVisible();
    await expectOnScreen(page, confirm);
    await page.keyboard.press('Escape');
    await expect(confirm).toHaveCount(0);

    await page.getByRole('list', { name: /Technicians|טכנאים/ }).getByRole('button', { name: w.more }).click();
    await page.getByRole('menuitem', { name: w.deactivate }).click();
    await confirm.getByRole('button', { name: w.deactivate }).click();
    const links = confirm.getByRole('link', { name: w.open });
    await expect(links).toHaveCount(2);
    await expectOnScreen(page, confirm);
    await links.first().click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test(`Inactive section row menu and reactivate review are laid out (${lang})`, async ({ page }) => {
    const w = activityWords[lang];
    await open(page, lang, false);
    await page.getByText(w.inactive).click();
    const trigger = page.locator('details.inactive-tech').getByRole('button', { name: w.more });
    await trigger.click();
    const menu = page.getByRole('menu');
    await expectNextTo(page, menu, trigger);
    await expect(menu.getByRole('menuitem')).toHaveCount(2);
    await page.getByRole('menuitem', { name: w.reactivate }).click();
    const review = page.getByRole('dialog', { name: w.review });
    await expect(review).toBeVisible();
    await expectOnScreen(page, review);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
}

test.describe('without the popover API or anchor positioning', () => {
  for (const lang of ['he', 'en'] as const) {
    test(`overlays still work (${lang})`, async ({ page }) => {
      await withoutModernPositioning(page);
      await open(page, lang);
      await page.locator('aside.drawer').getByRole('button', { name: /Fix 2/ }).click();
      const more = page.locator('aside.drawer [aria-haspopup=menu]');
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

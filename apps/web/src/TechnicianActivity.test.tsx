import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { daySummary, emptyDay, fakeApi, renderConsole } from './test/render';
import type { Routes } from './test/render';

const DAY = '2026-11-02';
const tech = (id: number, name: string, color: number | null, version = 0) => ({
  id, name, home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [], color, active: color !== null, version,
});
type Impl = (path: string, init?: RequestInit) => Promise<unknown>;
type Answer = { status: number; body: unknown } | undefined;

/** Opens the console on `roster`; a POST to /technicians/:id/<action> or /optimization is answered by `answer`, else served from the roster. */
function open(roster: ReturnType<typeof tech>[], lang: 'en' | 'he' = 'en', answer?: (path: string) => Answer): ReturnType<typeof vi.fn> {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', lang);
  const routes: Routes = { ...emptyDay, '/technicians': roster, [`/days/${DAY}/summary`]: daySummary(DAY) };
  const fetch = fakeApi(routes);
  const base = fetch.getMockImplementation() as Impl;
  fetch.mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const a = answer?.(path);
      if (a) return Promise.resolve({ ok: a.status < 400, status: a.status, json: () => Promise.resolve(a.body) });
    }
    return base(path);
  });
  renderConsole();
  return fetch;
}
const posted = (fetch: ReturnType<typeof vi.fn>, path: string): unknown => {
  const call = fetch.mock.calls.find(([p, i]) => p === path && i?.method === 'POST');
  return call && JSON.parse(call[1].body as string);
};
async function pick(name: string, item: RegExp | string, lang = 'More actions'): Promise<void> {
  const row = (await screen.findByText(name)).closest('li') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: lang }));
  await userEvent.click(screen.getByRole('menuitem', { name: item }));
}
const full = (): ReturnType<typeof tech>[] => Array.from({ length: 8 }, (_, i) => tech(i + 1, `Tech ${i + 1}`, i + 1));
const blockedBody = (dates: string[]): Answer => ({ status: 409, body: { message: 'Technician has unfinished stops on a route', dates } });

describe('deactivate', () => {
  it('asks for confirmation naming the consequences, then deactivates with the reviewed version', async () => {
    const fetch = open([tech(1, 'Bob', 1, 3)], 'en', (p) => (p === '/technicians/1/deactivate' ? { status: 201, body: tech(1, 'Bob', null, 4) } : undefined));
    await pick('Bob', 'Deactivate');

    const dialog = screen.getByRole('alertdialog', { name: 'Deactivate Bob?' });
    expect(within(dialog).getByText(/left out of planning and Find a slot.*Bob's history is kept.*the color may change/)).toBeTruthy();
    expect(posted(fetch, '/technicians/1/deactivate')).toBeUndefined();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate' }));

    expect(posted(fetch, '/technicians/1/deactivate')).toEqual({ version: 3 });
    expect((await screen.findByTestId('toasts')).textContent).toBe('Deactivated: Bob');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Keep active closes without a request', async () => {
    const fetch = open([tech(1, 'Bob', 1)]);
    await pick('Bob', 'Deactivate');
    await userEvent.click(screen.getByRole('button', { name: 'Keep active' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(posted(fetch, '/technicians/1/deactivate')).toBeUndefined();
  });

  it.each([
    [['2026-11-03'], /Bob has unfinished stops on Tuesday, November 3, 2026\. Unassign them first\./],
    [['2026-11-03', '2026-11-05'], /Bob has unfinished stops on these dates: Tuesday, November 3, 2026 and Thursday, November 5, 2026\. Unassign/],
    [['2026-11-03', '2026-11-04', '2026-11-05'], /Bob has unfinished stops on these dates: Tuesday, November 3, 2026, Wednesday, November 4, 2026, and Thursday, November 5, 2026\. Unassign/],
  ])('lists every blocking date as a link, with the right plural form (%j)', async (dates, sentence) => {
    open([tech(1, 'Bob', 1)], 'en', (p) => (p === '/technicians/1/deactivate' ? blockedBody(dates) : undefined));
    await pick('Bob', 'Deactivate');
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.textContent).toMatch(sentence);
    expect(within(dialog).getAllByRole('link')).toHaveLength(dates.length);
    expect(within(dialog).queryByRole('button', { name: 'Deactivate' })).toBeNull();
  });

  it('a date link closes the dialog and opens that day', async () => {
    const fetch = open([tech(1, 'Bob', 1)], 'en', (p) => (p === '/technicians/1/deactivate' ? blockedBody(['2026-11-03']) : undefined));
    await pick('Bob', 'Deactivate');
    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));
    await userEvent.click(await screen.findByRole('link', { name: 'Open Tuesday, November 3, 2026' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(fetch).toHaveBeenCalledWith('/days/2026-11-03/summary', undefined);
  });

  it('uses the one, two and other Hebrew forms and no gendered verb with the name', async () => {
    open([tech(1, 'דנה', 1)], 'he', (p) => (p === '/technicians/1/deactivate' ? blockedBody(['2026-11-03', '2026-11-05']) : undefined));
    await pick('דנה', 'השבתה', 'פעולות נוספות');
    expect((await screen.findByRole('alertdialog', { name: 'להשבית את דנה?' })).textContent).toContain('ההיסטוריה של דנה נשמרת');
    await userEvent.click(screen.getByRole('button', { name: 'השבתה' }));

    expect((await screen.findByRole('alertdialog')).textContent).toMatch(/ל־דנה יש עצירות שטרם הושלמו בשני התאריכים .+ ו-.+\. יש להסיר/);
  });
});

describe('inactive technicians', () => {
  it('sit in a collapsed Inactive section, in neutral grey with initials and an Inactive label', async () => {
    open([tech(1, 'Bob', 1), tech(2, 'Dana Levi', null, 2)]);
    const section = (await screen.findByText(/^Inactive \(1\)$/)).closest('details') as HTMLDetailsElement;

    expect(section.open).toBe(false);
    expect(within(screen.getByRole('list', { name: 'Technicians' })).queryByText('Dana Levi')).toBeNull();
    const row = within(section).getByText('Dana Levi').closest('li') as HTMLElement;
    expect(row.querySelector('.initials')?.textContent).toBe('DL');
    expect(row.querySelector('.swatch')).toBeNull();
    expect(row.style.getPropertyValue('--c')).toBe('var(--ink-3)');
    expect(within(row).getByText('Inactive')).toBeTruthy();
  });

  it('offers Edit and Reactivate, and reactivation goes through a review showing the color they will get', async () => {
    const fetch = open([tech(1, 'Bob', 1), tech(2, 'Dana', null, 2)], 'en', (p) => (p === '/technicians/2/reactivate' ? { status: 201, body: tech(2, 'Dana', 2, 3) } : undefined));
    await userEvent.click(await screen.findByText(/^Inactive \(1\)$/));
    await pick('Dana', 'Reactivate');

    const dialog = screen.getByRole('dialog', { name: 'Review before reactivating' });
    expect(within(dialog).getByText('Dana')).toBeTruthy();
    expect(within(dialog).getByText('Route color').nextElementSibling?.querySelector('.swatch')?.getAttribute('style')).toContain('--route-2');
    expect(posted(fetch, '/technicians/2/reactivate')).toBeUndefined();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reactivate' }));

    expect(posted(fetch, '/technicians/2/reactivate')).toEqual({ version: 2 });
    expect((await screen.findByTestId('toasts')).textContent).toBe('Reactivated: Dana');
  });

  it('disables Reactivate with the reason at the cap of 8 active', async () => {
    open([...full(), tech(9, 'Dana', null)]);
    await userEvent.click(await screen.findByText(/^Inactive \(1\)$/));
    const row = screen.getByText('Dana').closest('li') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'More actions' }));

    const item = screen.getByRole('menuitem', { name: 'Reactivate' }) as HTMLButtonElement;
    expect(item.disabled).toBe(true);
    expect(item.getAttribute('aria-describedby')).toBe(document.getElementById('reactivate-why-9')?.id);
    expect(document.getElementById('reactivate-why-9')?.textContent).toBe('8 technicians are active. Deactivate one first.');
  });

  it('shows the cap message when the server refuses a reactivation that the screen allowed', async () => {
    open([tech(1, 'Bob', 1), tech(2, 'Dana', null)], 'en', (p) => (p === '/technicians/2/reactivate' ? { status: 409, body: { message: '8 technicians are already active' } } : undefined));
    await userEvent.click(await screen.findByText(/^Inactive \(1\)$/));
    await pick('Dana', 'Reactivate');
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate' }));

    expect((await screen.findByRole('alert')).textContent).toContain('8 technicians are already active.');
  });
});

describe('a technician deactivated while planning', () => {
  it('Plan day shows error.techInactive', async () => {
    open([tech(1, 'Bob', 1)], 'en', (p) => (p === `/optimization/day/${DAY}` ? { status: 409, body: { message: 'Technician is inactive' } } : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'Plan day' }));

    expect((await screen.findByRole('alert')).textContent).toContain('The technician was deactivated in the meantime. Nothing was saved.');
  });

  it('in Hebrew too', async () => {
    open([tech(1, 'Bob', 1)], 'he', (p) => (p === `/optimization/day/${DAY}` ? { status: 409, body: { message: 'Technician is inactive' } } : undefined));
    await userEvent.click(await screen.findByRole('button', { name: 'תכנון יום' }));

    expect((await screen.findByRole('alert')).textContent).toContain('הטכנאי הושבת בינתיים. לא נשמר דבר.');
  });
});

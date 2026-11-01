import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { daySummary, emptyDay, fakeApi, renderConsole } from './test/render';
import type { Routes } from './test/render';

const DAY = '2026-11-02';
const skill = { id: 1, code: 'hvac', nameEn: 'HVAC', nameHe: 'מיזוג' };
const tech = (id: number, name: string, color: number | null, version = 0) => ({
  id, name, home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [], color, active: color !== null, version,
});
type Fetch = ReturnType<typeof vi.fn>;
type Impl = (path: string, init?: RequestInit) => Promise<unknown>;
type Refusal = { status: number; message: string; roster?: ReturnType<typeof tech>[] };

/** Opens the console on `roster`; PATCH /technicians/1 answers like the server (version bumped) unless `refuse` is set. */
function open(roster: ReturnType<typeof tech>[], lang: 'en' | 'he' = 'en', refuse?: Refusal): Fetch {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', lang);
  const routes: Routes = { ...emptyDay, '/technicians': roster, '/skills': [skill], [`/days/${DAY}/summary`]: daySummary(DAY) };
  const fetch = fakeApi(routes);
  const base = fetch.getMockImplementation() as Impl;
  fetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/technicians/1' && init?.method === 'PATCH') {
      if (refuse) {
        if (refuse.roster) routes['/technicians'] = refuse.roster;
        return Promise.resolve({ ok: false, status: refuse.status, json: () => Promise.resolve({ message: refuse.message }) });
      }
      const { version, ...body } = JSON.parse(init.body as string) as { version: number };
      const saved = { ...roster[0], ...body, version: version + 1 };
      routes['/technicians'] = [saved, ...roster.slice(1)];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(saved) });
    }
    return base(path);
  });
  renderConsole();
  return fetch;
}

const patched = (fetch: Fetch): Record<string, unknown> | undefined => {
  const call = fetch.mock.calls.find(([p, i]) => p === '/technicians/1' && i?.method === 'PATCH');
  return call && JSON.parse(call[1].body as string);
};
/** A change line of the review; numbers are isolated in their own elements, so match on the whole line's text. */
const change = (text: string): HTMLElement | undefined => screen.queryAllByRole('listitem').find((li) => li.textContent === text);
async function openEdit(name = 'Bob', menu = 'More actions', edit = 'Edit'): Promise<void> {
  const row = (await screen.findByText(name)).closest('li') as HTMLElement;
  await userEvent.click(within(row).getByRole('button', { name: menu }));
  await userEvent.click(screen.getByRole('menuitem', { name: edit }));
}

describe('edit technician', () => {
  it('a name-only edit saves at once, without review, carrying the version', async () => {
    const fetch = open([tech(1, 'Bob', 1, 4)]);
    await openEdit();
    const dialog = screen.getByRole('dialog', { name: 'Edit Bob' });
    expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe('Bob');
    await userEvent.clear(within(dialog).getByLabelText('Name'));
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Rob');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(patched(fetch)).toEqual({ name: 'Rob', version: 4 });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await screen.findByTestId('toasts')).textContent).toBe('Name updated.');
    expect(await screen.findByText('Rob')).toBeTruthy();
  });

  it('changing the shift, skills or home goes through a review with before and after; back keeps the input', async () => {
    const fetch = open([tech(1, 'Bob', 1, 2)]);
    await openEdit();
    const dialog = screen.getByRole('dialog');
    await userEvent.clear(within(dialog).getByLabelText('Shift start'));
    await userEvent.type(within(dialog).getByLabelText('Shift start'), '09:00');
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'HVAC' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Continue to review' }));

    const review = screen.getByRole('dialog', { name: 'Review before saving changes' });
    expect(change('Shift: 08:00-16:00 → 09:00-16:00')).toBeTruthy();
    expect(change('Skills: No skills → HVAC')).toBeTruthy();
    expect(change('Name: Bob → Bob')).toBeUndefined(); // only what changed
    expect(within(review).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByTestId('minimap')).toBeNull(); // home did not change
    expect(within(review).getByText('Route color').querySelector('.swatch')?.getAttribute('style')).toContain('--route-1');
    expect(patched(fetch)).toBeUndefined();

    await userEvent.click(within(review).getByRole('button', { name: 'Back to edit' }));
    expect((screen.getByLabelText('Shift start') as HTMLInputElement).value).toBe('09:00');
    expect((screen.getByRole('checkbox', { name: 'HVAC' }) as HTMLInputElement).checked).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(patched(fetch)).toEqual({ shiftStart: '09:00:00', skillIds: [1], version: 2 });
    expect((await screen.findByTestId('toasts')).textContent).toBe("Bob's details were updated.");
  });

  it('shows the new home on a mini-map in the review', async () => {
    const fetch = open([tech(1, 'Bob', 1)]);
    await openEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Change location' }));
    await userEvent.click(screen.getByRole('button', { name: 'map click' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    expect(change('Home location: 32.1000, 34.8000 → 32.2000, 34.9000')).toBeTruthy();
    expect(screen.getByTestId('minimap').getAttribute('data-at')).toBe('[34.9,32.2]');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(patched(fetch)).toEqual({ home: [34.9, 32.2], version: 0 });
  });

  it('a stale version shows "out of date" and returns to the form on the refreshed data', async () => {
    open([tech(1, 'Bob', 1, 0)], 'en', { status: 409, message: 'Technician changed since the review', roster: [{ ...tech(1, 'Bob', 1, 1), shiftEnd: '17:00:00' }] });
    await openEdit();
    await userEvent.clear(screen.getByLabelText('Shift end'));
    await userEvent.type(screen.getByLabelText('Shift end'), '18:00');
    await userEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect((await screen.findByRole('alert')).textContent).toBe('The data changed since this review. Review again.');
    expect(await screen.findByLabelText('Shift end')).toBeTruthy(); // back on the form
    expect((screen.getByLabelText('Shift end') as HTMLInputElement).value).toBe('18:00'); // input kept
  });

  it('shows the refusal when the technician has assigned stops', async () => {
    open([tech(1, 'Bob', 1)], 'en', { status: 409, message: 'Technician has stops on a route; unassign or cancel those jobs first' });
    await openEdit();
    await userEvent.click(screen.getByRole('checkbox', { name: 'HVAC' }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue to review' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Technician has stops on a route');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('works in Hebrew', async () => {
    const fetch = open([tech(1, 'בוב', 1)], 'he');
    await openEdit('בוב', 'פעולות נוספות', 'עריכה');
    expect(screen.getByRole('dialog', { name: 'עריכת בוב' })).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: 'מיזוג' }));
    await userEvent.click(screen.getByRole('button', { name: 'המשך לסקירה' }));
    expect(screen.getByRole('dialog', { name: 'סקירה לפני שמירת השינויים' })).toBeTruthy();
    expect(change('כישורים: אין כישורים ← מיזוג')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'שמירת שינויים' }));
    expect(patched(fetch)).toEqual({ skillIds: [1], version: 0 });
    expect((await screen.findByTestId('toasts')).textContent).toBe('הפרטים של בוב עודכנו.');
  });

  it('an inactive technician can only be renamed', async () => {
    open([tech(1, 'Bob', null)]);
    await openEdit();
    expect((screen.getByRole('checkbox', { name: 'HVAC' }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Shift start') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Only the name can be edited/)).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).disabled).toBe(false);
  });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { daySummary, emptyDay, fakeApi, renderConsole } from './test/render';
import type { Routes } from './test/render';

const DAY = '2026-11-02';
const skill = { id: 1, code: 'hvac', nameEn: 'HVAC', nameHe: 'מיזוג' };
const tech = (id: number, name: string, color: number | null) => ({
  id, name, home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [], color, active: color !== null, version: 0,
});
type Fetch = ReturnType<typeof vi.fn>;
type Impl = (path: string, init?: RequestInit) => Promise<unknown>;

/** Opens the console on `roster`; POST /technicians answers like the server and lists the new technician from then on. */
function open(roster: ReturnType<typeof tech>[], lang: 'en' | 'he' = 'en', refuse?: { status: number; message: string }): Fetch {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', lang);
  const routes: Routes = { ...emptyDay, '/technicians': roster, '/skills': [skill], [`/days/${DAY}/summary`]: daySummary(DAY) };
  const fetch = fakeApi(routes);
  const base = fetch.getMockImplementation() as Impl;
  fetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/technicians' && init?.method === 'POST') {
      if (refuse) return Promise.resolve({ ok: false, status: refuse.status, json: () => Promise.resolve({ message: refuse.message }) });
      const body = JSON.parse(init.body as string) as { name: string };
      const created = { ...tech(roster.length + 1, body.name, 3), ...body };
      routes['/technicians'] = [...roster, created];
      return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(created) });
    }
    return base(path);
  });
  renderConsole();
  return fetch;
}

const posted = (fetch: Fetch): Record<string, unknown> | undefined => {
  const call = fetch.mock.calls.find(([p, i]) => p === '/technicians' && i?.method === 'POST');
  return call && JSON.parse(call[1].body as string);
};
const addButton = (): Promise<HTMLElement> => screen.findByRole('button', { name: 'Add technician' });
async function fillForm(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Name'), 'Noa');
  await userEvent.click(screen.getByRole('checkbox', { name: 'HVAC' }));
  await userEvent.click(screen.getByRole('button', { name: 'Set location on map' }));
  await userEvent.click(screen.getByRole('button', { name: 'map click' }));
}
const toReview = (): Promise<void> => userEvent.click(screen.getByRole('button', { name: 'Continue to review' }));

describe('add technician', () => {
  it('reviews before saving: summary, mini-map on the home, and the color it will get; back keeps the input', async () => {
    const fetch = open([tech(1, 'Bob', 1), tech(2, 'Amy', 2)]);
    await userEvent.click(await addButton());
    await toReview();
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual(['Enter a name.', 'Set a location on the map.']);

    await fillForm();
    await toReview();
    const dialog = screen.getByRole('dialog', { name: 'Review before creating the technician' });
    expect(within(dialog).getByText('Noa')).toBeTruthy();
    expect(within(dialog).getByText('08:00-16:00')).toBeTruthy();
    expect(within(dialog).getByText('HVAC')).toBeTruthy();
    expect(within(dialog).getByText('32.2000, 34.9000')).toBeTruthy(); // lat, lon
    expect(screen.getByTestId('minimap').getAttribute('data-at')).toBe('[34.9,32.2]');
    expect(within(dialog).getByText('Route color').nextElementSibling?.querySelector('.swatch')?.getAttribute('style')).toContain('--route-3');
    expect(posted(fetch)).toBeUndefined(); // nothing saved by reviewing

    await userEvent.click(screen.getByRole('button', { name: 'Back to edit' }));
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Noa');
    expect((screen.getByRole('checkbox', { name: 'HVAC' }) as HTMLInputElement).checked).toBe(true);
    await toReview();

    await userEvent.click(screen.getByRole('button', { name: 'Create technician' }));
    expect(posted(fetch)).toEqual({ name: 'Noa', home: [34.9, 32.2], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [1] });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((await screen.findByTestId('toasts')).textContent).toBe('Added: Noa');
    expect(await screen.findByText('Noa')).toBeTruthy();
  });

  it('rejects a shift that ends before it starts', async () => {
    open([]);
    await userEvent.click(await addButton());
    await fillForm();
    await userEvent.clear(screen.getByLabelText('Shift end'));
    await userEvent.type(screen.getByLabelText('Shift end'), '07:00');
    await toReview();
    expect(screen.getByRole('alert').textContent).toBe('The shift must end after it starts.');
  });

  it('disables Add with the reason at 8 active technicians; inactive ones do not count', async () => {
    const eight = Array.from({ length: 8 }, (_, i) => tech(i + 1, `T${i + 1}`, i + 1));
    open(eight);
    const button = await addButton();
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('8 technicians are active. Deactivate one first.')).toBeTruthy();
    expect(button.getAttribute('aria-describedby')).toBe(screen.getByText('8 technicians are active. Deactivate one first.').id);
  });

  it('keeps Add enabled while fewer than 8 are active, even with many inactive', async () => {
    open([...Array.from({ length: 7 }, (_, i) => tech(i + 1, `T${i + 1}`, i + 1)), tech(8, 'Gone', null), tech(9, 'Gone 2', null)]);
    expect((await addButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the cap message in the dialog when the server refuses with 409', async () => {
    open([], 'en', { status: 409, message: '8 technicians are already active' });
    await userEvent.click(await addButton());
    await fillForm();
    await toReview();
    await userEvent.click(screen.getByRole('button', { name: 'Create technician' }));
    expect((await screen.findByRole('alert')).textContent).toContain('8 technicians are already active.');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('works in Hebrew: gender-neutral toast and labels', async () => {
    open([], 'he');
    await userEvent.click(await screen.findByRole('button', { name: 'הוספת טכנאי' }));
    await userEvent.type(screen.getByLabelText('שם'), 'דנה');
    await userEvent.click(screen.getByRole('button', { name: 'הגדרת מיקום במפה' }));
    await userEvent.click(screen.getByRole('button', { name: 'map click' }));
    await userEvent.click(screen.getByRole('button', { name: 'המשך לסקירה' }));
    expect(screen.getByRole('dialog', { name: 'סקירה לפני יצירת הטכנאי' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'יצירת טכנאי' }));
    expect((await screen.findByTestId('toasts')).textContent).toBe('הוספה בוצעה: דנה');
  });

  it('Escape closes the dialog and returns focus to the Add button', async () => {
    open([]);
    const add = await addButton();
    add.focus();
    await userEvent.click(add);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(add);
  });
});

describe('review warnings', () => {
  const warnings = (): string[] => within(screen.getByRole('dialog')).queryAllByRole('listitem').map((li) => li.textContent ?? '');
  const back = (): Promise<void> => userEvent.click(screen.getByRole('button', { name: 'Back to edit' }));
  const setTime = async (label: string, value: string): Promise<void> => {
    await userEvent.clear(screen.getByLabelText(label));
    await userEvent.type(screen.getByLabelText(label), value);
  };
  const start = async (roster: ReturnType<typeof tech>[], lang: 'en' | 'he' = 'en'): Promise<void> => {
    open(roster, lang);
    await userEvent.click(await screen.findByRole('button', { name: lang === 'he' ? 'הוספת טכנאי' : 'Add technician' }));
  };

  it('warns when home is over 50 km from the nearest active technician, and not when near', async () => {
    await start([{ ...tech(1, 'Far', 1), home: [30, 30] }]);
    await fillForm();
    await toReview();
    expect(warnings()).toEqual(['Home is more than 50 km from the nearest active technician.']);
    expect(screen.getByText('Worth a look')).toBeTruthy();
  });

  it('skips the distance check with no active technician', async () => {
    await start([{ ...tech(1, 'Gone', null), home: [30, 30] }]);
    await fillForm();
    await toReview();
    expect(warnings()).toEqual([]);
    expect(screen.queryByText('Worth a look')).toBeNull();
  });

  it('no distance warning when within 50 km', async () => {
    await start([tech(1, 'Near', 1)]);
    await fillForm();
    await toReview();
    expect(warnings()).toEqual([]);
  });

  it('warns on a short or long shift, and clears it when fixed', async () => {
    await start([]);
    await fillForm();
    await setTime('Shift end', '11:00');
    await toReview();
    expect(warnings()).toEqual(['The shift is shorter than 4 hours.']);
    await back();
    await setTime('Shift end', '19:00');
    await toReview();
    expect(warnings()).toEqual(['The shift is longer than 10 hours.']);
    await back();
    await setTime('Shift end', '16:00');
    await toReview();
    expect(warnings()).toEqual([]);
  });

  it('warns when no skills are selected, never blocking create', async () => {
    const fetch = open([]);
    await userEvent.click(await addButton());
    await fillForm();
    await userEvent.click(screen.getByRole('checkbox', { name: 'HVAC' }));
    await toReview();
    expect(warnings()).toEqual(['No skills selected, so no job that needs a skill will be assigned.']);
    await userEvent.click(screen.getByRole('button', { name: 'Create technician' }));
    expect(posted(fetch)).toBeDefined();
  });

  it('warns on a duplicate name, case-insensitively, and suggests reactivating an inactive match', async () => {
    await start([tech(1, 'noa', 1), tech(2, 'NOA', null)]);
    await fillForm();
    await toReview();
    expect(warnings()).toEqual(['A technician with this name already exists.', 'An inactive technician has this name. Reactivate the existing one instead?']);
  });

  it('suggests reactivating when only an inactive technician has the name', async () => {
    await start([tech(2, 'NOA', null)]);
    await fillForm();
    await toReview();
    expect(warnings()).toEqual(['An inactive technician has this name. Reactivate the existing one instead?']);
  });

  it('shows warnings in Hebrew', async () => {
    await start([{ ...tech(1, 'Far', 1), home: [30, 30] }], 'he');
    await userEvent.type(screen.getByLabelText('שם'), 'דנה');
    await userEvent.click(screen.getByRole('button', { name: 'הגדרת מיקום במפה' }));
    await userEvent.click(screen.getByRole('button', { name: 'map click' }));
    await userEvent.click(screen.getByRole('button', { name: 'המשך לסקירה' }));
    expect(warnings()).toEqual(['הבית רחוק יותר מ־50 ק״מ מהטכנאי הפעיל הקרוב ביותר.', 'לא נבחרו כישורים, ולכן לא תשובץ עבודה שדורשת כישור.']);
  });
});

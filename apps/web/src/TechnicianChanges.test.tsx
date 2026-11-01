import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TechnicianChange } from '@shibutz/contracts';
import { daySummary, emptyDay, fakeApi, renderConsole } from './test/render';

const DAY = '2026-11-02';
const dani = { id: 1, name: 'Dani', home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [], color: 1, active: true, version: 1 };
const row = (id: number, over: Partial<TechnicianChange>): TechnicianChange =>
  ({ id, at: '2026-11-01T09:30:00.000Z', technicianId: 1, action: 'updated', name: 'Dani', before: null, after: null, ...over });
const log = [
  row(2, { before: { name: 'Dana', shiftEnd: '15:00:00' }, after: { name: 'Dani', shiftEnd: '16:00:00' } }),
  row(1, { action: 'created', name: 'Dana', after: { name: 'Dana' } }),
];

function open(changes: TechnicianChange[], lang: 'en' | 'he' = 'en'): ReturnType<typeof fakeApi> {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', lang);
  const fetch = fakeApi({
    ...emptyDay,
    '/technicians': [dani],
    [`/days/${DAY}/summary`]: daySummary(DAY),
    '/technician-changes?limit=20': changes,
    '/technician-changes?technicianId=1': changes,
  });
  renderConsole();
  return fetch;
}

const lines = (list: HTMLElement): (string | null)[] => within(list).getAllByRole('listitem').map((li) => li.textContent);

describe('technician change log', () => {
  it('lists recent changes in the technicians panel with the name as it was then and what changed', async () => {
    open(log);
    const items = lines(await screen.findByRole('list', { name: 'Recent changes' }));
    expect(items[0]).toContain("Dani's details were updated: Name: Dana → Dani; Shift end: 15:00 → 16:00");
    expect(items[1]).toContain('Added: Dana');
  });

  it('shows the same entries in Hebrew', async () => {
    open(log, 'he');
    const items = lines(await screen.findByRole('list', { name: 'שינויים אחרונים' }));
    expect(items[0]).toContain('הפרטים של Dani עודכנו: שם: Dana ← Dani; סיום המשמרת: 15:00 ← 16:00');
    expect(items[1]).toContain('הוספה: Dana');
  });

  it('shows an empty state when nothing has changed', async () => {
    open([]);
    expect(await screen.findByText('No changes yet.')).toBeTruthy();
  });

  it("shows one technician's history in the edit view", async () => {
    const fetch = open(log);
    const rowEl = (await screen.findByText('Dani')).closest('li') as HTMLElement;
    await userEvent.click(within(rowEl).getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit Dani' });
    const history = await within(dialog).findByRole('list', { name: 'Change history' });
    expect(within(history).getAllByRole('listitem')).toHaveLength(2);
    expect(fetch).toHaveBeenCalledWith('/technician-changes?technicianId=1', undefined);
  });
});

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { daySummary, emptyDay, fakeApi, renderConsole } from './test/render';

const tech = (id: number, name: string) => ({ id, name, home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', active: true, version: 0, skillIds: [], color: 1 });

describe('language toggle', () => {
  it('opens in Hebrew, right to left', async () => {
    fakeApi(emptyDay);
    renderConsole();
    expect(document.documentElement.lang).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(await screen.findByRole('tab', { name: 'טכנאים' })).toBeTruthy();
  });

  it('flips direction, language and strings, and remembers the choice', async () => {
    fakeApi(emptyDay);
    const { unmount } = renderConsole();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to English' }));

    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(screen.getByRole('tab', { name: 'Technicians' })).toBeTruthy();

    unmount();
    renderConsole();
    expect(document.documentElement.lang).toBe('en');
  });

  it('falls back to Hebrew and still toggles when browser storage throws', async () => {
    fakeApi(emptyDay);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    renderConsole();
    expect(document.documentElement.dir).toBe('rtl');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to English' }));
    expect(document.documentElement.dir).toBe('ltr');
  });

  it('sorts technicians by name for the active language', async () => {
    fakeApi({ ...emptyDay, '/technicians': [tech(1, 'Zed'), tech(2, 'Avi')] });
    renderConsole();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Zed|Avi/ }).map((b) => b.querySelector('b')?.textContent)).toEqual(['Avi', 'Zed']));
  });
});

describe('skill names and technician colors', () => {
  const skill = (id: number, nameEn: string, nameHe: string) => ({ id, code: `s${id}`, nameEn, nameHe });
  const day = (skills: ReturnType<typeof skill>[]) => ({
    ...emptyDay,
    '/skills': skills,
    '/technicians': [{ ...tech(1, 'Dana'), skillIds: skills.map((s) => s.id), color: 4 }],
  });

  it('shows the skill name of the current language', async () => {
    fakeApi(day([skill(1, 'Plumbing', 'אינסטלציה')]));
    renderConsole();
    expect(await screen.findByText(/אינסטלציה/)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Switch to English' }));
    expect(screen.getByText(/Plumbing/)).toBeTruthy();
    expect(screen.queryByText(/אינסטלציה/)).toBeNull();
  });

  it('falls back to the other language when a name is empty', async () => {
    fakeApi(day([skill(1, 'Plumbing', '')]));
    renderConsole();
    expect(await screen.findByText(/Plumbing/)).toBeTruthy();
  });

  it('shows a swatch in the technician color on each technician row', async () => {
    fakeApi(day([]));
    renderConsole();
    const row = (await screen.findByRole('button', { name: /Dana/ })).closest('li');
    expect(row?.querySelector<HTMLElement>('.swatch')?.style.background).toBe('var(--route-4)');
  });
});

describe('unassigned reasons', () => {
  const job = (id: number, unassignedReason: string | null) => ({
    id, title: `Job ${id}`, address: 'Herzl 1', location: [34.8, 32.1], skillIds: [], serviceDurationS: 600,
    windowStart: '2026-11-02T07:00:00.000Z', windowEnd: '2026-11-02T10:00:00.000Z', priority: 50, status: 'unassigned', day: '2026-11-02',
    unassignedReason, unassignedAt: unassignedReason ? '2026-11-01T08:00:00.000Z' : null,
  });

  it('shows the stored reason after a reload, localized, and "Not placed yet" when none is stored', async () => {
    localStorage.setItem('shibutz.date', '2026-11-02');
    fakeApi({ ...emptyDay, '/jobs': [job(1, 'NO_SKILLED_TECHNICIAN'), job(2, null)], '/days/2026-11-02/summary': daySummary('2026-11-02') });
    renderConsole();
    expect(await screen.findByText('אין טכנאי עם כל הכישורים הנדרשים.')).toBeTruthy();
    expect(screen.getByText('טרם שובצה.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Switch to English' }));
    expect(screen.getByText('No technician has all the required skills.')).toBeTruthy();
    expect(screen.getByText('Not placed yet.')).toBeTruthy();
  });
});

describe('reload ordering', () => {
  it('a slow answer for an earlier date never overwrites the date now shown', async () => {
    const DAY = '2026-11-02';
    localStorage.setItem('shibutz.date', DAY);
    localStorage.setItem('shibutz.lang', 'en');
    const fetch = fakeApi({ ...emptyDay, [`/days/${DAY}/summary`]: daySummary(DAY, { total: 3 }), '/days/2026-11-03/summary': daySummary('2026-11-03') });
    const fast = fetch.getMockImplementation() as (path: string) => Promise<unknown>;
    let release: () => void = () => undefined;
    const slow = new Promise<void>((r) => { release = r; });
    fetch.mockImplementation((path: string) => (path === `/days/${DAY}/summary` ? slow.then(() => fast(path)) : fast(path)));
    renderConsole();
    await userEvent.click(screen.getByRole('button', { name: 'Next day' }));
    expect(await screen.findByText('No jobs on this date')).toBeTruthy();
    release();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('No jobs on this date')).toBeTruthy();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { daySummary, emptyDay, fakeApi, renderConsole } from './test/render';

const DAY = '2026-11-02';
const plan = { date: DAY, totalDriveS: 0, routes: [], unassigned: [] };
const stop = (jobId: number, status: 'assigned' | 'done' | 'in_progress') => ({ jobId, status, location: [34.8, 32.1] as [number, number] });
const tech = (stops: ReturnType<typeof stop>[]) => ({ technicianId: 1, stopCount: stops.length, doneCount: 0, driveS: 0, expectedFinish: null, openIncidents: 0, stops });
const day = (over: Parameters<typeof daySummary>[1], stops: ReturnType<typeof stop>[] = []) => ({
  ...emptyDay,
  [`/days/${DAY}/summary`]: daySummary(DAY, over, [tech(stops)]),
  [`/optimization/day/${DAY}`]: plan,
  [`/routes/1/${DAY}`]: { technicianId: 1, date: DAY, stops: [], geometry: null },
});
const posted = (fetch: ReturnType<typeof fakeApi>): boolean => fetch.mock.calls.some(([p, init]) => p === `/optimization/day/${DAY}` && init?.method === 'POST');

describe('date controls', () => {
  it('opens on the last viewed date and moves with previous, next and Today', async () => {
    localStorage.setItem('shibutz.date', DAY);
    const fetch = fakeApi({ ...emptyDay, [`/days/${DAY}/summary`]: daySummary(DAY), '/days/2026-11-03/summary': daySummary('2026-11-03'), '/days/2026-11-01/summary': daySummary('2026-11-01') });
    renderConsole();
    await userEvent.click(screen.getByRole('button', { name: 'היום הבא' }));
    expect(await screen.findByLabelText('תאריך')).toHaveProperty('value', '2026-11-03');
    await userEvent.click(screen.getByRole('button', { name: 'היום הקודם' }));
    await userEvent.click(screen.getByRole('button', { name: 'היום הקודם' }));
    expect(screen.getByLabelText('תאריך')).toHaveProperty('value', '2026-11-01');
    expect(localStorage.getItem('shibutz.date')).toBe('2026-11-01');
    expect(fetch).toHaveBeenCalledWith('/days/2026-11-03/summary', undefined);
    await userEvent.click(screen.getByRole('button', { name: 'היום' }));
    expect(screen.getByLabelText('תאריך')).not.toHaveProperty('value', '2026-11-01');
  });
});

describe('KPIs and empty state', () => {
  it('shows assigned out of total, unassigned, done out of total and drive time', async () => {
    localStorage.setItem('shibutz.date', DAY);
    fakeApi(day({ total: 8, assigned: 5, unassigned: 3, done: 2, driveS: 7500 }));
    renderConsole();
    const kpi = async (name: string): Promise<string> => (await screen.findByRole('group', { name })).textContent ?? '';
    expect(await kpi('משובצות')).toBe('משובצות5/8');
    expect(await kpi('לא משובצות')).toBe('לא משובצות▲ 3');
    expect(await kpi('הושלמו')).toBe('הושלמו2/8');
    expect(await kpi('זמן נסיעה')).toBe('זמן נסיעה125 דק׳');
    expect(screen.getByRole('group', { name: 'לא משובצות' }).className).toContain('attention');
    expect(screen.getByRole('group', { name: 'משובצות' }).className).not.toContain('attention');
  });

  it('shows a composed empty state with an Add job action for a date with no jobs', async () => {
    fakeApi(emptyDay);
    renderConsole();
    expect(await screen.findByText('אין עבודות בתאריך הזה')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'הוספת עבודה' })).toBeTruthy();
  });

  it('refresh reloads the day', async () => {
    localStorage.setItem('shibutz.date', DAY);
    const fetch = fakeApi(day({ total: 1 }));
    renderConsole();
    await screen.findByRole('group', { name: 'משובצות' });
    const before = fetch.mock.calls.filter(([p]) => p === `/days/${DAY}/summary`).length;
    await userEvent.click(screen.getByRole('button', { name: 'רענון' }));
    await waitFor(() => expect(fetch.mock.calls.filter(([p]) => p === `/days/${DAY}/summary`).length).toBe(before + 1));
  });
});

describe('Plan day', () => {
  it('is the only filled button and runs immediately when nothing is assigned', async () => {
    localStorage.setItem('shibutz.date', DAY);
    const fetch = fakeApi(day({ total: 2, unassigned: 2 }));
    const { container } = renderConsole();
    expect(container.querySelectorAll('button.primary')).toHaveLength(1);
    await userEvent.click(await screen.findByRole('button', { name: 'תכנון יום' }));
    await waitFor(() => expect(posted(fetch)).toBe(true));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks first when jobs are assigned, naming the count and that notes are kept', async () => {
    localStorage.setItem('shibutz.date', DAY);
    const fetch = fakeApi(day({ total: 3, assigned: 3 }, [stop(1, 'assigned')]));
    renderConsole();
    await userEvent.click(await screen.findByRole('button', { name: 'תכנון יום' }));
    const dialog = screen.getByRole('alertdialog', { name: 'לתכנן מחדש את היום?' });
    expect(dialog.textContent).toContain('3 עבודות משובצות');
    expect(dialog.textContent).toContain('ההערות נשמרות');
    expect(posted(fetch)).toBe(false);

    await userEvent.click(within(dialog).getByRole('button', { name: 'השארת התכנון הנוכחי' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(posted(fetch)).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'תכנון יום' }));

    await userEvent.click(screen.getByRole('button', { name: 'תכנון יום' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'תכנון יום' }));
    await userEvent.click(screen.getByRole('button', { name: 'תכנון מחדש' }));
    await waitFor(() => expect(posted(fetch)).toBe(true));
  });

  it('is disabled with the reason beside it once a stop has started', async () => {
    localStorage.setItem('shibutz.date', DAY);
    fakeApi(day({ total: 2, assigned: 2, done: 1 }, [stop(1, 'done'), stop(2, 'assigned')]));
    renderConsole();
    const button = await screen.findByRole('button', { name: 'תכנון יום' });
    await waitFor(() => expect(button).toHaveProperty('disabled', true));
    expect(screen.getByText('אי אפשר לתכנן מחדש, עצירה באותו יום כבר התחילה.')).toBeTruthy();
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
  });
});

import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { daySummary, fakeApi, renderConsole } from './test/render';
import type { Routes } from './test/render';

const DAY = '2026-11-02';
const stop = (jobId: number, over: object = {}) => ({
  jobId, title: `Fix ${jobId}`, address: `Addr ${jobId}`, sequence: jobId, location: [34.8, 32.1], status: 'assigned', skillIds: [1], serviceDurationS: 1800, driveS: 600, hasNote: false,
  eta: `2026-11-02T0${5 + jobId}:00:00.000Z`, etd: `2026-11-02T0${5 + jobId}:30:00.000Z`, actualArrival: null, actualDeparture: null, ...over,
});
const tech = (id: number, name: string) => ({ id, name, home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [1], color: id });
const sumTech = (technicianId: number, stopCount: number, doneCount = 0) => ({ technicianId, stopCount, doneCount, driveS: 0, expectedFinish: null, openIncidents: 0, stops: [] });

// Bob: two stops, the last ends 18:30 Israel time, 150 minutes after his shift. Alice has none.
const api: Routes = {
  '/technicians': [tech(1, 'Bob'), tech(2, 'Alice')],
  '/jobs': [],
  '/skills': [{ id: 1, code: 'hvac', nameEn: 'HVAC', nameHe: 'מיזוג' }],
  [`/days/${DAY}/summary`]: daySummary(DAY, { total: 2, assigned: 2, done: 1 }, [sumTech(1, 2, 1), sumTech(2, 0)]),
  [`/routes/1/${DAY}`]: {
    technicianId: 1, date: DAY, geometry: null,
    stops: [stop(1, { status: 'done', hasNote: true }), stop(2, { eta: '2026-11-02T15:00:00.000Z', etd: '2026-11-02T16:30:00.000Z' })],
    summary: { doneCount: 1, driveS: 2400, expectedFinish: '2026-11-02T16:30:00.000Z' },
  },
};
const open = (lang: 'he' | 'en' = 'en'): void => {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', lang);
  fakeApi(api);
  renderConsole();
};
const techButton = async (name: string): Promise<HTMLElement> => within((await screen.findByText(name)).closest('li') as HTMLElement).getByRole('button');
const drawer = (name = 'Bob'): HTMLElement => screen.getByRole('complementary', { name });

describe('work-day drawer', () => {
  it('opens on a technician click, labeled by name, with focus on the heading and a summary header', async () => {
    open();
    await userEvent.click(await techButton('Bob'));
    const d = drawer();
    expect(document.activeElement).toBe(within(d).getByRole('heading', { name: 'Bob' }));
    // Times sit in their own LTR isolates, so compare the joined text.
    for (const text of ['Shift 08:00–16:00', 'HVAC', '1/2 done', 'Drive time 40 min', 'Expected finish 18:30', 'Running 150 min late']) expect(d.textContent).toContain(text);
  });

  it('lists collapsed rows with time, title, status and a note indicator, and expands for detail', async () => {
    open();
    await userEvent.click(await techButton('Bob'));
    const items = within(within(drawer()).getByRole('list', { name: 'Stops' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    const first = items[0] as HTMLElement;
    expect(within(first).getByText('08:00')).toBeTruthy();
    expect(within(first).getByText('Fix 1')).toBeTruthy();
    expect(within(first).getByText('Done')).toBeTruthy();
    expect(within(first).getByLabelText('Has a note')).toBeTruthy();
    expect(within(items[1] as HTMLElement).queryByLabelText('Has a note')).toBeNull();
    expect(within(first).queryByText('Addr 1')).toBeNull();
    await userEvent.click(within(first).getByRole('button', { name: /Fix 1/ }));
    for (const text of ['Addr 1', 'HVAC', '30 min', '10 min drive']) expect(within(first).getByText(text)).toBeTruthy();
  });

  it('links rows and markers both ways', async () => {
    open();
    await userEvent.click(await techButton('Bob'));
    const markers = (): HTMLElement => screen.getByRole('list', { name: 'stops' });
    const marker = (id: number): HTMLElement => within(markers()).getByText(`stop ${id}`).closest('li') as HTMLElement;
    await userEvent.click(within(drawer()).getByRole('button', { name: /Fix 2/ }));
    expect(marker(2).getAttribute('data-highlighted')).toBe('true');
    expect(marker(1).getAttribute('data-highlighted')).toBe('false');
    await userEvent.click(within(markers()).getByText('stop 1'));
    expect(within(drawer()).getByRole('button', { name: /Fix 1/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the empty state for a day without stops', async () => {
    open();
    await userEvent.click(await techButton('Alice'));
    expect(within(drawer('Alice')).getByText('No stops this day. Plan the day or assign a job from the list.')).toBeTruthy();
  });

  it('closes with Escape or the close button and returns focus to the opening row', async () => {
    open();
    const opener = await techButton('Bob');
    await userEvent.click(opener);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('complementary', { name: 'Bob' })).toBeNull();
    expect(document.activeElement).toBe(opener);
    await userEvent.click(opener);
    await userEvent.click(within(drawer()).getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(opener);
  });

  it('animates a pointer open but not a keyboard open', async () => {
    open();
    const opener = await techButton('Bob');
    await userEvent.click(opener);
    expect(drawer().classList.contains('animate')).toBe(true);
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Enter}'); // focus is back on the opening row
    expect(drawer().classList.contains('animate')).toBe(false);
  });

  it('speaks Hebrew', async () => {
    open('he');
    await userEvent.click(await techButton('Bob'));
    for (const text of ['משמרת 08:00–16:00', '1/2 הושלמו', 'סיום צפוי 18:30', 'צפוי איחור של 150 דק׳']) expect(drawer().textContent).toContain(text);
  });
});

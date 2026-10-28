import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { daySummary, renderConsole } from './test/render';

const DAY = '2026-11-02';
const NEXT = '2026-11-03';
const stop = (jobId: number) => ({
  jobId, title: `Fix ${jobId}`, address: 'A', sequence: 1, location: [34.8, 32.1], status: 'assigned', skillIds: [], serviceDurationS: 1800, driveS: 0, hasNote: false,
  eta: '2026-11-03T06:00:00.000Z', etd: '2026-11-03T06:30:00.000Z', actualArrival: null, actualDeparture: null,
});
const incident = (id: number, technicianId: number, date: string, over: object = {}) => ({
  id, technicianId, date, jobId: null, body: `Incident ${id}`, status: 'open', createdAt: '2026-11-02T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z', reviewedAt: null, ...over,
});
const tech = (id: number, name: string) => ({ id, name, home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [], color: id });
const ok = (body: unknown): Promise<unknown> => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

function open(lang: 'he' | 'en' = 'en'): void {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', lang);
  const list = [incident(1, 1, NEXT, { jobId: 77, body: 'Customer was away' }), incident(2, 2, DAY), incident(3, 1, DAY)];
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    if (path === '/technicians') return ok([tech(1, 'Bob'), tech(2, 'Alice')]);
    if (path === '/jobs' || path === '/skills') return ok([]);
    if (path === '/incidents/open') return ok(list.filter((i) => i.status === 'open'));
    if (path === `/days/${NEXT}/summary`) return ok(daySummary(NEXT, { total: 1, assigned: 1 }, [{ technicianId: 1, stopCount: 1, doneCount: 0, driveS: 0, expectedFinish: null, openIncidents: 1, stops: [] }]));
    if (path.startsWith('/days/')) return ok(daySummary(DAY));
    if (path === `/routes/1/${NEXT}`) return ok({ technicianId: 1, date: NEXT, geometry: null, stops: [stop(77)], summary: { doneCount: 0, driveS: 0, expectedFinish: null } });
    if (/^\/technicians\/\d+\/days\/[\d-]+\/(report|incidents)$/.test(path)) return path.endsWith('report') ? Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ message: 'none' }) }) : ok([]);
    if (path === '/incidents/2/review' && init?.method === 'POST') { list[1] = { ...list[1]!, status: 'reviewed' }; return ok(list[1]); }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ message: `no fake for ${path}` }) });
  }));
  renderConsole();
}

describe('open incidents indicator', () => {
  it('shows the count, lists entries by date, goes to the day, drawer and linked stop, and review lowers the count', async () => {
    open();
    const trigger = await screen.findByRole('button', { name: /Incidents to review/ });
    await waitFor(() => expect(trigger.textContent).toContain('3'));
    await userEvent.click(trigger);
    const panel = screen.getByRole('dialog', { name: 'Incidents to review' });
    expect(within(panel).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([NEXT, DAY]);
    expect(within(panel).getAllByRole('listitem')).toHaveLength(3);

    await userEvent.click(within(panel).getByRole('button', { name: 'Mark reviewed: Incident 2' }));
    await waitFor(() => expect(trigger.textContent).toContain('2'));
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2);

    await userEvent.click(within(panel).getByRole('button', { name: /Bob.*Customer was away/ }));
    expect(screen.queryByRole('dialog', { name: 'Incidents to review' })).toBeNull();
    expect(await screen.findByLabelText('Date')).toHaveProperty('value', NEXT);
    const drawer = await screen.findByRole('complementary', { name: 'Bob' });
    await waitFor(() => expect(within(drawer).getByRole('button', { name: /Fix 77/ }).getAttribute('aria-expanded')).toBe('true'));
  });

  it('closes on Escape without closing the drawer, and returns focus to the indicator', async () => {
    open('he');
    const trigger = await screen.findByRole('button', { name: /אירועים לבדיקה/ });
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'אירועים לבדיקה' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

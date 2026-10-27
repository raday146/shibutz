import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { daySummary, fakeApi, renderConsole } from './test/render';
import type { Routes } from './test/render';

const DAY = '2026-11-02';
const T0 = '2026-11-02T07:00:00.000Z';
const T1 = '2026-11-02T07:30:00.000Z';
const HOME = (n: number): [number, number] => [Math.round((34.7 + n / 100) * 100) / 100, 32.0];
const tech = (id: number, name: string, color: number) => ({ id, name, home: HOME(id), shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [1], color });
const job = (id: number, status: string, x: number) => ({
  id, title: `Job ${id}`, address: `Addr ${id}`, location: [x, 32.1], skillIds: [1], serviceDurationS: 1800, windowStart: T0, windowEnd: '2026-11-02T10:00:00.000Z',
  priority: 50, status, day: DAY, unassignedReason: null, unassignedAt: null,
});
const stop = (jobId: number, x: number) => ({ jobId, title: `Job ${jobId}`, address: 'A', sequence: 1, location: [x, 32.1], eta: T0, etd: T0, actualArrival: null, actualDeparture: null, status: 'assigned', skillIds: [], serviceDurationS: 1800, driveS: 0, hasNote: false });
const sumTech = (technicianId: number, stopCount: number) => ({ technicianId, stopCount, doneCount: 0, driveS: 0, expectedFinish: null, openIncidents: 0, stops: [] });
const option = (technicianId: number, afterJobId: number | null, beforeJobId: number | null, detourS: number) => ({
  technicianId, position: { afterJobId, beforeJobId }, detourS, routeVersion: 4,
  etas: [{ jobId: 1, eta: T0, etd: T1 }, ...(beforeJobId ? [{ jobId: beforeJobId, eta: T1, etd: T1 }] : [])],
});
const suggestions = (options: unknown[], rejections: unknown[] = []) => ({ jobId: 1, date: DAY, options, rejections });
// Bob: between two stops. Alice: no route (home, job, home). Carl: home to his only stop.
const OPTIONS = [option(1, 5, 6, 600), option(2, null, null, 900), option(3, null, 7, 1200)];
const SUGGEST = '/jobs/1/insertion-suggestions?limit=3';

function api(over: Routes = {}): Routes {
  return {
    '/technicians': [tech(1, 'Bob', 3), tech(2, 'Alice', 5), tech(3, 'Carl', 7)],
    '/jobs': [job(1, 'unassigned', 34.8), job(5, 'assigned', 34.71), job(6, 'assigned', 34.72), job(7, 'assigned', 34.73)],
    '/skills': [{ id: 1, code: 'hvac', nameEn: 'HVAC', nameHe: 'מיזוג' }],
    [`/days/${DAY}/summary`]: daySummary(DAY, { total: 4, unassigned: 1 }, [sumTech(1, 2), sumTech(2, 0), sumTech(3, 1)]),
    [`/routes/1/${DAY}`]: { technicianId: 1, date: DAY, stops: [stop(5, 34.71), stop(6, 34.72)], summary: { doneCount: 0, driveS: 0, expectedFinish: null }, geometry: null },
    [`/routes/3/${DAY}`]: { technicianId: 3, date: DAY, stops: [stop(7, 34.73)], summary: { doneCount: 0, driveS: 0, expectedFinish: null }, geometry: null },
    [SUGGEST]: suggestions(OPTIONS),
    ...over,
  };
}

type Fetch = Mock<(path: string, init?: RequestInit) => Promise<unknown>>;
/** Answers some paths itself and leaves the rest to the fake API installed by `open`. */
function intercept(handler: (path: string, init?: RequestInit) => unknown): Fetch {
  const base = fetch as unknown as Fetch;
  const spy: Fetch = vi.fn((path: string, init?: RequestInit) => {
    const res = handler(path, init) as { status: number; body: unknown } | undefined;
    return res ? Promise.resolve({ ok: res.status < 400, status: res.status, json: () => Promise.resolve(res.body) }) : base(path, init);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

async function open(routes: Routes, lang: 'he' | 'en' = 'en'): Promise<void> {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', lang);
  fakeApi(routes);
  renderConsole();
  await userEvent.click(await screen.findByRole('tab', { name: lang === 'he' ? /לא משובצות/ : /Unassigned/ }));
  await userEvent.click(await screen.findByRole('button', { name: lang === 'he' ? 'חיפוש חלון' : 'Find a slot' }));
}
const preview = (): { color: string | null; points: unknown } | null => {
  const el = screen.queryByTestId('preview');
  return el && { color: el.getAttribute('data-color'), points: JSON.parse(el.getAttribute('data-points') ?? 'null') };
};
const items = (): HTMLElement[] => within(screen.getByRole('list', { name: 'Best options' })).getAllByRole('listitem');
const assign = (i: number): HTMLElement => within(items()[i] as HTMLElement).getByRole('button', { name: /Assign here/ });
const called = (spy: Fetch, path: string): boolean => spy.mock.calls.some(([p]) => p === path);

describe('find a slot in place', () => {
  it('expands the row with three options: technician in color, position, extra driving and arrivals', async () => {
    await open(api());
    const row = screen.getByText('Job 1').closest('li') as HTMLElement;
    expect(within(row).getByRole('list', { name: 'Best options' })).toBeTruthy();
    const [bob, alice] = items() as [HTMLElement, HTMLElement];
    expect(items()).toHaveLength(3);
    expect(bob.textContent).toContain('Bob');
    expect(bob.textContent).toContain('After Job 5, before Job 6');
    expect(bob.textContent).toContain('10 min added driving');
    expect(bob.textContent).toContain('Arrives 09:00');
    expect(alice.textContent).toContain('After home, before home');
    expect(bob.querySelector('.swatch')?.getAttribute('style')).toContain('--route-3');
  });

  it('previews dashed-line points on hover and focus and keeps them until another option is hovered', async () => {
    await open(api());
    expect(preview()).toBeNull();
    await userEvent.hover(items()[0] as HTMLElement);
    expect(preview()).toEqual({ color: '3', points: [[34.71, 32.1], [34.8, 32.1], [34.72, 32.1]] });
    await userEvent.unhover(items()[0] as HTMLElement);
    expect(preview()?.color).toBe('3');
    await userEvent.hover(items()[1] as HTMLElement); // no route: home, job, home
    expect(preview()).toEqual({ color: '5', points: [[34.72, 32.0], [34.8, 32.1], [34.72, 32.0]] });
    act(() => assign(2).focus()); // home to the technician's first stop, then the job
    expect(preview()).toEqual({ color: '7', points: [[34.73, 32.0], [34.8, 32.1], [34.73, 32.1]] });
  });

  it('choosing inserts the job, selects the technician and updates the list, colors and KPIs', async () => {
    await open(api());
    let inserted = false;
    const spy = intercept((path, init) => {
      if (path === '/jobs/1/insert') {
        inserted = true;
        expect(JSON.parse(init?.body as string)).toEqual({ technicianId: 1, position: { afterJobId: 5, beforeJobId: 6 }, routeVersion: 4 });
        return { status: 200, body: job(1, 'assigned', 34.8) };
      }
      if (inserted && path === '/jobs') return { status: 200, body: [job(1, 'assigned', 34.8), job(5, 'assigned', 34.71), job(6, 'assigned', 34.72), job(7, 'assigned', 34.73)] };
      if (inserted && path === `/days/${DAY}/summary`) return { status: 200, body: daySummary(DAY, { total: 4, unassigned: 0 }, [sumTech(1, 3), sumTech(2, 0), sumTech(3, 1)]) };
      return undefined;
    });
    await userEvent.click(assign(0));
    expect(await screen.findByRole('tab', { name: /Unassigned \(0\)/ })).toBeTruthy();
    expect(called(spy, '/jobs/1/insert')).toBe(true);
    expect(screen.getByRole('button', { name: /Bob/ }).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-selected="true"]')?.getAttribute('data-color')).toBe('3');
    expect(screen.queryByTestId('preview')).toBeNull();
  });

  it('on a stale route shows the message and refreshed options', async () => {
    await open(api());
    intercept((path) => {
      if (path === '/jobs/1/insert') return { status: 409, body: { message: 'route changed' } };
      if (path === SUGGEST) return { status: 200, body: suggestions([option(2, null, null, 300)]) };
      return undefined;
    });
    await userEvent.click(assign(0));
    expect((await screen.findByRole('alert')).textContent).toContain('The route changed since these options were calculated');
    expect(items()).toHaveLength(1);
    expect(preview()).toBeNull();
  });

  it('lists each technician rejection in plain language when nothing fits', async () => {
    await open(api({
      [SUGGEST]: suggestions([], [
        { technicianId: 1, reason: 'ROUTE_ALREADY_LATE' }, { technicianId: 2, reason: 'MISSING_SKILL' }, { technicianId: 3, reason: 'NO_FEASIBLE_POSITION' },
      ]),
    }));
    const text = (screen.getByText('Job 1').closest('li') as HTMLElement).textContent;
    expect(text).toContain('No technician can take this job:');
    expect(text).toContain('Bob: The route is already running late');
    expect(text).toContain('Alice: Missing a required skill');
    expect(text).toContain('Carl: No position fits the time window');
  });

  it('on touch the first tap previews and the second commits', async () => {
    await open(api());
    const spy = intercept((path) => (path === '/jobs/1/insert' ? { status: 200, body: job(1, 'assigned', 34.8) } : undefined));
    const tap = (): void => {
      fireEvent.pointerDown(assign(0), { pointerType: 'touch' });
      fireEvent.mouseEnter(items()[0] as HTMLElement); // browsers synthesize hover before the click
      fireEvent.click(assign(0));
    };
    tap();
    expect(preview()?.color).toBe('3');
    expect(called(spy, '/jobs/1/insert')).toBe(false);
    tap();
    expect(called(spy, '/jobs/1/insert')).toBe(true);
  });

  it('works in Hebrew', async () => {
    await open(api(), 'he');
    expect(screen.getAllByRole('button', { name: /שיבוץ כאן/ })).toHaveLength(3);
  });
});

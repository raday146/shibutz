import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { daySummary, fakeApi, renderConsole } from './test/render';
import type { Routes } from './test/render';

const DAY = '2026-11-02';
const stop = (jobId: number) => ({
  jobId, title: `Fix ${jobId}`, address: '', sequence: jobId, location: [34.8, 32.1], status: 'assigned', skillIds: [1], serviceDurationS: 1800, driveS: 600, hasNote: false,
  eta: '2026-11-02T06:00:00.000Z', etd: '2026-11-02T06:30:00.000Z', actualArrival: null, actualDeparture: null,
});
const sumTech = { technicianId: 1, stopCount: 1, doneCount: 0, driveS: 0, expectedFinish: null, openIncidents: 0, stops: [] };
const api = (): Routes => ({
  '/technicians': [{ id: 1, name: 'Bob', home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', active: true, version: 0, skillIds: [1], color: 1 }],
  '/jobs': [],
  '/skills': [{ id: 1, code: 'hvac', nameEn: 'HVAC', nameHe: 'מיזוג' }],
  '/technician-changes?limit=20': [],
  [`/days/${DAY}/summary`]: daySummary(DAY, { total: 1, assigned: 1 }, [sumTech]),
  [`/routes/1/${DAY}`]: { technicianId: 1, date: DAY, geometry: null, stops: [stop(1)], summary: { doneCount: 0, driveS: 0, expectedFinish: null } },
  [`/optimization/day/${DAY}`]: { date: DAY, totalDriveS: 0, routes: [], unassigned: [{ jobId: 9, reason: 'UNREACHABLE' }] },
});
type FetchFn = (path: string, init?: RequestInit) => Promise<unknown>;
const setup = (): void => {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', 'en');
};
const open = (): void => {
  setup();
  fakeApi(api());
};
const fail = { ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) };
/** The fake API, except that `path` fails while `down.on` is set. */
function flaky(path: string): { on: boolean } {
  setup();
  const down = { on: true };
  const real = fakeApi(api()).getMockImplementation() as FetchFn;
  vi.stubGlobal('fetch', vi.fn((p: string, i?: RequestInit) => (p === path && down.on ? Promise.resolve(fail) : real(p, i))));
  return down;
}

afterEach(() => vi.useRealTimers());

describe('loading', () => {
  it('shows skeleton rows on the first load and a progress line, not skeletons, on a reload', async () => {
    setup();
    const real = fakeApi(api()).getMockImplementation() as FetchFn;
    let slow = false;
    let release: () => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn((p: string, i?: RequestInit) => (slow && p.endsWith('/summary') ? new Promise((r) => { release = () => r(real(p, i)); }) : real(p, i))));
    renderConsole();
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByRole('progressbar', { name: 'Loading' })).toBeNull();
    await screen.findByText('Bob');
    expect(panel.getAttribute('aria-busy')).toBe('false');
    slow = true;
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toBeTruthy();
    expect(screen.getByRole('tabpanel').getAttribute('aria-busy')).toBe('false');
    expect(screen.getByText('Bob')).toBeTruthy(); // content stays, so nothing shifts
    await act(async () => release());
    await waitFor(() => expect(screen.queryByRole('progressbar', { name: 'Loading' })).toBeNull());
  });
});

describe('region errors', () => {
  it('shows a left-panel error with Retry, and recovers', async () => {
    const down = flaky(`/days/${DAY}/summary`);
    renderConsole();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/Couldn't load this/)).toBeTruthy();
    down.on = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Bob')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the panel when map data fails, and the drawer shows the same error with Retry', async () => {
    const down = flaky(`/routes/1/${DAY}`);
    renderConsole();
    expect(await screen.findByText('Bob')).toBeTruthy();
    expect((await screen.findByRole('alert')).closest('main')).toBeTruthy();
    await userEvent.click(screen.getByText('Bob'));
    const drawerError = within(screen.getByRole('complementary', { name: 'Bob' })).getByRole('alert');
    down.on = false;
    await userEvent.click(within(drawerError).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Fix 1')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a failed Plan day beside the Plan day button', async () => {
    flaky(`/optimization/day/${DAY}`);
    renderConsole();
    await screen.findByText('Bob');
    await userEvent.click(screen.getByRole('button', { name: 'Plan day' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Re-plan' }));
    expect(within(await screen.findByRole('banner')).getByRole('alert').textContent).toContain('Server error');
  });
});

describe('toasts', () => {
  const plan = async (): Promise<void> => {
    await screen.findByText('Bob');
    await userEvent.click(screen.getByRole('button', { name: 'Plan day' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Re-plan' }));
  };
  const live = (): HTMLElement => screen.getByTestId('toasts');

  it('announces the plan result in a polite live region and leaves after 3.5 s', async () => {
    open();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderConsole();
    expect(live().getAttribute('aria-live')).toBe('polite');
    await plan();
    expect(await within(live()).findByText('Plan ready: 0 assigned, 1 unassigned.')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(2900));
    expect(within(live()).queryByText(/Plan ready/)).toBeTruthy();
    act(() => void vi.advanceTimersByTime(700)); // past 3.5 s: the toast starts leaving
    act(() => void vi.advanceTimersByTime(200)); // and is gone after its 140 ms exit
    expect(within(live()).queryByText(/Plan ready/)).toBeNull();
  });

  it('pauses while hovered and while the tab is hidden', async () => {
    open();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderConsole();
    await plan();
    const toast = await within(live()).findByText(/Plan ready/);
    fireEvent.mouseEnter(toast);
    act(() => void vi.advanceTimersByTime(10_000));
    expect(within(live()).queryByText(/Plan ready/)).toBeTruthy();
    fireEvent.mouseLeave(toast);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    fireEvent(document, new Event('visibilitychange'));
    act(() => void vi.advanceTimersByTime(10_000));
    expect(within(live()).queryByText(/Plan ready/)).toBeTruthy();
    hidden.mockReturnValue(false);
    fireEvent(document, new Event('visibilitychange'));
    act(() => void vi.advanceTimersByTime(3700));
    act(() => void vi.advanceTimersByTime(200));
    expect(within(live()).queryByText(/Plan ready/)).toBeNull();
  });
});

describe('drawer exit', () => {
  it('fades out after a pointer close', async () => {
    open();
    renderConsole();
    await userEvent.click(await screen.findByText('Bob'));
    await userEvent.click(within(screen.getByRole('complementary', { name: 'Bob' })).getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('complementary', { name: 'Bob' }).classList.contains('leaving')).toBe(true);
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Bob' })).toBeNull());
  });
});

describe('motion rules in the stylesheet', () => {
  const css = readFileSync('src/style.css', 'utf8') // vitest runs from apps/web;
  it('has no transition: all, no ease-in, no duration over 250ms', () => {
    expect(css).not.toMatch(/transition:\s*all/);
    expect(css).not.toMatch(/(?<![-\w])ease-in(?![-\w])/);
    const ms = [...css.matchAll(/(?<![\w.-])(\d+(?:\.\d+)?)(ms|s)\b/g)].map(([, n, u]) => (u === 's' ? Number(n) * 1000 : Number(n)));
    // The pulse ring (1.6 s), the reload line (1 s) and the highlight pulse (600 ms) are the long ones DESIGN.md allows.
    expect(ms.filter((n) => n > 250 && n !== 600 && n !== 1000 && n !== 1600)).toEqual([]);
  });
  it('animates keyframes with transform and opacity only', () => {
    for (const [, body] of css.matchAll(/@keyframes [\w-]+\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
      for (const [, prop] of (body ?? '').matchAll(/([\w-]+)\s*:/g)) expect(['transform', 'opacity']).toContain(prop);
    }
  });
  it('silences keyboard-mode animations by duration, so a pointer event never replays an open dialog', () => {
    const rule = css.split('\n').find((l) => l.startsWith('[data-input=keyboard] :is(.overlay, .dialog')) ?? '';
    expect(rule).toContain('animation-duration: 0s');
    expect(rule).not.toMatch(/animation:\s*none/);
  });
  it('gates hover behind a fine pointer and has a reduced-motion block', () => {
    expect(css).toContain('(hover: hover) and (pointer: fine)');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css.split('\n').filter((l) => /^[^\s].*:hover/.test(l))).toEqual([]); // every :hover rule is indented, inside the media block
  });
});

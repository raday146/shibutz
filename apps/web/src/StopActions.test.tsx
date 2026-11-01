import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { daySummary, fakeApi, renderConsole } from './test/render';

const DAY = '2026-11-02';
const LOC: [number, number] = [34.8, 32.1];
type Status = 'assigned' | 'in_progress' | 'done' | 'unassigned' | 'cancelled';

/** A tiny stateful server: three stops for Bob; PATCH /jobs/:id/status moves them, routes and the day summary follow. */
function server(refuse?: { status: number; message: string }) {
  const status: Record<number, Status> = { 1: 'assigned', 2: 'assigned', 3: 'assigned' };
  const patches: Array<{ path: string; body: unknown }> = [];
  const history: unknown[] = [];
  const gate: { release?: () => void; hold: boolean } = { hold: false };
  const stops = () =>
    [1, 2, 3].filter((id) => status[id] !== 'unassigned' && status[id] !== 'cancelled').map((id, i) => ({
      jobId: id, title: `Fix ${id}`, address: `Addr ${id}`, sequence: i + 1, location: LOC, status: status[id] ?? 'assigned', skillIds: [1], serviceDurationS: 1800, driveS: 600, hasNote: false,
      eta: `2026-11-02T0${5 + id}:00:00.000Z`, etd: `2026-11-02T0${5 + id}:30:00.000Z`, actualArrival: null, actualDeparture: null,
    }));
  const job = (id: number) => ({
    id, title: `Fix ${id}`, address: '', location: [34.8, 32.1], skillIds: [1], serviceDurationS: 1800, windowStart: `${DAY}T05:00:00.000Z`, windowEnd: `${DAY}T12:00:00.000Z`,
    priority: 50, status: status[id] ?? 'assigned', day: DAY, unassignedReason: null, unassignedAt: null,
  });
  const spy = fakeApi({});
  spy.mockImplementation((path: string, init?: RequestInit) => {
    const reply = (ok: boolean, code: number, body: unknown) => Promise.resolve({ ok, status: code, json: () => Promise.resolve(body) });
    const live = stops();
    const done = live.filter((s) => s.status === 'done').length;
    if (init?.method === 'PATCH') {
      patches.push({ path, body: JSON.parse(String(init.body)) });
      if (refuse) return reply(false, refuse.status, { message: refuse.message });
      const id = Number(/\/jobs\/(\d+)\//.exec(path)?.[1]);
      const run = (): Promise<unknown> => {
        const sent = JSON.parse(String(init.body)) as { status: Status; reason?: string };
        status[id] = sent.status;
        if (sent.status === 'cancelled') history.push({ jobId: id, title: `Fix ${id}`, previousStatus: 'assigned', actualArrival: null, actualDeparture: null, cancelledAt: `${DAY}T07:30:00.000Z`, reason: sent.reason || null });
        return reply(true, 200, job(id));
      };
      return gate.hold ? new Promise((r) => (gate.release = () => r(run()))) : run();
    }
    const body: Record<string, unknown> = {
      '/technicians': [{ id: 1, name: 'Bob', home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', active: true, version: 0, skillIds: [1], color: 1 }],
      '/jobs': [1, 2, 3].map(job),
      '/skills': [{ id: 1, code: 'hvac', nameEn: 'HVAC', nameHe: 'מיזוג' }],
      [`/days/${DAY}/summary`]: daySummary(DAY, { total: 3, assigned: live.length, unassigned: 3 - live.length, done }, [
        { technicianId: 1, stopCount: live.length, doneCount: done, driveS: 0, expectedFinish: null, openIncidents: 0, stops: live.map((s) => ({ jobId: s.jobId, status: s.status, location: s.location })) },
      ]),
      [`/routes/1/${DAY}/cancellations`]: history,
      [`/routes/1/${DAY}`]: { technicianId: 1, date: DAY, geometry: null, stops: live, summary: { doneCount: done, driveS: 1200, expectedFinish: null } },
    };
    return path in body ? reply(true, 200, body[path]) : reply(false, 404, { message: `no fake for ${path}` });
  });
  return { status, patches, gate, history };
}

const open = async (lang: 'he' | 'en' = 'en') => {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', lang);
  renderConsole();
  await userEvent.click(within((await screen.findByText('Bob')).closest('li') as HTMLElement).getByRole('button'));
  return screen.getByRole('complementary', { name: 'Bob' });
};
const row = (d: HTMLElement, n: number): HTMLElement => within(d).getByRole('button', { name: new RegExp(`Fix ${n}`) }).closest('li') as HTMLElement;
const expand = async (d: HTMLElement, n: number): Promise<HTMLElement> => {
  await userEvent.click(within(row(d, n)).getByRole('button', { name: new RegExp(`Fix ${n}`) }));
  return row(d, n);
};

describe('start, finish and unassign from the drawer', () => {
  it('starts the first unfinished stop with a busy state, no optimism, then offers Finish and disables Plan day', async () => {
    const s = server();
    s.gate.hold = true;
    const d = await open();
    const r1 = await expand(d, 1);
    await userEvent.click(within(r1).getByRole('button', { name: 'Start' }));
    expect(s.patches).toEqual([{ path: '/jobs/1/status', body: { status: 'in_progress' } }]);
    expect(within(r1).getByRole('button', { name: /Start/ }).getAttribute('aria-busy')).toBe('true');
    expect(within(r1).queryByRole('button', { name: 'Finish' })).toBeNull(); // not optimistic
    await act(async () => s.gate.release?.());
    expect(await within(r1).findByRole('button', { name: 'Finish' })).toBeTruthy();
    expect(within(r1).queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Plan day' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText("Can't re-plan: a stop that day has already started.")).toBeTruthy();
  });

  it('finishes the stop in progress, then the next stop can start', async () => {
    const s = server();
    s.status[1] = 'in_progress';
    const d = await open();
    const r1 = await expand(d, 1);
    await userEvent.click(within(r1).getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(within(r1).getByText('Done')).toBeTruthy());
    expect(document.activeElement).toBe(within(r1).getByRole('button', { name: /Fix 1/ })); // Finish unmounted: focus is not dropped on <body>
    const r2 = await expand(d, 2);
    expect(within(r2).getByRole('button', { name: 'Start' }).getAttribute('aria-disabled')).toBeNull();
  });

  it('blocks Start on later stops and says why beside it', async () => {
    const s = server();
    const d = await open();
    const r2 = await expand(d, 2);
    const start = within(r2).getByRole('button', { name: 'Start' });
    expect(start.getAttribute('aria-disabled')).toBe('true');
    expect(start.getAttribute('aria-describedby')).toBeTruthy();
    expect(within(r2).getByText('Only the first unfinished stop can be started.')).toBeTruthy();
    await userEvent.click(start);
    expect(s.patches).toHaveLength(0);
    s.status[1] = 'in_progress';
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(within(row(d, 2)).getByText('This technician already has a stop in progress.')).toBeTruthy());
  });

  it('maps a known refusal to localized text inline at the row', async () => {
    server({ status: 409, message: 'Technician already has a stop in progress' });
    const d = await open('he');
    const r1 = await expand(d, 1);
    await userEvent.click(within(r1).getByRole('button', { name: 'התחלה' }));
    expect((await within(r1).findByRole('alert')).textContent).toBe('לטכנאי יש כבר עצירה בביצוע.');
  });

  it('shows an unknown refusal as received after the lead sentence', async () => {
    server({ status: 409, message: 'Cannot change a job from done to in_progress' });
    const d = await open();
    const r1 = await expand(d, 1);
    await userEvent.click(within(r1).getByRole('button', { name: 'Start' }));
    expect((await within(r1).findByRole('alert')).textContent).toBe("That didn't go through. Cannot change a job from done to in_progress");
  });

  it('unassigns from the overflow menu after confirmation, updating route, list, map and KPIs', async () => {
    const s = server();
    const d = await open();
    const r2 = await expand(d, 2);
    await userEvent.click(within(r2).getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unassign' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Unassign "Fix 2"?' });
    expect(within(dialog).getByText('The job goes back to the unassigned list and can be placed again.')).toBeTruthy();
    expect(s.patches).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unassign' }));
    expect(s.patches).toEqual([{ path: '/jobs/2/status', body: { status: 'unassigned' } }]);
    await waitFor(() => expect(within(d).queryByRole('button', { name: /Fix 2/ })).toBeNull());
    expect(screen.getByRole('group', { name: 'Unassigned' }).textContent).toContain('1');
    expect(screen.getByRole('group', { name: 'Assigned' }).textContent).toContain('2/3');
    expect(screen.queryByText('stop 2')).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: /Unassigned/ }));
    expect(screen.getByText('Fix 2')).toBeTruthy();
  });

  it('keeps the stop when the confirmation is dismissed with Escape, and Escape closes only the dialog', async () => {
    const s = server();
    const d = await open();
    const r2 = await expand(d, 2);
    const more = within(r2).getByRole('button', { name: 'More actions' });
    await userEvent.click(more);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Unassign' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('complementary', { name: 'Bob' })).toBeTruthy();
    expect(s.patches).toHaveLength(0);
    expect(document.activeElement).toBe(more);
  });

  it('opens the menu with the keyboard and closes it with Escape', async () => {
    server();
    const d = await open();
    const r2 = await expand(d, 2);
    const more = within(r2).getByRole('button', { name: 'More actions' });
    more.focus();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Edit job' }));
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Unassign' }));
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Cancel job' }));
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Edit job' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(more);
    expect(screen.getByRole('complementary', { name: 'Bob' })).toBeTruthy();
  });
});

describe('cancel a job from the drawer', () => {
  it('confirms with the consequences and an optional reason, then lists the job under Cancelled today', async () => {
    const s = server();
    const d = await open();
    const r2 = await expand(d, 2);
    await userEvent.click(within(r2).getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cancel job' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel "Fix 2"?' });
    expect(within(dialog).getByText("The job leaves the route and later stops are re-timed. A cancelled job can't be restored.")).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Keep job' }));
    expect(s.patches).toHaveLength(0);
    await userEvent.type(within(dialog).getByLabelText('Reason (optional)'), 'Customer moved');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel job' }));
    expect(s.patches).toEqual([{ path: '/jobs/2/status', body: { status: 'cancelled', reason: 'Customer moved' } }]);
    const list = await within(d).findByRole('region', { name: 'Cancelled today' });
    expect(within(list).getByText('Fix 2')).toBeTruthy();
    expect(within(list).getByText('Reason: Customer moved')).toBeTruthy();
    expect(list.textContent).toContain('Cancelled at 09:30');
    expect(within(d).queryByRole('button', { name: /Fix 2/ })).toBeNull();
  });

  it('keeps the job with Keep job and cycles Tab through the reason field, and cancelling with no reason sends none', async () => {
    const s = server();
    const d = await open('he');
    const r1 = await expand(d, 1);
    await userEvent.click(within(r1).getByRole('button', { name: 'פעולות נוספות' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'ביטול עבודה' }));
    const dialog = screen.getByRole('alertdialog');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'השארת העבודה' }));
    await userEvent.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'ביטול עבודה' }));
    await userEvent.tab();
    expect(document.activeElement).toBe(within(dialog).getByLabelText('סיבה (לא חובה)'));
    await userEvent.tab();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'השארת העבודה' }));
    await userEvent.click(document.activeElement as HTMLElement);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(s.patches).toHaveLength(0);

    await userEvent.click(within(r1).getByRole('button', { name: 'פעולות נוספות' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'ביטול עבודה' }));
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'ביטול עבודה' }));
    expect(s.patches).toEqual([{ path: '/jobs/1/status', body: { status: 'cancelled' } }]);
    expect(await within(d).findByRole('region', { name: 'בוטלו היום' })).toBeTruthy();
  });

  it('offers Cancel job (not Unassign) for the stop in progress', async () => {
    const s = server();
    s.status[1] = 'in_progress';
    const d = await open();
    const r1 = await expand(d, 1);
    await userEvent.click(within(r1).getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menuitem', { name: 'Cancel job' })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Unassign' })).toBeNull();
  });

  it('closes the menu on a press outside it, and the trigger toggles it', async () => {
    server();
    const d = await open();
    const r2 = await expand(d, 2);
    const more = within(r2).getByRole('button', { name: 'More actions' });
    await userEvent.click(more);
    expect(screen.getByRole('menu')).toBeTruthy();
    await userEvent.click(more); // the trigger is not "outside": it closes the menu once, it does not reopen it
    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(more);
    await userEvent.click(within(d).getByRole('heading', { name: 'Bob' }));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

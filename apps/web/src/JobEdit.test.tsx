import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { daySummary, fakeApi, renderConsole } from './test/render';

const DAY = '2026-11-02';
const LOC: [number, number] = [34.8, 32.1];
type Status = 'assigned' | 'done' | 'unassigned';

const job = (id: number, status: Status, title: string) => ({
  id, title, address: `Addr ${id}`, location: LOC, skillIds: [1], serviceDurationS: 1800, windowStart: `${DAY}T05:00:00.000Z`, windowEnd: `${DAY}T12:00:00.000Z`,
  priority: 50, status, day: DAY, unassignedReason: null, unassignedAt: null,
});
const stop = (id: number, status: Status, title: string) => ({
  jobId: id, title, address: `Addr ${id}`, sequence: id, location: LOC, status, skillIds: [1], serviceDurationS: 1800, driveS: 600, hasNote: false,
  eta: `${DAY}T0${5 + id}:00:00.000Z`, etd: `${DAY}T0${5 + id}:30:00.000Z`, actualArrival: null, actualDeparture: null,
});

/** Job 10 is unassigned, 1 is on Bob's route, 2 is done. `refuse` answers every PATCH /jobs/:id with that error. */
function server(refuse?: { status: number; message: string }) {
  const patches: Array<{ path: string; body: Record<string, unknown> }> = [];
  const jobs = [job(10, 'unassigned', 'Loose pipe'), job(1, 'assigned', 'Fix boiler'), job(2, 'done', 'Old visit')];
  const spy = fakeApi({});
  spy.mockImplementation((path: string, init?: RequestInit) => {
    const reply = (ok: boolean, code: number, body: unknown) => Promise.resolve({ ok, status: code, json: () => Promise.resolve(body) });
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      patches.push({ path, body });
      if (refuse) return reply(false, refuse.status, { message: refuse.message });
      const target = jobs.find((j) => `/jobs/${j.id}` === path);
      Object.assign(target ?? {}, body);
      return reply(true, 200, target);
    }
    const stops = [stop(1, 'assigned', 'Fix boiler'), stop(2, 'done', 'Old visit')];
    const table: Record<string, unknown> = {
      '/technicians': [{ id: 1, name: 'Bob', home: LOC, shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [1], color: 1 }],
      '/jobs': jobs,
      '/skills': [{ id: 1, code: 'hvac', nameEn: 'HVAC', nameHe: 'מיזוג' }],
      [`/days/${DAY}/summary`]: daySummary(DAY, { total: 3, assigned: 1, unassigned: 1, done: 1 }, [
        { technicianId: 1, stopCount: 2, doneCount: 1, driveS: 0, expectedFinish: null, openIncidents: 0, stops: stops.map((s) => ({ jobId: s.jobId, status: s.status, location: s.location })) },
      ]),
      [`/routes/1/${DAY}/cancellations`]: [],
      [`/routes/1/${DAY}`]: { technicianId: 1, date: DAY, geometry: null, stops, summary: { doneCount: 1, driveS: 1200, expectedFinish: null } },
    };
    return path in table ? reply(true, 200, table[path]) : reply(false, 404, { message: `no fake for ${path}` });
  });
  return { patches };
}

const open = async (lang: 'he' | 'en' = 'en'): Promise<void> => {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', lang);
  renderConsole();
  await screen.findByText('Bob');
};
const editFromUnassigned = async (name: string, tab: RegExp = /Unassigned/): Promise<void> => {
  await userEvent.click(screen.getByRole('tab', { name: tab }));
  await userEvent.click(await screen.findByRole('button', { name }));
};
const editFromStop = async (title: string): Promise<void> => {
  await userEvent.click(within((await screen.findByText('Bob')).closest('li') as HTMLElement).getByRole('button'));
  const drawer = screen.getByRole('complementary', { name: 'Bob' });
  await userEvent.click(within(drawer).getByRole('button', { name: new RegExp(title) }));
  await userEvent.click(within(drawer).getByRole('button', { name: 'More actions' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'Edit job' }));
};

describe('job edit', () => {
  it('edits an unassigned job from its row: prefilled, sends only what changed, offers Find a slot', async () => {
    const s = server();
    await open();
    await editFromUnassigned('Edit job');
    const dialog = screen.getByRole('dialog', { name: 'Edit "Loose pipe"' });
    expect((within(dialog).getByLabelText('Address') as HTMLInputElement).value).toBe('Addr 10');
    expect((within(dialog).getByLabelText('Service time (minutes)') as HTMLInputElement).value).toBe('30');
    expect((within(dialog).getByLabelText('Window start') as HTMLInputElement).value).toBe('07:00');
    expect(within(dialog).getByText(/32\.1000, 34\.8000/)).toBeTruthy();
    expect(within(dialog).queryByText(/on a route/)).toBeNull();

    await userEvent.clear(within(dialog).getByLabelText('Title'));
    await userEvent.type(within(dialog).getByLabelText('Title'), 'Burst pipe');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(s.patches).toEqual([{ path: '/jobs/10', body: { title: 'Burst pipe' } }]);
    expect(screen.getByTestId('toasts').textContent).toBe('Job updated. You can find it a slot.');
    expect(screen.getByRole('button', { name: 'Find a slot' })).toBeTruthy();
  });

  it('edits from the stop menu; a routed job has its four scheduling fields disabled with the hint', async () => {
    const s = server();
    await open();
    await editFromStop('Fix boiler');
    const dialog = screen.getByRole('dialog', { name: 'Edit "Fix boiler"' });
    for (const label of ['Service time (minutes)', 'Window start', 'Window end', 'HVAC']) {
      expect((within(dialog).getByLabelText(label) as HTMLInputElement).disabled, label).toBe(true);
    }
    expect((within(dialog).getByRole('button', { name: 'Change location' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).getByText(/This job is on a route\. Title and address can be edited\./)).toBeTruthy();

    await userEvent.type(within(dialog).getByLabelText('Address'), ' 2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(s.patches).toEqual([{ path: '/jobs/1', body: { address: 'Addr 1 2' } }]);
    expect(screen.getByTestId('toasts').textContent).toBe('Job updated.');
  });

  it('shows a done job read-only with the explanation and no Save', async () => {
    const s = server();
    await open();
    await editFromStop('Old visit');
    const dialog = screen.getByRole('dialog', { name: 'Edit "Old visit"' });
    expect((within(dialog).getByLabelText('Title') as HTMLInputElement).disabled).toBe(true);
    expect(within(dialog).getByText("A done or cancelled job can't be edited.")).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Save' })).toBeNull();
    expect(s.patches).toHaveLength(0);
  });

  it('says so when the job was placed on a route meanwhile, and keeps the dialog open', async () => {
    server({ status: 409, message: 'Job is on a route' });
    await open();
    await editFromUnassigned('Edit job');
    await userEvent.clear(screen.getByLabelText('Service time (minutes)'));
    await userEvent.type(screen.getByLabelText('Service time (minutes)'), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toBe('The job was placed on a route in the meantime. Unassign it to change scheduling fields.');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('is in Hebrew too', async () => {
    server();
    await open('he');
    await editFromUnassigned('עריכת עבודה', /לא משובצות/);
    expect(screen.getByRole('dialog', { name: 'עריכת "Loose pipe"' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'שמירה' })).toBeTruthy();
  });
});

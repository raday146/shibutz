import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { daySummary, fakeApi, renderConsole } from './test/render';
import type { Routes } from './test/render';

const DAY = '2026-11-02';
const stop = (jobId: number, hasNote: boolean) => ({
  jobId, title: `Fix ${jobId}`, address: `Addr ${jobId}`, sequence: jobId, location: [34.8, 32.1], status: 'assigned', skillIds: [], serviceDurationS: 1800, driveS: 600, hasNote,
  eta: `2026-11-02T0${5 + jobId}:00:00.000Z`, etd: `2026-11-02T0${5 + jobId}:30:00.000Z`, actualArrival: null, actualDeparture: null,
});
const note = (body: string, updatedAt = '2026-11-02T08:05:00.000Z') => ({ jobId: 1, body, createdAt: '2026-11-02T08:00:00.000Z', updatedAt });
const bob = { id: 1, name: 'Bob', home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', active: true, version: 0, skillIds: [], color: 1 };
const api: Routes = {
  '/technicians': [bob],
  '/jobs': [],
  '/skills': [],
  [`/days/${DAY}/summary`]: daySummary(DAY, { total: 2, assigned: 2 }, [{ technicianId: 1, stopCount: 2, doneCount: 0, driveS: 0, expectedFinish: null, openIncidents: 0, stops: [] }]),
  [`/days/2026-11-03/summary`]: daySummary('2026-11-03'),
  [`/routes/1/${DAY}`]: { technicianId: 1, date: DAY, geometry: null, stops: [stop(1, true), stop(2, false)], summary: { doneCount: 0, driveS: 0, expectedFinish: null } },
  '/jobs/1/note': note('call first'),
  '/jobs/2/note': { ...note('x'), jobId: 2 },
};

type Fetch = ReturnType<typeof fakeApi>;
const puts = (f: Fetch): { path: string; body: string }[] =>
  f.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'PUT').map(([path, init]) => ({ path, body: JSON.parse((init as RequestInit).body as string).body }));

/** The console on DAY with Bob's drawer open and stop `jobId` expanded. */
async function openStop(jobId: number): Promise<{ fetch: Fetch; field: HTMLElement }> {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', 'en');
  const fetch = fakeApi(api);
  renderConsole();
  await userEvent.click(within((await screen.findByText('Bob')).closest('li') as HTMLElement).getAllByRole('button')[0] as HTMLElement);
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(`Fix ${jobId}`) }));
  const field = await screen.findByRole('textbox', { name: 'Note' });
  return { fetch, field };
}

/** Makes the next PUT wait for `release`, or fail. */
function slowPut(f: Fetch): { release: () => void } {
  let release = (): void => undefined;
  const wait = new Promise<void>((r) => (release = r));
  const ok = f.getMockImplementation() as (p: string, i?: RequestInit) => Promise<unknown>;
  f.mockImplementation((p: string, i?: RequestInit) => (i?.method === 'PUT' ? wait.then(() => ok(p, i)) : ok(p, i)));
  return { release };
}

describe('job note in the drawer', () => {
  it('loads the stored note with its update time', async () => {
    const { field } = await openStop(1);
    await waitFor(() => expect((field as HTMLTextAreaElement).value).toBe('call first'));
    expect(screen.getByRole('status').textContent).toBe('Updated 10:05'); // 08:05Z in Israel winter time
  });

  it('saves on blur and shows Saved with the update time, never "Saving" for a fast save', async () => {
    const { fetch, field } = await openStop(2);
    await userEvent.type(field, 'gate code 1948');
    expect(puts(fetch)).toEqual([]); // typing alone does not save
    await userEvent.tab();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saved · Updated 10:05'));
    expect(puts(fetch)).toEqual([{ path: '/jobs/2/note', body: 'gate code 1948' }]);
    expect(screen.queryByText('Saving')).toBeNull();
  });

  it('shows "Saving" only after 400 ms', async () => {
    const { fetch, field } = await openStop(2);
    const { release } = slowPut(fetch);
    await userEvent.type(field, 'slow');
    await userEvent.tab();
    await new Promise((r) => setTimeout(r, 250));
    expect(screen.queryByText('Saving')).toBeNull();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Saving'));
    release();
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Saved'));
  });

  it('keeps the text on a failed save and retries', async () => {
    const { fetch, field } = await openStop(2);
    const ok = fetch.getMockImplementation() as (p: string, i?: RequestInit) => Promise<unknown>;
    fetch.mockImplementationOnce(() => ok('/nope')); // not a PUT path: a 404 response
    await userEvent.type(field, 'keep me');
    await userEvent.tab();
    expect((await screen.findByRole('alert')).textContent).toContain("Couldn't save. Your text is still here. Try again.");
    expect((field as HTMLTextAreaElement).value).toBe('keep me');
    fetch.mockImplementation(ok);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Saved'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(puts(fetch).map((p) => p.body)).toEqual(['keep me', 'keep me']);
  });

  it('flushes a pending note when the drawer closes', async () => {
    const { fetch, field } = await openStop(2);
    await userEvent.type(field, 'before close');
    fireEvent.click(screen.getByRole('button', { name: 'Close' })); // no focus change, so only the unmount flush can save
    await waitFor(() => expect(puts(fetch).length).toBeGreaterThan(0));
    expect(puts(fetch).every((p) => p.body === 'before close')).toBe(true);
  });

  it('flushes a pending note when the date changes', async () => {
    const { fetch, field } = await openStop(2);
    await userEvent.type(field, 'before date change');
    fireEvent.click(screen.getByRole('button', { name: 'Next day' })); // no focus change, so only the flush can save
    await waitFor(() => expect(puts(fetch).length).toBeGreaterThan(0));
    expect(puts(fetch).every((p) => p.body === 'before date change')).toBe(true);
  });

  it('flushes on unmount even when no blur happened', async () => {
    const { fetch, field } = await openStop(2);
    await userEvent.type(field, 'no blur');
    await userEvent.keyboard('{Escape}'); // closes the drawer; the field never blurred
    await waitFor(() => expect(puts(fetch)).toEqual([{ path: '/jobs/2/note', body: 'no blur' }]));
  });

  it('shows the note indicator on the collapsed row once a note is saved', async () => {
    const { field } = await openStop(2);
    const row = (): HTMLElement => screen.getByRole('button', { name: /Fix 2/ });
    expect(within(row()).queryByLabelText('Has a note')).toBeNull();
    await userEvent.type(field, 'now noted');
    await userEvent.tab();
    await waitFor(() => expect(within(row()).getByLabelText('Has a note')).toBeTruthy());
  });

  it('keeps a saved note when the drawer switches to another technician and back', async () => {
    const amy = { ...bob, id: 2, name: 'Amy', color: 2 };
    const amyStop = { ...stop(4, false), title: 'Amy job' };
    localStorage.setItem('shibutz.date', DAY);
    localStorage.setItem('shibutz.lang', 'en');
    fakeApi({
      ...api,
      '/technicians': [bob, amy],
      [`/days/${DAY}/summary`]: daySummary(DAY, { total: 3, assigned: 3 }, [
        { technicianId: 1, stopCount: 2, doneCount: 0, driveS: 0, expectedFinish: null, openIncidents: 0, stops: [] },
        { technicianId: 2, stopCount: 1, doneCount: 0, driveS: 0, expectedFinish: null, openIncidents: 0, stops: [] },
      ]),
      [`/routes/2/${DAY}`]: { technicianId: 2, date: DAY, geometry: null, stops: [amyStop], summary: { doneCount: 0, driveS: 0, expectedFinish: null } },
    });
    renderConsole();
    const pick = async (name: string): Promise<void> => {
      await userEvent.click(within((await screen.findByText(name)).closest('li') as HTMLElement).getAllByRole('button')[0] as HTMLElement);
    };
    await pick('Bob');
    await userEvent.click(await screen.findByRole('button', { name: /Fix 2/ }));
    await userEvent.type(await screen.findByRole('textbox', { name: 'Note' }), 'now noted');
    await userEvent.tab();
    await waitFor(() => expect(within(screen.getByRole('button', { name: /Fix 2/ })).getByLabelText('Has a note')).toBeTruthy());

    await pick('Amy');
    await screen.findByRole('button', { name: /Amy job/ });
    await pick('Bob');
    expect(within(await screen.findByRole('button', { name: /Fix 2/ })).getByLabelText('Has a note')).toBeTruthy();
  });

  it('labels the field and speaks Hebrew', async () => {
    localStorage.setItem('shibutz.date', DAY);
    localStorage.setItem('shibutz.lang', 'he');
    fakeApi(api);
    renderConsole();
    await userEvent.click(within((await screen.findByText('Bob')).closest('li') as HTMLElement).getAllByRole('button')[0] as HTMLElement);
    await userEvent.click(await screen.findByRole('button', { name: /Fix 2/ }));
    const field = await screen.findByRole('textbox', { name: 'הערה' });
    expect(field.getAttribute('placeholder')).toBe('הערה על העבודה');
    expect(field.getAttribute('dir')).toBe('auto');
    vi.unstubAllGlobals();
  });
});

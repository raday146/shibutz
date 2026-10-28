import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { describe, expect, it } from 'vitest';
import { daySummary, fakeApi, renderConsole } from './test/render';

const DAY = '2026-11-02';
const stop = (jobId: number, status: string) => ({
  jobId, title: `Fix ${jobId}`, address: 'A', sequence: jobId, location: [34.8, 32.1], status, skillIds: [], serviceDurationS: 1800, driveS: 0, hasNote: false,
  eta: '2026-11-02T06:00:00.000Z', etd: '2026-11-02T06:30:00.000Z', actualArrival: null, actualDeparture: null,
});
const tech = (id: number, name: string) => ({ id, name, home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [], color: id });
const route = (technicianId: number, statuses: string[]) => ({
  technicianId, date: DAY, geometry: null, stops: statuses.map((s, i) => stop(technicianId * 10 + i, s)),
  summary: { doneCount: statuses.filter((s) => s === 'done').length, driveS: 0, expectedFinish: null },
});
const incident = (id: number, technicianId: number, over: object = {}) => ({
  id, technicianId, date: DAY, jobId: null, body: `Incident ${id}`, status: 'open', createdAt: '2026-11-02T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z', reviewedAt: null, ...over,
});

interface Backend { reports: Map<number, string>; incidents: ReturnType<typeof incident>[]; calls: { method: string; path: string; body: unknown }[] }

/** Bob: one stop in progress. Alice: all stops done. Carl: nothing done, but has an incident. State lives in the backend object. */
function open(lang: 'he' | 'en' = 'en', incidents: ReturnType<typeof incident>[] = [incident(1, 3)]): Backend {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', lang);
  const backend: Backend = { reports: new Map(), incidents, calls: [] };
  const summary = (): unknown =>
    daySummary(DAY, { total: 4, assigned: 4 }, [1, 2, 3].map((id) => ({
      technicianId: id, stopCount: 1, doneCount: id === 2 ? 1 : 0, driveS: 0, expectedFinish: null,
      openIncidents: backend.incidents.filter((i) => i.technicianId === id && i.status === 'open').length, stops: [],
    })));
  fakeApi({ '/technicians': [tech(1, 'Bob'), tech(2, 'Alice'), tech(3, 'Carl')], '/jobs': [], '/skills': [] });
  const base = fetch as unknown as (path: string, init?: RequestInit) => Promise<unknown>;
  const json = (status: number, body: unknown): Promise<unknown> => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    backend.calls.push({ method, path, body });
    if (path === `/days/${DAY}/summary`) return json(200, summary());
    if (path === `/routes/1/${DAY}`) return json(200, route(1, ['in_progress']));
    if (path === `/routes/2/${DAY}`) return json(200, route(2, ['done']));
    if (path === `/routes/3/${DAY}`) return json(200, route(3, ['assigned']));
    const m = /^\/technicians\/(\d+)\/days\/[\d-]+\/(report|incidents)$/.exec(path);
    if (m?.[2] === 'report') {
      const id = Number(m[1]);
      if (method === 'PUT') backend.reports.set(id, body.body);
      const text = backend.reports.get(id);
      return text === undefined ? json(404, { message: 'No report for this day' }) : json(200, { technicianId: id, date: DAY, body: text, createdAt: '2026-11-02T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z' });
    }
    if (m?.[2] === 'incidents') {
      const id = Number(m[1]);
      if (method === 'POST') {
        const added = incident(backend.incidents.length + 1, id, { body: body.body, jobId: body.jobId });
        backend.incidents.push(added);
        return json(201, added);
      }
      return json(200, backend.incidents.filter((i) => i.technicianId === id));
    }
    const review = /^\/incidents\/(\d+)\/review$/.exec(path);
    if (review) {
      const found = backend.incidents.find((i) => i.id === Number(review[1]));
      if (found) Object.assign(found, { status: 'reviewed', reviewedAt: '2026-11-02T11:00:00.000Z' });
      return json(201, found);
    }
    return base(path, init);
  }));
  renderConsole();
  return backend;
}

const techButton = async (name: string): Promise<HTMLElement> => within((await screen.findByText(name)).closest('li') as HTMLElement).getByRole('button');
const rowOf = (name: string): HTMLElement => within(screen.getByRole('list', { name: 'Technicians' })).getByText(name).closest('li') as HTMLElement;
const drawer = (name: string): HTMLElement => screen.getByRole('complementary', { name });
const openDrawer = async (name: string): Promise<HTMLElement> => {
  await userEvent.click(await techButton(name));
  return drawer(name);
};
const summaryToggle = (d: HTMLElement): HTMLElement => within(d).getByRole('button', { name: 'End-of-day summary' });

describe('end-of-day summary', () => {
  it('is collapsed while stops are open, and opens on demand', async () => {
    open('en', []);
    const d = await openDrawer('Bob');
    expect(summaryToggle(d).getAttribute('aria-expanded')).toBe('false');
    expect(within(d).queryByRole('textbox', { name: 'End-of-day summary' })).toBeNull();
    await userEvent.click(summaryToggle(d));
    expect(summaryToggle(d).getAttribute('aria-expanded')).toBe('true');
    expect(within(d).getByRole('textbox', { name: 'End-of-day summary' })).toBeTruthy();
  });

  it('opens by default once every stop is done', async () => {
    open('en', []);
    const d = await openDrawer('Alice');
    expect(await within(d).findByRole('textbox', { name: 'End-of-day summary' })).toBeTruthy();
    expect(summaryToggle(d).getAttribute('aria-expanded')).toBe('true');
  });

  it('opens by default when an incident exists, and lists it', async () => {
    open();
    const d = await openDrawer('Carl');
    expect(await within(d).findByText('Incident 1')).toBeTruthy();
    expect(summaryToggle(d).getAttribute('aria-expanded')).toBe('true');
  });

  it('shows a saved summary and saves edits on blur, once, as Saved', async () => {
    const backend = open('en', []);
    backend.reports.set(2, 'Quiet day');
    const d = await openDrawer('Alice');
    const box = await within(d).findByDisplayValue('Quiet day');
    await userEvent.clear(box);
    await userEvent.type(box, 'Busy day');
    expect(backend.calls.filter((c) => c.method === 'PUT')).toHaveLength(0);
    await userEvent.tab();
    expect(await within(d).findByText('Saved')).toBeTruthy();
    expect(backend.calls.filter((c) => c.method === 'PUT')).toEqual([{ method: 'PUT', path: `/technicians/2/days/${DAY}/report`, body: { body: 'Busy day' } }]);
    await userEvent.click(box);
    await userEvent.tab(); // nothing changed: no second save
    expect(backend.calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  });

  it('keeps the text and offers a retry when a save fails', async () => {
    const backend = open('en', []);
    const d = await openDrawer('Alice');
    const box = await within(d).findByRole('textbox', { name: 'End-of-day summary' });
    const real = fetch as unknown as (path: string, init?: RequestInit) => Promise<unknown>;
    let fail = true;
    vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) =>
      fail && init?.method === 'PUT' ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'boom' }) }) : real(path, init)));
    await userEvent.type(box, 'Long day');
    await userEvent.tab();
    expect(await within(d).findByRole('alert')).toHaveProperty('textContent', expect.stringContaining("Couldn't save"));
    expect((box as HTMLTextAreaElement).value).toBe('Long day');
    fail = false;
    await userEvent.click(within(d).getByRole('button', { name: 'Try again' }));
    expect(await within(d).findByText('Saved')).toBeTruthy();
    expect(backend.reports.get(2)).toBe('Long day');
  });

  it('flushes a pending summary when the drawer closes', async () => {
    const backend = open('en', []);
    const d = await openDrawer('Alice');
    await userEvent.type(await within(d).findByRole('textbox', { name: 'End-of-day summary' }), 'Left unsaved');
    await userEvent.click(within(d).getByRole('button', { name: 'Close' }));
    await vi.waitFor(() => expect(backend.reports.get(2)).toBe('Left unsaved'));
  });

  it('adds an incident with an optional linked job, which raises the technician badge', async () => {
    const backend = open('en', []);
    const d = await openDrawer('Bob');
    await userEvent.click(summaryToggle(d));
    expect(await within(d).findByText('No incidents logged.')).toBeTruthy();
    expect(within(d).getByRole('button', { name: 'Add incident' }).hasAttribute('disabled')).toBe(true);
    await userEvent.type(within(d).getByRole('textbox', { name: 'What happened?' }), 'Wrong part');
    await userEvent.selectOptions(within(d).getByRole('combobox', { name: 'Linked job (optional)' }), 'Fix 10');
    await userEvent.click(within(d).getByRole('button', { name: 'Add incident' }));
    const list = await within(d).findByRole('list', { name: 'Incidents' });
    expect(within(list).getByText('Wrong part')).toBeTruthy();
    expect(within(list).getByText('Open')).toBeTruthy();
    expect(backend.calls.find((c) => c.method === 'POST')?.body).toEqual({ body: 'Wrong part', jobId: 10 });
    const row = rowOf('Bob');
    expect(await within(row).findByText('Open incidents: 1')).toBeTruthy();
  });

  it('marks an incident reviewed, which clears the badge', async () => {
    open();
    const d = await openDrawer('Carl');
    const row = rowOf('Carl');
    expect(within(row).getByText('Open incidents: 1')).toBeTruthy();
    await userEvent.click(await within(d).findByRole('button', { name: 'Mark reviewed' }));
    expect(await within(d).findByText('Reviewed')).toBeTruthy();
    expect(within(d).queryByRole('button', { name: 'Mark reviewed' })).toBeNull();
    await vi.waitFor(() => expect(within(row).queryByText('Open incidents: 1')).toBeNull());
  });

  it('speaks Hebrew, with typed text in automatic direction', async () => {
    open('he');
    const d = await openDrawer('Carl');
    const toggle = within(d).getByRole('button', { name: 'סיכום יום' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(within(d).getByRole('textbox', { name: 'סיכום יום' }).getAttribute('dir')).toBe('auto');
    expect(within(d).getByRole('textbox', { name: 'מה קרה?' }).getAttribute('dir')).toBe('auto');
    expect(within(d).getByRole('button', { name: 'סימון כנבדק' })).toBeTruthy();
    expect(within(d).getByText('פתוח')).toBeTruthy();
  });
});

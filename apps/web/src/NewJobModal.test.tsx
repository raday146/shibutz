import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { daySummary, emptyDay, fakeApi, renderConsole } from './test/render';
import type { Routes } from './test/render';

const skill = { id: 1, code: 'hvac', nameEn: 'HVAC', nameHe: 'מיזוג' };
const newJob = (day: string) => ({
  id: 7, title: 'Fix AC', address: 'Herzl 1', location: [34.9, 32.2], skillIds: [1], serviceDurationS: 1800,
  windowStart: `${day}T07:00:00.000Z`, windowEnd: `${day}T10:00:00.000Z`, priority: 50, status: 'unassigned', day, unassignedReason: null, unassignedAt: null,
});

type Fetch = ReturnType<typeof vi.fn>;
type Impl = (path: string, init?: RequestInit) => Promise<unknown>;

function open(day = '2026-11-02'): Fetch {
  localStorage.setItem('shibutz.date', day);
  localStorage.setItem('shibutz.lang', 'en');
  const routes: Routes = {
    ...emptyDay,
    '/skills': [skill],
    '/jobs': [],
    [`/days/${day}/summary`]: daySummary(day),
    '/jobs/7/insertion-suggestions?limit=3': { jobId: 7, date: day, options: [], rejections: [] },
  };
  const fetch = fakeApi(routes);
  const base = fetch.getMockImplementation() as Impl;
  // POST /jobs answers with the new job and lists it from then on.
  fetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path === '/jobs' && init?.method === 'POST') {
      routes['/jobs'] = [newJob(day)];
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(newJob(day)) });
    }
    return base(path);
  });
  renderConsole();
  return fetch;
}

const posted = (fetch: Fetch): { windowStart: string; windowEnd: string; priority: number } | undefined => {
  const call = fetch.mock.calls.find(([p, i]) => p === '/jobs' && i?.method === 'POST');
  return call && JSON.parse(call[1].body as string);
};

const openModal = async (): Promise<HTMLElement> => {
  const add = (await screen.findAllByRole('button', { name: 'Add job' }))[0]!;
  add.focus();
  await userEvent.click(add);
  return add;
};
async function fill(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Title'), 'Fix AC');
  await userEvent.type(screen.getByLabelText('Address'), 'Herzl 1');
  await userEvent.click(screen.getByRole('checkbox', { name: 'HVAC' }));
}
const pickByClick = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Set location on map' }));
  await userEvent.click(screen.getByRole('button', { name: 'map click' }));
};
const create = (): Promise<void> => userEvent.click(screen.getByRole('button', { name: 'Create and find a slot' }));

describe('new-job modal', () => {
  it('opens on the Title field, has no priority, and Escape returns focus to the trigger', async () => {
    open();
    const add = await openModal();
    const dialog = screen.getByRole('dialog', { name: /New job/ });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
    expect(within(dialog).queryByText(/priority/i)).toBeNull();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(add);
  });

  it('traps Tab inside the dialog in both directions', async () => {
    open();
    await openModal();
    const close = screen.getByRole('button', { name: 'Close' });
    close.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Title'));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(close);
  });

  it('shows every validation message inline and creates nothing', async () => {
    const fetch = open();
    await openModal();
    await userEvent.clear(screen.getByLabelText('Service time (minutes)'));
    await create();
    for (const m of ['Enter a title.', 'Enter an address.', 'Pick at least one skill.', 'Service time must be more than 0.', 'Set a location on the map.']) {
      expect(screen.getByText(m)).toBeTruthy();
    }
    expect(screen.getByLabelText('Title').getAttribute('aria-invalid')).toBe('true');
    expect(posted(fetch)).toBeUndefined();

    await userEvent.type(screen.getByLabelText('Title'), 'x');
    expect(screen.queryByText('Enter a title.')).toBeNull();
  });

  it('map-pick: Escape steps back one layer at a time and keeps entries and focus', async () => {
    open();
    await openModal();
    await userEvent.type(screen.getByLabelText('Title'), 'Keep me');

    await userEvent.click(screen.getByRole('button', { name: 'Set location on map' }));
    expect(screen.queryByRole('dialog')).toBeNull(); // collapsed to the bar
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Keep me');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Set location on map' }));

    await pickByClick();
    expect(screen.getByText(/Location set/).textContent).toContain('32.2000, 34.9000');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change location' }));

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('map-pick: Tab loops between the pick bar and the map so the keyboard can pan and come back', async () => {
    open();
    await openModal();
    await userEvent.click(screen.getByRole('button', { name: 'Set location on map' }));
    screen.getByRole('button', { name: 'Back' }).focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Map'));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Use this point' }));
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(screen.getByLabelText('Map'));
  });

  it('map-pick by the center crosshair and Use this point', async () => {
    open();
    await openModal();
    await userEvent.click(screen.getByRole('button', { name: 'Set location on map' }));
    await userEvent.click(screen.getByRole('button', { name: 'pan map' }));
    await userEvent.click(screen.getByRole('button', { name: 'Use this point' }));
    expect(screen.getByText(/Location set/).textContent).toContain('32.0000, 34.7000');
  });

  it.each([
    ['winter', '2026-11-02', '2026-11-02T07:00:00.000Z', '2026-11-02T12:00:00.000Z'],
    ['summer', '2026-07-01', '2026-07-01T06:00:00.000Z', '2026-07-01T11:00:00.000Z'],
  ])('sends the Israel-time window as UTC for a %s date, with priority 50', async (_season, day, start, end) => {
    const fetch = open(day);
    await openModal();
    await fill();
    await pickByClick();
    await create();
    await waitFor(() => expect(posted(fetch)).toBeTruthy());
    expect(posted(fetch)).toMatchObject({ windowStart: start, windowEnd: end, priority: 50 });
  });

  it('on create closes the modal and opens Unassigned with the new job on top and its options expanded', async () => {
    open();
    await openModal();
    await fill();
    await pickByClick();
    await create();
    await waitFor(() => expect(screen.getByRole('tab', { name: /Unassigned/ }).getAttribute('aria-selected')).toBe('true'));
    expect(screen.queryByRole('dialog')).toBeNull();
    const row = (await screen.findAllByRole('listitem')).find((r) => r.id === 'job-7')!;
    expect(within(row).getByRole('button', { name: /Close, the job stays unassigned/ })).toBeTruthy();
  });

  it('keeps the new job visible and shows the slot failure at its row when the suggestions fail', async () => {
    const fetch = open();
    await openModal();
    await fill();
    await pickByClick();
    const base = fetch.getMockImplementation() as Impl;
    fetch.mockImplementation((path: string, init?: RequestInit) =>
      path.startsWith('/jobs/7/insertion-suggestions') ? Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'osrm down' }) }) : base(path, init));
    await create();
    const row = (await screen.findAllByRole('listitem')).find((r) => r.id === 'job-7')!;
    expect(await within(row).findByText(/osrm down/)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetch.mock.calls.filter(([p, i]) => p === '/jobs' && i?.method === 'POST')).toHaveLength(1);
  });

  it('keeps the dialog and shows the failure when the create is refused', async () => {
    const fetch = open();
    await openModal();
    await fill();
    await pickByClick();
    const base = fetch.getMockImplementation() as Impl;
    fetch.mockImplementation((path: string, init?: RequestInit) =>
      init?.method === 'POST' ? Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ message: 'bad skill' }) }) : base(path, init));
    await create();
    expect((await screen.findByText(/Couldn't create the job. bad skill/)).closest('[role=dialog]')).toBeTruthy();
  });
});

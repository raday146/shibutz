import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { daySummary, fakeApi, renderConsole } from './test/render';
import type { Routes } from './test/render';

const DAY = '2026-11-02';
const T0 = '2026-11-02T07:00:00.000Z';
const tech = (id: number, name: string, color: number, skillIds: number[] = []) => ({ id, name, home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds, color });
const job = (id: number) => ({
  id, title: `Job ${id}`, address: `Addr ${id}`, location: [34.8, 32.1], skillIds: [1], serviceDurationS: 1800, windowStart: T0, windowEnd: '2026-11-02T10:00:00.000Z',
  priority: 50, status: 'unassigned', day: DAY, unassignedReason: 'NO_SKILLED_TECHNICIAN', unassignedAt: T0,
});
const sumTech = (technicianId: number, stopCount: number, doneCount = 0, openIncidents = 0) => ({ technicianId, stopCount, doneCount, driveS: 0, expectedFinish: null, openIncidents, stops: [] });
const stop = { jobId: 9, title: 'S', address: 'A', sequence: 1, location: [34.8, 32.1], eta: T0, etd: T0, actualArrival: null, actualDeparture: null };

function api(stops: number, jobs = [job(1), job(2)]): Routes {
  return {
    '/technicians': [tech(1, 'Bob', 3, [1]), tech(2, 'Alice', 5), tech(3, 'Carl', 7)],
    '/jobs': jobs,
    '/skills': [{ id: 1, code: 'hvac', nameEn: 'HVAC', nameHe: 'מיזוג' }],
    [`/days/${DAY}/summary`]: daySummary(DAY, { total: 2, unassigned: jobs.length }, [sumTech(1, stops, 1, 2), sumTech(2, 0), sumTech(3, 0)]),
    [`/routes/1/${DAY}`]: { technicianId: 1, date: DAY, stops: stops ? [stop] : [], geometry: null },
  };
}
const open = (routes: Routes, lang: 'he' | 'en' = 'en'): void => {
  localStorage.setItem('shibutz.date', DAY);
  localStorage.setItem('shibutz.lang', lang);
  fakeApi(routes);
  renderConsole();
};
const tab = (name: RegExp): Promise<HTMLElement> => screen.findByRole('tab', { name });
const selected = (name: RegExp): string | null => screen.getByRole('tab', { name }).getAttribute('aria-selected');

describe('left panel switch', () => {
  it('defaults to Unassigned when jobs are unassigned and nothing is planned', async () => {
    open(api(0));
    expect((await tab(/Unassigned \(2\)/)).getAttribute('aria-selected')).toBe('true');
    expect((await screen.findAllByText('No technician has all the required skills.')).length).toBe(2);
  });

  it('defaults to Technicians once a route has a stop', async () => {
    open(api(1));
    expect((await tab(/Technicians/)).getAttribute('aria-selected')).toBe('true');
  });

  it('defaults to Technicians with no unassigned jobs', async () => {
    open(api(0, []));
    await screen.findByText('Alice');
    expect(selected(/Technicians/)).toBe('true');
  });

  it('moves with arrow keys, mirrored in right-to-left', async () => {
    open(api(0), 'he');
    const unassigned = await tab(/לא משובצות \(2\)/);
    unassigned.focus();
    await userEvent.keyboard('{ArrowLeft}'); // Unassigned is the second tab, which sits on the left in RTL: already last
    expect(unassigned.getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowRight}');
    const techs = screen.getByRole('tab', { name: /טכנאים/ });
    expect(techs.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(techs);
    await userEvent.keyboard('{ArrowLeft}');
    expect(unassigned.getAttribute('aria-selected')).toBe('true');
  });

  it('moves with arrow keys in left-to-right', async () => {
    open(api(0));
    const unassigned = await tab(/Unassigned/);
    unassigned.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(selected(/Unassigned/)).toBe('true');
    await userEvent.keyboard('{ArrowLeft}');
    expect(selected(/Technicians/)).toBe('true');
    await userEvent.keyboard('{ArrowRight}');
    expect(selected(/Unassigned/)).toBe('true');
  });

  it('the Unassigned KPI opens Unassigned', async () => {
    open(api(1));
    await tab(/Technicians/);
    await userEvent.click(await screen.findByRole('button', { name: 'Unassigned 2' }));
    expect(selected(/Unassigned/)).toBe('true');
  });

  it('an unassigned pin opens Unassigned and highlights its row; a technician on the map opens Technicians', async () => {
    open(api(1));
    await userEvent.click(await screen.findByRole('button', { name: 'pin 2' }));
    expect(selected(/Unassigned/)).toBe('true');
    expect(screen.getByText('Job 2').closest('li')?.getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('Job 1').closest('li')?.getAttribute('aria-current')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'route 1' }));
    expect(selected(/Technicians/)).toBe('true');
  });
});

describe('technician rows', () => {
  it('are sorted for the language and show shift, skills, progress and incidents; idle ones are muted', async () => {
    open(api(2));
    const rows = within(await screen.findByRole('list', { name: 'Technicians' })).getAllByRole('listitem');
    expect(rows.map((r) => r.querySelector('b')?.textContent)).toEqual(['Alice', 'Bob', 'Carl']);
    const bob = rows[1] as HTMLElement;
    expect(bob.textContent).toContain('08:00-16:00');
    expect(bob.textContent).toContain('HVAC');
    expect(within(bob).getByRole('progressbar').getAttribute('aria-valuetext')).toBe('1/2 done');
    expect(bob.textContent).toContain('Open incidents: 2');
    expect(rows[0]?.className).toContain('idle');
    expect(rows[0]?.textContent).toContain('No stops');
  });

  it('select the technician on the map', async () => {
    open(api(1));
    await userEvent.click(await screen.findByRole('button', { name: /Bob/ }));
    expect(screen.getByRole('button', { name: /Bob/ }).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-selected="true"]')?.getAttribute('data-color')).toBe('3');
  });
});

describe('unassigned rows', () => {
  it('are collapsed, expand to address, window and skills, and offer Find a slot', async () => {
    open(api(0));
    const toggle = await screen.findByRole('button', { name: /Job 1/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Addr 1')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Find a slot' })).toHaveLength(2);
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Addr 1')).toBeTruthy();
    expect(screen.getByText('HVAC')).toBeTruthy();
    expect(screen.getByText('Addr 1').parentElement?.textContent).toContain('Window 09:00–12:00');
  });
});

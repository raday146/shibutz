import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { daySummary, emptyDay, fakeApi, renderConsole } from './test/render';
import { today } from './map';

const tech = (id: number, color: number) => ({ id, name: `T${id}`, home: [34.8, 32.1], shiftStart: '08:00:00', shiftEnd: '16:00:00', skillIds: [], color });
const stop = { jobId: 1, title: 'J', address: 'A', sequence: 1, location: [34.8, 32.1], eta: '2026-11-02T07:00:00.000Z', etd: '2026-11-02T07:30:00.000Z', actualArrival: null, actualDeparture: null };
const route = (technicianId: number, stops: unknown[]) => ({ technicianId, date: today(), stops, geometry: null });
const summaryTech = (technicianId: number, stopCount: number) => ({ technicianId, stopCount, doneCount: 0, driveS: 0, expectedFinish: null, openIncidents: 0, stops: [] });

const day = {
  ...emptyDay,
  '/technicians': [tech(1, 3), tech(2, 5), tech(3, 7)],
  [`/days/${today()}/summary`]: daySummary(today(), { total: 2, assigned: 2 }, [summaryTech(1, 1), summaryTech(2, 1), summaryTech(3, 0)]),
  [`/routes/1/${today()}`]: route(1, [stop]),
  [`/routes/2/${today()}`]: route(2, [{ ...stop, jobId: 2 }]),
};

const routeItems = (): HTMLElement[] => within(screen.getByRole('list', { name: 'routes' })).getAllByRole('listitem');

describe('map ownership', () => {
  it('draws every technician route that has stops, in the owner color', async () => {
    fakeApi(day);
    renderConsole();
    await screen.findByRole('button', { name: 'route 2' });
    expect(routeItems().map((li) => li.getAttribute('data-color'))).toEqual(['3', '5']);
    expect(routeItems().map((li) => li.getAttribute('data-selected'))).toEqual(['false', 'false']);
  });

  it('selects the owner when a route is picked on the map, without refetching the routes', async () => {
    const fetch = fakeApi(day);
    renderConsole();
    await userEvent.click(await screen.findByRole('button', { name: 'route 2' }));
    expect(routeItems().map((li) => li.getAttribute('data-selected'))).toEqual(['false', 'true']);
    expect(fetch.mock.calls.filter(([p]) => p === `/routes/1/${today()}`)).toHaveLength(1);
  });
});

describe('map key', () => {
  it('is collapsed, opens and explains owner color, status marks and the unassigned pin', async () => {
    fakeApi(emptyDay);
    renderConsole();
    const summary = await screen.findByText('מקרא');
    const details = summary.closest('details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await userEvent.click(summary); // the browser toggles it from Enter and Space too
    expect(details.open).toBe(true);
    for (const text of ['הצבע מציין את הטכנאי', 'הסימן על הנקודה מציין מצב', 'משובצת', 'בביצוע', 'הושלמה', 'לא משובצת']) {
      expect(within(details).getByText(text)).toBeTruthy();
    }
  });
});

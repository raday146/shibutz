import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import type { Props as MapProps } from '../components/MapView';

// Web component test seam: the real console runs against a fake fetch (see render.tsx) and the map is stubbed, since jsdom has no layout.
// The stub exposes what the real map would draw: one entry per route, with its owner's color.
vi.mock('../components/MapView', () => ({
  MapView: ({ technicians, routes, dayJobs, selected, highlighted, preview, onSelect, onSelectStop, onSelectJob }: MapProps) => (
    <>
    <ul aria-label="stops">
      {routes.flatMap((r) => r.stops).map((s) => (
        <li key={s.jobId} data-highlighted={s.jobId === highlighted}>
          <button onClick={() => onSelectStop(routes.find((r) => r.stops.includes(s))?.technicianId ?? 0, s.jobId)}>{`stop ${s.jobId}`}</button>
        </li>
      ))}
    </ul>
    <ul aria-label="routes">
      {preview && <li data-testid="preview" data-color={preview.color} data-points={JSON.stringify(preview.points)} />}
      {dayJobs.filter((j) => j.status === 'unassigned').map((j) => (
        <li key={`j${j.id}`}><button onClick={() => onSelectJob(j.id)}>{`pin ${j.id}`}</button></li>
      ))}
      {routes.map((r) => (
        <li key={r.technicianId} data-color={technicians.find((t) => t.id === r.technicianId)?.color} data-selected={r.technicianId === selected}>
          <button onClick={() => onSelect(r.technicianId)}>{`route ${r.technicianId}`}</button>
        </li>
      ))}
    </ul>
    </>
  ),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

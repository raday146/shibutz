import { useCallback, useEffect, useState } from 'react';
import { latLngBounds } from 'leaflet';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import type { Job, RouteView, Technician } from '@shibutz/contracts';
import { fetchJobs, fetchRoute, fetchTechnicians, runOptimization } from './api';
import { JOB_STATUSES, statusColor, toLatLng, toLatLngs, unassignedRows } from './map';

const SEED_DAY = '2026-11-02';
const CENTER: [number, number] = [32.05, 34.85];
const time = (iso: string): string => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

type Point = [number, number];

/** Fits the map to `points` when `fitKey` changes or the points first appear; later reloads keep the user's view. */
function FitTo({ points, fitKey }: { points: Point[]; fitKey: string }): null {
  const map = useMap();
  const hasPoints = points.length > 0;
  useEffect(() => {
    if (hasPoints) map.fitBounds(latLngBounds(points), { padding: [30, 30] });
    // points is deliberately not a dependency: refit on a new target only, not on every reload
  }, [map, fitKey, hasPoints]);
  return null;
}

/** Moves the map to a clicked unassigned job. */
function FlyTo({ target }: { target: Point | null }): null {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 14);
  }, [map, target]);
  return null;
}

export function App(): React.JSX.Element {
  const [date, setDate] = useState(SEED_DAY);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [route, setRoute] = useState<RouteView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reasons, setReasons] = useState<Map<number, string>>(new Map());
  const [focus, setFocus] = useState<Point | null>(null);

  // One reload for everything the map shows; also called after a batch run.
  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setRoute((r) => (r && r.technicianId === selected ? r : null)); // do not show another technician's route while loading
    try {
      const [t, j, r] = await Promise.all([
        fetchTechnicians(),
        fetchJobs(),
        selected === null ? Promise.resolve(null) : fetchRoute(selected, date),
      ]);
      setTechnicians(t);
      setJobs(j);
      setRoute(r);
      setError('');
    } catch (e) {
      setRoute(null); // never leave another technician's route on screen next to this error
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [selected, date]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function optimize(): Promise<void> {
    setBusy(true);
    try {
      const plan = await runOptimization(date);
      setReasons(new Map(plan.unassigned.map((u) => [u.jobId, u.reason])));
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const dayJobs = jobs.filter((j) => j.day === date);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const unassigned = unassignedRows(dayJobs, date, reasons);
  const allPoints: Point[] = [...technicians.map((t) => toLatLng(t.home)), ...dayJobs.map((j) => toLatLng(j.location))];

  return (
    <div className="app">
      <aside className="side">
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />{' '}
        <button onClick={() => void optimize()} disabled={busy}>
          {busy ? 'Running...' : 'Run optimization'}
        </button>
        {error && <p className="error">{error}</p>}
        {loading && <p className="muted">Loading...</p>}
        <ul className="legend">
          {JOB_STATUSES.map((s) => (
            <li key={s}>
              <span className="dot" style={{ background: statusColor(s) }} /> {s.replace('_', ' ')}
            </li>
          ))}
          <li>
            <span className="dot home" /> technician home
          </li>
        </ul>
        <h2>Technicians</h2>
        <ul>
          {technicians.map((t) => (
            <li key={t.id}>
              <button className={t.id === selected ? 'on' : ''} onClick={() => setSelected(t.id === selected ? null : t.id)}>
                {t.name}
              </button>
            </li>
          ))}
        </ul>
        {unassigned.length > 0 && (
          <>
            <h2>Unassigned ({unassigned.length})</h2>
            <ul>
              {unassigned.map((u) => (
                <li key={u.jobId}>
                  <button onClick={() => setFocus(toLatLng(u.location))}>
                    Job {u.jobId}{u.reason ? `: ${u.reason}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {route && (
          <>
            <h2>Route {route.date}</h2>
            {route.stops.length === 0 && <p>No stops.</p>}
            <ol>
              {route.stops.map((s) => (
                <li key={s.jobId}>
                  Job {s.jobId} ({jobById.get(s.jobId)?.status ?? '?'}): ETA {time(s.eta)}, leave {time(s.etd)}
                </li>
              ))}
            </ol>
          </>
        )}
      </aside>
      <MapContainer className="map" center={CENTER} zoom={10}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <FitTo points={route?.geometry ? toLatLngs(route.geometry.coordinates) : allPoints} fitKey={route ? `route${route.technicianId}` : 'all'} />
        <FlyTo target={focus} />
        {route?.geometry && <Polyline positions={toLatLngs(route.geometry.coordinates)} color="#111827" weight={4} />}
        {dayJobs.map((j) => (
          <CircleMarker key={`j${j.id}`} center={toLatLng(j.location)} radius={6} pathOptions={{ color: statusColor(j.status), fillOpacity: 0.8 }}>
            <Tooltip>{`Job ${j.id}: ${j.status}`}</Tooltip>
          </CircleMarker>
        ))}
        {technicians.map((t) => (
          <CircleMarker
            key={`t${t.id}`}
            center={toLatLng(t.home)}
            radius={9}
            pathOptions={{ color: '#111827', fillColor: '#fff', fillOpacity: 1, weight: 3 }}
            eventHandlers={{ click: () => setSelected(t.id) }}
          >
            <Tooltip>{`${t.name} (home)`}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { latLngBounds } from 'leaflet';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { InsertionOption, InsertionSuggestions, Job, LonLat, RouteView, Skill, Technician } from '@shibutz/contracts';
import { ApiError, createJob, fetchJobs, fetchRoute, fetchSkills, fetchSuggestions, fetchTechnicians, insertJob, runOptimization } from './api';
import { JOB_STATUSES, jerusalemToIso, positionLabel, shiftLabel, skillLabel, statusColor, toLatLng, toLatLngs, unassignedRows } from './map';

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

/** Reports map clicks while the new-job form is waiting for a location. */
function PickLocation({ active, onPick }: { active: boolean; onPick: (at: LonLat) => void }): null {
  useMapEvents({ click: (e) => active && onPick([e.latlng.lng, e.latlng.lat]) });
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
  const [skills, setSkills] = useState<Skill[]>([]);
  // New-job form: `picking` waits for a map click; `suggestions` is the panel shown after the job was created.
  const [picking, setPicking] = useState(false);
  const [at, setAt] = useState<LonLat | null>(null);
  const [skillIds, setSkillIds] = useState<number[]>([]);
  const [minutes, setMinutes] = useState(30);
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('14:00');
  const [suggestions, setSuggestions] = useState<InsertionSuggestions | null>(null);
  const [notice, setNotice] = useState('');

  // One reload for everything the map shows; also called after a batch run.
  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setRoute((r) => (r && r.technicianId === selected ? r : null)); // do not show another technician's route while loading
    try {
      const [t, j, r, sk] = await Promise.all([
        fetchTechnicians(),
        fetchJobs(),
        selected === null ? Promise.resolve(null) : fetchRoute(selected, date),
        fetchSkills(),
      ]);
      setSkills(sk);
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

  async function submitJob(): Promise<void> {
    if (!at) return setError('Click the map to set the job location');
    if (skillIds.length === 0) return setError('Pick at least one skill');
    if (!(minutes > 0) || from >= to) return setError('Duration must be positive and the window must end after it starts');
    setBusy(true);
    try {
      const job = await createJob({
        location: at,
        skillIds,
        serviceDurationS: Math.round(minutes * 60),
        windowStart: jerusalemToIso(date, from),
        windowEnd: jerusalemToIso(date, to),
        priority: 50,
      });
      setPicking(false);
      setAt(null);
      setNotice('');
      setSuggestions(await fetchSuggestions(job.id));
      await reload(); // the new job is on the map, unassigned, whatever the user picks next
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function choose(option: InsertionOption): Promise<void> {
    if (!suggestions) return;
    setBusy(true);
    try {
      await insertJob(suggestions.jobId, { technicianId: option.technicianId, position: option.position, routeVersion: option.routeVersion });
      setSuggestions(null);
      setNotice('');
      if (option.technicianId === selected) await reload();
      else setSelected(option.technicianId); // the selection change reloads route, jobs (colours) and the unassigned list
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setNotice(`The route changed since these options were computed (${e.message}). Refreshed, please choose again.`);
        try {
          setSuggestions(await fetchSuggestions(suggestions.jobId));
        } catch (again) {
          setSuggestions(null); // e.g. the job is no longer unassigned
          setError(errorText(again));
        }
        await reload();
      } else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const techName = (id: number): string => technicians.find((t) => t.id === id)?.name ?? `#${id}`;
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
              <div className="muted">{shiftLabel(t.shiftStart, t.shiftEnd)} · {skillLabel(t.skillIds, skills) || 'no skills'}</div>
            </li>
          ))}
        </ul>
        <h2>New job ({date})</h2>
        {!picking && !at ? (
          <button onClick={() => { setPicking(true); setError(''); }}>Add job: click the map</button>
        ) : (
          <div className="form">
            <p className="muted">{at ? `Location ${at[1].toFixed(4)}, ${at[0].toFixed(4)} (click the map to move it)` : 'Click the map to set the location'}</p>
            {skills.map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={skillIds.includes(s.id)}
                  onChange={(e) => setSkillIds(e.target.checked ? [...skillIds, s.id] : skillIds.filter((x) => x !== s.id))}
                />{' '}
                {s.name}
              </label>
            ))}
            <label>Duration (min) <input type="number" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label>
            <label>Window <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} /> - <input type="time" value={to} onChange={(e) => setTo(e.target.value)} /> (Israel time)</label>
            <div>
              <button onClick={() => void submitJob()} disabled={busy || !at}>Create and suggest</button>{' '}
              <button onClick={() => { setPicking(false); setAt(null); }}>Cancel</button>
            </div>
          </div>
        )}
        {suggestions && (
          <>
            <h2>Options for Job {suggestions.jobId}</h2>
            {notice && <p className="error">{notice}</p>}
            {suggestions.options.length === 0 && <p>No technician can take it:</p>}
            <ol className="options">
              {suggestions.options.map((o) => (
                <li key={`${o.technicianId}-${o.position.afterJobId}-${o.position.beforeJobId}`}>
                  <button disabled={busy} onClick={() => void choose(o)}>
                    <b>{techName(o.technicianId)}</b>: {positionLabel(o.position)}, detour {Math.round(o.detourS / 60)} min
                    <div className="muted">{o.etas.map((e) => `Job ${e.jobId} ${time(e.eta)}`).join(' → ')}</div>
                  </button>
                </li>
              ))}
            </ol>
            {suggestions.options.length === 0 && (
              <ul>
                {suggestions.rejections.map((r) => (
                  <li key={r.technicianId}>{techName(r.technicianId)}: {r.reason}</li>
                ))}
              </ul>
            )}
            <button onClick={() => { setSuggestions(null); setNotice(''); }}>Close (job stays unassigned)</button>
          </>
        )}
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
        <PickLocation active={picking || at !== null} onPick={setAt} />
        {at && <CircleMarker center={toLatLng(at)} radius={8} pathOptions={{ color: '#dc2626', dashArray: '3' }} />}
        {route?.geometry && <Polyline positions={toLatLngs(route.geometry.coordinates)} color="#111827" weight={4} />}
        {dayJobs.map((j) => (
          <CircleMarker key={`j${j.id}`} center={toLatLng(j.location)} radius={6} pathOptions={{ color: statusColor(j.status), fillOpacity: 0.8 }}>
            <Tooltip>{`Job ${j.id}: ${j.status}, needs ${skillLabel(j.skillIds, skills)}`}</Tooltip>
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

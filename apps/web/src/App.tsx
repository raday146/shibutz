import { useCallback, useEffect, useState } from 'react';
import type { InsertionOption, InsertionSuggestions, Job, LonLat, RouteView, Skill, Technician } from '@shibutz/contracts';
import { ApiError, createJob, fetchJobs, fetchRoute, fetchSkills, fetchSuggestions, fetchTechnicians, insertJob, runOptimization } from './api';
import { jerusalemToIso, unassignedRows } from './map';
import type { Key, Vars } from './i18n';
import { useLang } from './lang';
import { Legend } from './components/Legend';
import { MapView } from './components/MapView';
import type { Point } from './components/MapView';
import { NewJobForm } from './components/NewJobForm';
import type { JobDraft } from './components/NewJobForm';
import { RouteStops } from './components/RouteStops';
import { Suggestions } from './components/Suggestions';
import { TechnicianList } from './components/TechnicianList';
import { TopBar } from './components/TopBar';
import { UnassignedList } from './components/UnassignedList';

const SEED_DAY = '2026-11-02';
/** A message to show, kept untranslated until render so a language change does not reload data. */
interface Problem { key: Key; vars?: Vars }
const problem = (e: unknown): Problem =>
  e instanceof TypeError ? { key: 'error.network' } : { key: 'error.action', vars: { message: e instanceof Error ? e.message : String(e) } };

export function App(): React.JSX.Element {
  const { t } = useLang();
  const [date, setDate] = useState(SEED_DAY);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [route, setRoute] = useState<RouteView | null>(null);
  const [error, setError] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reasons, setReasons] = useState<Map<number, string>>(new Map());
  const [focus, setFocus] = useState<Point | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  // New-job form: `picking` waits for a map click; `suggestions` is the panel shown after the job was created.
  const [picking, setPicking] = useState(false);
  const [at, setAt] = useState<LonLat | null>(null);
  const [draft, setDraft] = useState<JobDraft>({ title: '', address: '', skillIds: [], minutes: 30, from: '09:00', to: '14:00' });
  const [suggestions, setSuggestions] = useState<InsertionSuggestions | null>(null);
  const [stale, setStale] = useState(false);

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
      setError(null);
    } catch (e) {
      setRoute(null); // never leave another technician's route on screen next to this error
      setError(problem(e));
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
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitJob(): Promise<void> {
    const { title, address, skillIds, minutes, from, to } = draft;
    if (!at) return setError({ key: 'validation.location' });
    if (skillIds.length === 0) return setError({ key: 'validation.skills' });
    if (!(minutes > 0)) return setError({ key: 'validation.duration' });
    if (from >= to) return setError({ key: 'validation.window' });
    setBusy(true);
    try {
      const job = await createJob({
        title,
        address,
        location: at,
        skillIds,
        serviceDurationS: Math.round(minutes * 60),
        windowStart: jerusalemToIso(date, from),
        windowEnd: jerusalemToIso(date, to),
        priority: 50,
      });
      setPicking(false);
      setAt(null);
      setDraft((d) => ({ ...d, title: '', address: '' }));
      setStale(false);
      setSuggestions(await fetchSuggestions(job.id));
      await reload(); // the new job is on the map, unassigned, whatever the user picks next
    } catch (e) {
      setError(problem(e));
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
      setStale(false);
      if (option.technicianId === selected) await reload();
      else setSelected(option.technicianId); // the selection change reloads route, jobs (colours) and the unassigned list
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStale(true);
        try {
          setSuggestions(await fetchSuggestions(suggestions.jobId));
        } catch (again) {
          setSuggestions(null); // e.g. the job is no longer unassigned
          setError(problem(again));
        }
        await reload();
      } else setError(problem(e));
    } finally {
      setBusy(false);
    }
  }

  const techName = (id: number): string => technicians.find((t) => t.id === id)?.name ?? `#${id}`;
  const dayJobs = jobs.filter((j) => j.day === date);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const unassigned = unassignedRows(dayJobs, date, reasons);

  return (
    <div className="app">
      <aside className="side">
        <TopBar date={date} busy={busy} loading={loading} error={error ? t(error.key, error.vars) : ''} onDate={setDate} onOptimize={() => void optimize()} />
        <Legend />
        <TechnicianList technicians={technicians} skills={skills} selected={selected} onSelect={setSelected} />
        <NewJobForm
          date={date}
          skills={skills}
          picking={picking}
          at={at}
          draft={draft}
          busy={busy}
          onDraft={setDraft}
          onStart={() => { setPicking(true); setError(null); }}
          onCancel={() => { setPicking(false); setAt(null); }}
          onSubmit={() => void submitJob()}
        />
        {suggestions && (
          <Suggestions
            suggestions={suggestions}
            notice={stale ? t('slot.stale') : ''}
            busy={busy}
            techName={techName}
            onChoose={(o) => void choose(o)}
            onClose={() => { setSuggestions(null); setStale(false); }}
          />
        )}
        <UnassignedList rows={unassigned} onFocus={setFocus} />
        {route && <RouteStops route={route} jobById={jobById} />}
      </aside>
      <main className="main">
        <MapView
          technicians={technicians}
          dayJobs={dayJobs}
          skills={skills}
          route={route}
          focus={focus}
          picking={picking}
          at={at}
          onPick={setAt}
          onSelect={setSelected}
        />
      </main>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import type { DaySummary, InsertionOption, InsertionSuggestions, Job, LonLat, RouteView, Skill, Technician } from '@shibutz/contracts';
import { ApiError, createJob, fetchDaySummary, fetchJobs, fetchRoute, fetchSkills, fetchSuggestions, fetchTechnicians, insertJob, runOptimization } from './api';
import { jerusalemToIso, today, unassignedRows } from './map';
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

const DATE_KEY = 'shibutz.date';
/** The last viewed date, else today; browser storage can be blocked. */
function openingDate(): string {
  try {
    const saved = localStorage.getItem(DATE_KEY);
    if (saved && /^\d{4}-\d\d-\d\d$/.test(saved)) return saved;
  } catch {
    // storage unavailable: start on today
  }
  return today();
}

/** A message to show, kept untranslated until render so a language change does not reload data. */
interface Problem { key: Key; vars?: Vars }
const problem = (e: unknown): Problem =>
  e instanceof TypeError ? { key: 'error.network' } : { key: 'error.action', vars: { message: e instanceof Error ? e.message : String(e) } };

export function App(): React.JSX.Element {
  const { t } = useLang();
  const [date, setDateState] = useState(openingDate);
  const setDate = (d: string): void => {
    setDateState(d);
    try {
      localStorage.setItem(DATE_KEY, d);
    } catch {
      // storage unavailable: the date is not remembered
    }
  };
  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [routes, setRoutes] = useState<RouteView[]>([]);
  const [error, setError] = useState<Problem | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
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
    try {
      const [t, j, sk, sum] = await Promise.all([fetchTechnicians(), fetchJobs(), fetchSkills(), fetchDaySummary(date)]);
      // Every route is drawn in its owner's color, so fetch one per technician that has stops.
      const r = await Promise.all(sum.technicians.filter((x) => x.stopCount > 0).map((x) => fetchRoute(x.technicianId, date)));
      setSummary(sum);
      setSkills(sk);
      setTechnicians(t);
      setJobs(j);
      setRoutes(r);
      setError(null);
    } catch (e) {
      setSummary(null);
      setRoutes([]); // never leave routes on screen next to this error
      setError(problem(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function optimize(): Promise<void> {
    setBusy(true);
    try {
      await runOptimization(date);
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
      await reload();
      setSelected(option.technicianId);
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
  const route = routes.find((r) => r.technicianId === selected) ?? null;
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const unassigned = unassignedRows(dayJobs, date);

  return (
    <div className="app">
      <TopBar date={date} summary={summary} busy={busy} loading={loading} onDate={setDate} onRefresh={() => void reload()} onOptimize={() => void optimize()} />
      <div className="body">
      <aside className="side">
        {error && <p className="error" role="alert">{t(error.key, error.vars)}</p>}
        {summary?.totals.total === 0 && (
          <section className="empty">
            <h2>{t('empty.day.title')}</h2>
            <p className="muted">{t('empty.day.body')}</p>
            <button onClick={() => { setPicking(true); setError(null); }}>{t('job.add')}</button>
          </section>
        )}

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
          routes={routes}
          selected={selected}
          focus={focus}
          picking={picking}
          at={at}
          onPick={setAt}
          onSelect={setSelected}
        />
        <Legend />
      </main>
      </div>
    </div>
  );
}

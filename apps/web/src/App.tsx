import { useCallback, useEffect, useState } from 'react';
import type { DaySummary, InsertionOption, InsertionSuggestions, Job, LonLat, RouteView, Skill, Technician } from '@shibutz/contracts';
import { ApiError, createJob, fetchDaySummary, fetchJobs, fetchRoute, fetchSkills, fetchSuggestions, fetchTechnicians, insertJob, runOptimization } from './api';
import { jerusalemToIso, today, unassignedJobs } from './map';
import type { Key, Vars } from './i18n';
import { useLang } from './lang';
import { Legend } from './components/Legend';
import { MapView } from './components/MapView';
import type { Point } from './components/MapView';
import { PanelTabs } from './components/PanelTabs';
import type { Tab } from './components/PanelTabs';
import { NewJobForm } from './components/NewJobForm';
import type { JobDraft } from './components/NewJobForm';
import { RouteStops } from './components/RouteStops';
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
    setTab(null);
    try {
      localStorage.setItem(DATE_KEY, d);
    } catch {
      // storage unavailable: the date is not remembered
    }
  };
  // The user's choice of left-panel tab; null follows the default rule for the date.
  const [tab, setTab] = useState<Tab | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
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
  const [previewed, setPreviewed] = useState<InsertionOption | null>(null);

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
      setTab('unassigned');
      setPinned(job.id);
      await reload(); // the new job is on the map, unassigned, whatever the user picks next
    } catch (e) {
      setError(problem(e));
    } finally {
      setBusy(false);
    }
  }

  async function find(jobId: number): Promise<void> {
    setBusy(true);
    try {
      setPreviewed(null);
      setSuggestions(await fetchSuggestions(jobId));
      setStale(false);
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
      setPreviewed(null);
      setStale(false);
      await reload();
      selectTech(option.technicianId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStale(true);
        setPreviewed(null);
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

  const dayJobs = jobs.filter((j) => j.day === date);
  const route = routes.find((r) => r.technicianId === selected) ?? null;
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const unassigned = unassignedJobs(dayJobs, date);
  // Unassigned first when there is work to place and nothing is planned yet.
  const planned = !!summary?.technicians.some((x) => x.stopCount > 0);
  const current: Tab = tab ?? (unassigned.length > 0 && summary && !planned ? 'unassigned' : 'technicians');
  // Slot preview: previous stop (or home), the job, next stop (or home), in the option's technician color.
  const previewPath = ((): { points: LonLat[]; color: number } | null => {
    const job = suggestions && jobById.get(suggestions.jobId);
    const owner = previewed && technicians.find((x) => x.id === previewed.technicianId);
    if (!previewed || !job || !owner) return null;
    const stops = routes.find((r) => r.technicianId === owner.id)?.stops ?? [];
    const at = (id: number | null): LonLat => stops.find((s) => s.jobId === id)?.location ?? owner.home;
    return { points: [at(previewed.position.afterJobId), job.location, at(previewed.position.beforeJobId)], color: owner.color };
  })();
  const selectTech = (id: number | null): void => {
    setSelected(id);
    setTab('technicians');
  };

  return (
    <div className="app">
      <TopBar date={date} summary={summary} busy={busy} loading={loading} onDate={setDate} onRefresh={() => void reload()} onOptimize={() => void optimize()} onUnassigned={() => setTab('unassigned')} />
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

        <PanelTabs tab={current} unassignedCount={unassigned.length} onTab={setTab} />
        <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${current}`}>
          {current === 'technicians' ? (
            <TechnicianList technicians={technicians} days={summary?.technicians ?? []} skills={skills} selected={selected} onSelect={selectTech} />
          ) : (
            <>
              <UnassignedList
                jobs={unassigned}
                skills={skills}
                highlighted={pinned}
                busy={busy}
                onFocus={setFocus}
                onFind={(id) => void find(id)}
                slot={suggestions && {
                  suggestions,
                  notice: stale ? t('slot.stale') : '',
                  technicians,
                  titleOf: (id) => jobById.get(id)?.title ?? t('job.ref', { id }),
                  previewed,
                  onPreview: setPreviewed,
                  onChoose: (o) => void choose(o),
                  onClose: () => { setSuggestions(null); setStale(false); setPreviewed(null); },
                }}
              />
            </>
          )}
        </div>
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
          preview={previewPath}
          onPick={setAt}
          onSelect={selectTech}
          onSelectJob={(id) => { setTab('unassigned'); setPinned(id); }}
        />
        <Legend />
      </main>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DaySummary, Incident, JobStatus, InsertionOption, InsertionSuggestions, Job, LonLat, RouteView, Skill, Technician } from '@shibutz/contracts';
import { ApiError, createJob, fetchDaySummary, fetchJobs, fetchRoute, fetchSkills, fetchSuggestions, fetchTechnicians, insertJob, runOptimization, setJobStatus } from './api';
import { jerusalemToIso, today, unassignedJobs } from './map';
import type { Key, Vars } from './i18n';
import { useLang } from './lang';
import { Drawer } from './components/Drawer';
import { RegionError, Skeleton, Toasts } from './components/Feedback';
import { Legend } from './components/Legend';
import { MapView } from './components/MapView';
import type { Point } from './components/MapView';
import { PanelTabs } from './components/PanelTabs';
import type { Tab } from './components/PanelTabs';
import { NewJobModal } from './components/NewJobModal';
import type { JobDraft } from './components/NewJobModal';
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
    setFresh(null);
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
  // Drawer: the row that opened it (focus returns there), whether the keyboard did, and the stop linked with the map.
  const opener = useRef<HTMLElement | null>(null);
  const selectedNow = useRef<number | null>(null); // the selection as of now, since map handlers may hold older closures
  const [instant, setInstant] = useState(false);
  const [link, setLink] = useState<{ jobId: number } | null>(null);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const [routes, setRoutes] = useState<RouteView[]>([]);
  // One error per region, shown where it happened: the left panel, the map data (also the drawer's), the Plan day button, a job's slot search.
  const [panelError, setPanelError] = useState<Problem | null>(null);
  const [mapError, setMapError] = useState<Problem | null>(null);
  const [planError, setPlanError] = useState<Problem | null>(null);
  const [slotError, setSlotError] = useState<{ jobId: number; problem: Problem } | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focus, setFocus] = useState<Point | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  // New-job modal: `picking` waits for a map click or the center crosshair; `suggestions` is the panel shown after the job was created.
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [at, setAt] = useState<LonLat | null>(null);
  const [createError, setCreateError] = useState<Problem | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const center = useRef<LonLat | null>(null);
  const trigger = useRef<Element | null>(null);
  const [suggestions, setSuggestions] = useState<InsertionSuggestions | null>(null);
  const [stale, setStale] = useState(false);
  const [previewed, setPreviewed] = useState<InsertionOption | null>(null);

  // One reload for everything the map shows; also called after a batch run.
  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setPanelError(null);
    setMapError(null);
    try {
      const [t, j, sk, sum] = await Promise.all([fetchTechnicians(), fetchJobs(), fetchSkills(), fetchDaySummary(date)]);
      // Every route is drawn in its owner's color, so fetch one per technician that has stops.
      let r: RouteView[] = [];
      let routeProblem: Problem | null = null;
      try {
        r = await Promise.all(sum.technicians.filter((x) => x.stopCount > 0).map((x) => fetchRoute(x.technicianId, date)));
      } catch (e) {
        routeProblem = problem(e); // the left panel still has its data
      }
      setSummary(sum);
      setSkills(sk);
      setTechnicians(t);
      setJobs(j);
      setRoutes(r);
      setMapError(routeProblem);
    } catch (e) {
      setSummary(null);
      setRoutes([]); // never leave routes on screen next to this error
      setPanelError(problem(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void reload();
  }, [reload]);
  // CSS skips entrance animations for keyboard-initiated actions (DESIGN.md), keyed on the last input device.
  useEffect(() => {
    const mark = (input: string) => (): void => { document.documentElement.dataset.input = input; };
    const [key, pointer] = [mark('keyboard'), mark('pointer')];
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', pointer, true);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', pointer, true);
    };
  }, []);

  async function optimize(): Promise<void> {
    setBusy(true);
    setPlanError(null);
    try {
      const plan = await runOptimization(date);
      setToast({ id: Date.now(), text: t('plan.done', { assigned: plan.routes.reduce((n, r) => n + r.jobCount, 0), unassigned: plan.unassigned.length }) });
      await reload();
    } catch (e) {
      setPlanError(problem(e));
    } finally {
      setBusy(false);
    }
  }

  // Not optimistic: wait for the server, then reload (also after a refusal, which means the screen was stale).
  async function changeStatus(jobId: number, status: JobStatus, reason?: string): Promise<void> {
    try {
      await setJobStatus(jobId, status, reason);
    } finally {
      await reload();
    }
  }

  const openModal = (): void => {
    trigger.current = document.activeElement;
    setCreateError(null);
    setAdding(true);
  };
  const closeModal = useCallback((): void => {
    setAdding(false);
    setPicking(false);
    setAt(null);
    (trigger.current as HTMLElement | null)?.focus?.();
  }, []);

  async function submitJob({ title, address, skillIds, minutes, from, to }: JobDraft): Promise<void> {
    if (!at) return;
    setBusy(true);
    setCreateError(null);
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
      closeModal();
      setStale(false);
      setSuggestions(await fetchSuggestions(job.id));
      setTab('unassigned');
      setPinned(job.id);
      setFresh(job.id);
      await reload(); // the new job is on the map, unassigned, whatever the user picks next
    } catch (e) {
      setCreateError(problem(e));
    } finally {
      setBusy(false);
    }
  }

  async function find(jobId: number): Promise<void> {
    setBusy(true);
    setSlotError(null);
    try {
      setPreviewed(null);
      setSuggestions(await fetchSuggestions(jobId));
      setStale(false);
    } catch (e) {
      setSlotError({ jobId, problem: problem(e) });
    } finally {
      setBusy(false);
    }
  }

  async function choose(option: InsertionOption): Promise<void> {
    if (!suggestions) return;
    setBusy(true);
    setSlotError(null);
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
          setSlotError({ jobId: suggestions.jobId, problem: problem(again) });
        }
        await reload();
      } else setSlotError({ jobId: suggestions.jobId, problem: problem(e) });
    } finally {
      setBusy(false);
    }
  }

  const why = (p: Problem): string => (p.key === 'error.network' ? t(p.key) : String(p.vars?.message ?? ''));
  // First load: nothing to show yet. A reload keeps the content and shows the progress line instead.
  const first = loading && !summary;
  const dayJobs = jobs.filter((j) => j.day === date);
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const route = routes.find((r) => r.technicianId === selected);
  const selectedTech = technicians.find((x) => x.id === selected);
  const byId = unassignedJobs(dayJobs, date);
  const unassigned = [...byId.filter((j) => j.id === fresh), ...byId.filter((j) => j.id !== fresh)]; // a new job goes on top
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
  selectedNow.current = selected;
  const selectTech = (id: number | null, from?: HTMLElement, keyboard = false): void => {
    setSelected(id);
    setTab('technicians');
    setLink(null);
    setHighlighted(null);
    if (id !== null) {
      if (from || id !== selectedNow.current) opener.current = from ?? null;
      setInstant(keyboard);
    }
  };
  // From the incidents list: that day, that technician's drawer, and the linked stop expanded.
  const goToIncident = (i: Incident, from: HTMLElement): void => {
    if (i.date !== date) setDate(i.date);
    selectTech(i.technicianId, from, true);
    if (i.jobId !== null) setLink({ jobId: i.jobId });
  };
  const closeDrawer = useCallback(() => selectTech(null), []);
  // Closing returns focus to the row that opened the drawer, if it is still on screen.
  useEffect(() => {
    if (selected === null && opener.current?.isConnected) opener.current.focus();
    if (selected === null) opener.current = null;
  }, [selected]);

  return (
    <div className="app">
      {loading && !first && <div className="progress" role="progressbar" aria-label={t('loading')} />}
      <TopBar planError={planError && why(planError)} date={date} summary={summary} busy={busy} loading={loading} onDate={setDate} onRefresh={() => void reload()} onOptimize={() => void optimize()} onUnassigned={() => setTab('unassigned')} onAdd={openModal} technicians={technicians} onIncident={goToIncident} onIncidentReviewed={() => void reload()} />
      <div className="body">
      <aside className="side">
        {summary?.totals.total === 0 && (
          <section className="empty">
            <h2>{t('empty.day.title')}</h2>
            <p className="muted">{t('empty.day.body')}</p>
            <button onClick={openModal}>{t('job.add')}</button>
          </section>
        )}

        <PanelTabs tab={current} unassignedCount={unassigned.length} onTab={setTab} />
        <div role="tabpanel" id="tabpanel" aria-labelledby={`tab-${current}`} aria-busy={first}>
          {panelError ? (
            <RegionError message={why(panelError)} onRetry={() => void reload()} />
          ) : first ? (
            <Skeleton />
          ) : current === 'technicians' ? (
            <TechnicianList technicians={technicians} days={summary?.technicians ?? []} skills={skills} selected={selected} onSelect={selectTech} />
          ) : (
            <>
              <UnassignedList
                jobs={unassigned}
                skills={skills}
                highlighted={pinned}
                busy={busy}
                failure={slotError && { jobId: slotError.jobId, message: t('error.action', { message: why(slotError.problem) }) }}
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
      </aside>
      <main className="main">
        <MapView
          technicians={technicians}
          dayJobs={dayJobs}
          skills={skills}
          routes={routes}
          selected={selected}
          highlighted={highlighted}
          focus={focus}
          picking={picking}
          at={at}
          preview={previewPath}
          onPick={(p) => { setAt(p); setPicking(false); }}
          onCenter={(c) => { center.current = c; }}
          onSelect={selectTech}
          onSelectStop={(id, jobId) => { selectTech(id); setHighlighted(jobId); setLink({ jobId }); }}
          onSelectJob={(id) => { setTab('unassigned'); setPinned(id); }}
        />
        {mapError && <div className="map-error"><RegionError message={why(mapError)} onRetry={() => void reload()} /></div>}
        {picking && <div className="crosshair" aria-hidden="true" />}
        <Legend />
      </main>
      {selectedTech && (
        <Drawer
          key={selectedTech.id}
          technician={selectedTech}
          route={route}
          date={date}
          skills={skills}
          link={link}
          instant={instant}
          pending={loading && summary?.date !== date}
          error={mapError && why(mapError)}
          onRetry={() => void reload()}
          onLink={setHighlighted}
          onStatus={changeStatus}
          stamp={summary}
          onClose={closeDrawer}
          onDayChanged={() => void reload()}
        />
      )}
      </div>
      {adding && (
        <NewJobModal
          date={date}
          skills={skills}
          busy={busy}
          at={at}
          picking={picking}
          failure={createError && t('create.failed', { message: why(createError) })}
          onPicking={setPicking}
          onUsePoint={() => { if (center.current) { setAt(center.current); setPicking(false); } }}
          onSubmit={(d) => void submitJob(d)}
          onClose={closeModal}
        />
      )}
      <Toasts toast={toast} onGone={() => setToast(null)} />
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { ACTIVE_CAP_MESSAGE, INACTIVE_TECHNICIAN_MESSAGE, JOB_LOCKED_MESSAGE, JOB_ON_ROUTE_MESSAGE, STALE_TECHNICIAN_MESSAGE, freeColorSlot } from '@shibutz/contracts';
import type { CreateTechnician, DaySummary, Incident, JobStatus, InsertionOption, InsertionSuggestions, Job, LonLat, RouteView, Skill, Technician, UpdateJob } from '@shibutz/contracts';
import { ApiError, createJob, createTechnician, deactivateTechnician, fetchDaySummary, fetchJobs, fetchRoute, fetchSkills, fetchSuggestions, fetchTechnicians, insertJob, reactivateTechnician, runOptimization, setJobStatus, updateJob, updateTechnician } from './api';
import { idsKey, jerusalemToIso, today, unassignedJobs } from './map';
import type { Key, Vars } from './i18n';
import { useLang } from './lang';
import { Drawer } from './components/Drawer';
import { RegionError, Skeleton, Toasts } from './components/Feedback';
import { Legend } from './components/Legend';
import { MapView } from './components/MapView';
import type { Point } from './components/MapView';
import { PanelTabs } from './components/PanelTabs';
import type { Tab } from './components/PanelTabs';
import { NewJobModal, draftOf } from './components/NewJobModal';
import type { JobDraft } from './components/NewJobModal';
import { TechnicianActionDialog } from './components/TechnicianActionDialog';
import { TechnicianModal, techPatch } from './components/TechnicianModal';
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

/** What differs from the saved job. Scheduling fields count only while the job has no route stop; the server refuses them otherwise. */
function jobPatch(job: Job, draft: JobDraft, at: LonLat): UpdateJob {
  const was = draftOf(job);
  const scheduling = job.status === 'unassigned';
  return {
    ...(draft.title !== was.title && { title: draft.title }),
    ...(draft.address !== was.address && { address: draft.address }),
    ...(scheduling && idsKey(draft.skillIds) !== idsKey(was.skillIds) && { skillIds: draft.skillIds }),
    ...(scheduling && draft.minutes !== was.minutes && { serviceDurationS: Math.round(draft.minutes * 60) }),
    ...(scheduling && draft.from !== was.from && { windowStart: jerusalemToIso(job.day, draft.from) }),
    ...(scheduling && draft.to !== was.to && { windowEnd: jerusalemToIso(job.day, draft.to) }),
    ...(scheduling && (at[0] !== job.location[0] || at[1] !== job.location[1]) && { location: at }),
  };
}

/** A message to show, kept untranslated until render so a language change does not reload data. */
interface Problem { key: Key; vars?: Vars }
/** The job guard's English refusals that have a localized text (docs/console-copy.md, Server messages). */
const EDIT_REFUSALS: Record<string, Key> = { [JOB_ON_ROUTE_MESSAGE]: 'job.edit.conflict', [JOB_LOCKED_MESSAGE]: 'job.edit.locked' };
const problem = (e: unknown): Problem =>
  e instanceof TypeError ? { key: 'error.network' } :
  e instanceof ApiError && e.status === 409 && e.message === INACTIVE_TECHNICIAN_MESSAGE ? { key: 'error.techInactive' } :
  e instanceof ApiError && e.status === 409 && e.message === STALE_TECHNICIAN_MESSAGE ? { key: 'review.stale' } : { key: 'error.action', vars: { message: e instanceof Error ? e.message : String(e) } };

export function App(): React.JSX.Element {
  const { t } = useLang();
  const [date, setDateState] = useState(openingDate);
  const setDate = (d: string): void => {
    setDateState(d);
    setTab(null);
    setFresh(null);
    setSuggestions(null);
    setPreviewed(null);
    setPinned(null);
    setLink(null);
    setHighlighted(null);
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
  const [addingTech, setAddingTech] = useState(false);
  const [editingTech, setEditingTech] = useState<number | null>(null); // the technician modal, pre-filled with this technician
  const [editing, setEditing] = useState<number | null>(null); // the same modal, pre-filled with this job
  const [acting, setActing] = useState<{ mode: 'deactivate' | 'reactivate'; id: number } | null>(null); // the deactivate or reactivate dialog
  const [blocked, setBlocked] = useState<string[] | null>(null); // dates that refused the deactivation
  const [picking, setPicking] = useState(false);
  const [at, setAt] = useState<LonLat | null>(null);
  const [createError, setCreateError] = useState<Problem | null>(null);
  const [fresh, setFresh] = useState<number | null>(null);
  const center = useRef<LonLat | null>(null);
  const trigger = useRef<Element | null>(null);
  const [suggestions, setSuggestions] = useState<InsertionSuggestions | null>(null);
  const [stale, setStale] = useState<Key | null>(null); // the notice above the slot options after a refused or refreshed search
  const [previewed, setPreviewed] = useState<InsertionOption | null>(null);

  // One reload for everything the map shows; also called after a batch run.
  const latestReload = useRef(0);
  const reload = useCallback(async (): Promise<void> => {
    const id = ++latestReload.current;
    const current = (): boolean => id === latestReload.current; // a newer reload owns the screen
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
      if (!current()) return;
      setSummary(sum);
      setSkills(sk);
      setTechnicians(t);
      setJobs(j);
      setRoutes(r);
      setMapError(routeProblem);
    } catch (e) {
      if (!current()) return;
      setSummary(null);
      setRoutes([]); // never leave routes on screen next to this error
      setPanelError(problem(e));
    } finally {
      if (current()) setLoading(false);
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
      if (e instanceof ApiError && e.status === 409) await reload(); // the roster on screen may be stale
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
    setAddingTech(false);
    setEditingTech(null);
    setEditing(null);
    setActing(null);
    setBlocked(null);
    setPicking(false);
    setAt(null);
    (trigger.current as HTMLElement | null)?.focus?.();
  }, []);

  async function submitTechnician(body: CreateTechnician): Promise<void> {
    setBusy(true);
    setCreateError(null);
    try {
      const created = await createTechnician(body);
      closeModal();
      setToast({ id: Date.now(), text: t('tech.created', { name: created.name }) });
      await reload();
    } catch (e) {
      const cap = e instanceof ApiError && e.status === 409 && e.message === ACTIVE_CAP_MESSAGE;
      setCreateError(cap ? { key: 'error.action', vars: { message: t('error.activeCap') } } : problem(e));
      if (cap) await reload(); // the roster on screen was stale
    } finally {
      setBusy(false);
    }
  }

  async function submitTechEdit(tech: Technician, body: CreateTechnician, version: number): Promise<void> {
    setBusy(true);
    setCreateError(null);
    try {
      const patch = techPatch(tech, body);
      const keys = Object.keys(patch);
      if (!keys.length) return closeModal(); // nothing changed: no request, no toast
      await updateTechnician(tech.id, { ...patch, version });
      const nameOnly = keys.every((k) => k === 'name');
      closeModal();
      setToast({ id: Date.now(), text: nameOnly ? t('tech.saved.name') : t('tech.updated', { name: body.name }) });
      await reload();
    } catch (e) {
      const stale = e instanceof ApiError && e.status === 409 && e.message === STALE_TECHNICIAN_MESSAGE;
      setCreateError(stale ? { key: 'review.stale' } : problem(e));
      if (stale) await reload(); // the open review now shows the technician as it is; the modal returns to the form
    } finally {
      setBusy(false);
    }
  }

  const openAction = (mode: 'deactivate' | 'reactivate', id: number): void => {
    trigger.current = document.activeElement;
    setCreateError(null);
    setBlocked(null);
    setActing({ mode, id });
  };

  async function submitAction(tech: Technician, mode: 'deactivate' | 'reactivate'): Promise<void> {
    setBusy(true);
    setCreateError(null);
    try {
      await (mode === 'deactivate' ? deactivateTechnician : reactivateTechnician)(tech.id, tech.version);
      closeModal();
      setToast({ id: Date.now(), text: t(mode === 'deactivate' ? 'deactivate.done' : 'reactivate.done', { name: tech.name }) });
      await reload();
    } catch (e) {
      const conflict = e instanceof ApiError && e.status === 409;
      if (conflict && e.dates.length) setBlocked(e.dates);
      else if (conflict && e.message === ACTIVE_CAP_MESSAGE) setCreateError({ key: 'error.action', vars: { message: t('error.activeCap') } });
      else if (conflict && e.message === STALE_TECHNICIAN_MESSAGE) setCreateError({ key: 'review.stale' });
      else setCreateError(problem(e));
      if (conflict) await reload(); // the roster on screen was stale
    } finally {
      setBusy(false);
    }
  }

  const openEditTech = (id: number): void => {
    const tech = technicians.find((x) => x.id === id);
    if (!tech) return;
    trigger.current = document.activeElement;
    setCreateError(null);
    setAt(tech.home);
    setEditingTech(id);
  };

  const openEdit = (jobId: number): void => {
    const job = jobs.find((j) => j.id === jobId);
    if (!job) return;
    trigger.current = document.activeElement;
    setCreateError(null);
    setAt(job.location);
    setEditing(jobId);
  };

  async function submitEdit(job: Job, draft: JobDraft): Promise<void> {
    if (!at) return;
    setBusy(true);
    setCreateError(null);
    try {
      const patch = jobPatch(job, draft, at);
      const saved = Object.keys(patch).length ? await updateJob(job.id, patch) : job;
      closeModal();
      setToast({ id: Date.now(), text: t(saved.status === 'unassigned' ? 'job.edit.saved.unassigned' : 'job.edit.saved') });
      if (saved.status === 'unassigned') {
        setTab('unassigned');
        setPinned(saved.id);
      }
      await reload();
    } catch (e) {
      const known = e instanceof ApiError && e.status === 409 ? EDIT_REFUSALS[e.message] : undefined;
      setCreateError(known ? { key: known } : problem(e));
      if (known) await reload(); // the job changed under the form: the next render shows its fields as they are now
    } finally {
      setBusy(false);
    }
  }

  async function submitJob({ title, address, skillIds, minutes, from, to }: JobDraft): Promise<void> {
    if (!at) return;
    setBusy(true);
    setCreateError(null);
    setSlotError(null);
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
      setStale(null);
      setTab('unassigned');
      setPinned(job.id);
      setFresh(job.id);
      try {
        setSuggestions(await fetchSuggestions(job.id));
      } catch (e) {
        setSlotError({ jobId: job.id, problem: problem(e) }); // shown at the job's row; the job exists, so no retry of create
      }
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
      setStale(null);
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
      setStale(null);
      await reload();
      selectTech(option.technicianId);
      setToast({ id: Date.now(), text: t('slot.assigned', { name: technicians.find((x) => x.id === option.technicianId)?.name ?? '' }) });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setStale(e.message === INACTIVE_TECHNICIAN_MESSAGE ? 'error.techInactive' : 'slot.stale');
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

  const why = (p: Problem): string => (p.vars ? String(p.vars.message ?? '') : t(p.key));
  // First load: nothing to show yet. A reload keeps the content and shows the progress line instead.
  const first = loading && !summary;
  // A saved note changes no route on the server, so patch the loaded view instead of reloading.
  const noteSaved = (jobId: number, hasNote: boolean): void =>
    setRoutes((rs) => rs.map((r) => ({ ...r, stops: r.stops.map((s) => (s.jobId === jobId ? { ...s, hasNote } : s)) })));
  const editingJob = jobs.find((j) => j.id === editing);
  const editingTechnician = technicians.find((x) => x.id === editingTech);
  const actingTechnician = technicians.find((x) => x.id === acting?.id);
  const nextColor = freeColorSlot(technicians.map((x) => x.color)); // undefined at the cap, where no add or reactivate is offered
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
    return { points: [at(previewed.position.afterJobId), job.location, at(previewed.position.beforeJobId)], color: owner.color ?? 1 };
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
            <TechnicianList technicians={technicians} days={summary?.technicians ?? []} skills={skills} selected={selected} onSelect={selectTech} onEdit={openEditTech} onDeactivate={(id) => openAction('deactivate', id)} onReactivate={(id) => openAction('reactivate', id)} onAdd={() => { trigger.current = document.activeElement; setCreateError(null); setAddingTech(true); }} />
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
                onEdit={openEdit}
                slot={suggestions && {
                  suggestions,
                  notice: stale ? t(stale) : '',
                  technicians,
                  titleOf: (id) => jobById.get(id)?.title ?? t('job.ref', { id }),
                  previewed,
                  onPreview: setPreviewed,
                  onChoose: (o) => void choose(o),
                  onClose: () => { setSuggestions(null); setStale(null); setPreviewed(null); },
                }}
              />
            </>
          )}
        </div>
      </aside>
      <main className="main">
        <MapView
          date={date}
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
          onEdit={openEdit}
          onNoted={noteSaved}
          stamp={summary}
          onClose={closeDrawer}
          onDayChanged={() => void reload()}
        />
      )}
      </div>
      {(adding || editingJob) && (
        <NewJobModal
          key={editingJob?.id ?? 'new'}
          job={editingJob}
          date={date}
          skills={skills}
          busy={busy}
          at={at}
          picking={picking}
          failure={createError && (editingJob ? t(createError.key, createError.vars) : t('create.failed', { message: why(createError) }))}
          onPicking={setPicking}
          onUsePoint={() => { if (center.current) { setAt(center.current); setPicking(false); } }}
          onSubmit={(d) => void (editingJob ? submitEdit(editingJob, d) : submitJob(d))}
          onClose={closeModal}
        />
      )}
      {(addingTech || editingTechnician) && (
        <TechnicianModal
          key={editingTechnician?.id ?? 'new'}
          technician={editingTechnician}
          skills={skills}
          technicians={technicians}
          color={editingTechnician?.color ?? nextColor}
          busy={busy}
          at={at}
          picking={picking}
          failure={createError && (createError.key === 'review.stale' ? t('review.stale') : t('error.action', { message: why(createError) }))}
          onPicking={setPicking}
          onUsePoint={() => { if (center.current) { setAt(center.current); setPicking(false); } }}
          onSubmit={(d, version) => void (editingTechnician ? submitTechEdit(editingTechnician, d, version) : submitTechnician(d))}
          onClose={closeModal}
        />
      )}
      {acting && actingTechnician && (
        <TechnicianActionDialog
          mode={acting.mode}
          technician={actingTechnician}
          color={nextColor}
          busy={busy}
          blocked={blocked}
          failure={createError && (createError.key === 'review.stale' ? t('review.stale') : t('error.action', { message: why(createError) }))}
          onConfirm={() => void submitAction(actingTechnician, acting.mode)}
          onClose={closeModal}
          onOpenDay={(d) => { closeModal(); setDate(d); }}
        />
      )}
      <Toasts toast={toast} onGone={() => setToast(null)} />
    </div>
  );
}

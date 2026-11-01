import { z } from 'zod';
import { cancellationSchema, dayPlanSchema, dayReportSchema, daySummarySchema, incidentSchema, insertionSuggestionsSchema, jobSchema, noteSchema, routeViewSchema, skillSchema, technicianSchema } from '@shibutz/contracts';
import type { Cancellation, CreateIncident, CreateTechnician, CreateJob, UpdateJob, UpdateTechnician, DayPlan, DayReport, DaySummary, Incident, InsertCommit, InsertionSuggestions, Job, JobStatus, Note, RouteView, Skill, Technician } from '@shibutz/contracts';

/** Carries the HTTP status so callers can tell a stale 409 from other failures. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const post = (body: unknown): RequestInit => json('POST', body);

async function request<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body: unknown = await res.json();
  if (!res.ok) {
    const message = z.object({ message: z.string() }).safeParse(body);
    throw new ApiError(message.success ? message.data.message : `HTTP ${res.status}`, res.status);
  }
  return schema.parse(body);
}

export const fetchTechnicians = (): Promise<Technician[]> => request(z.array(technicianSchema), '/technicians');
export const createTechnician = (technician: CreateTechnician): Promise<Technician> => request(technicianSchema, '/technicians', post(technician));
export const updateTechnician = (id: number, patch: UpdateTechnician): Promise<Technician> =>
  request(technicianSchema, `/technicians/${id}`, json('PATCH', patch));
export const fetchJobs = (): Promise<Job[]> => request(z.array(jobSchema), '/jobs');
export const fetchRoute = (technicianId: number, date: string): Promise<RouteView> =>
  request(routeViewSchema, `/routes/${technicianId}/${date}`);
export const runOptimization = (date: string): Promise<DayPlan> =>
  request(dayPlanSchema, `/optimization/day/${date}`, { method: 'POST' });
export const fetchSkills = (): Promise<Skill[]> => request(z.array(skillSchema), '/skills');
export const createJob = (job: CreateJob): Promise<Job> => request(jobSchema, '/jobs', post(job));
export const updateJob = (jobId: number, patch: UpdateJob): Promise<Job> => request(jobSchema, `/jobs/${jobId}`, json('PATCH', patch));
export const fetchSuggestions = (jobId: number): Promise<InsertionSuggestions> =>
  request(insertionSuggestionsSchema, `/jobs/${jobId}/insertion-suggestions?limit=3`, { method: 'POST' });
export const insertJob = (jobId: number, commit: InsertCommit): Promise<Job> => request(jobSchema, `/jobs/${jobId}/insert`, post(commit));
export const fetchDaySummary = (date: string): Promise<DaySummary> => request(daySummarySchema, `/days/${date}/summary`);
export const setJobStatus = (jobId: number, status: JobStatus, reason?: string): Promise<Job> =>
  request(jobSchema, `/jobs/${jobId}/status`, { ...post({ status, ...(reason && { reason }) }), method: 'PATCH' });
export const fetchCancellations = (technicianId: number, date: string): Promise<Cancellation[]> =>
  request(z.array(cancellationSchema), `/routes/${technicianId}/${date}/cancellations`);
export const fetchNote = (jobId: number): Promise<Note> => request(noteSchema, `/jobs/${jobId}/note`);
export const saveNote = (jobId: number, body: string): Promise<Note> =>
  request(noteSchema, `/jobs/${jobId}/note`, { ...post({ body }), method: 'PUT' });

const workDay = (technicianId: number, date: string): string => `/technicians/${technicianId}/days/${date}`;
/** The day's end-of-day summary; null until one is written. */
export const fetchReport = (technicianId: number, date: string): Promise<DayReport | null> =>
  request(dayReportSchema, `${workDay(technicianId, date)}/report`).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  });
export const saveReport = (technicianId: number, date: string, body: string): Promise<DayReport> =>
  request(dayReportSchema, `${workDay(technicianId, date)}/report`, json('PUT', { body }));
export const fetchIncidents = (technicianId: number, date: string): Promise<Incident[]> =>
  request(z.array(incidentSchema), `${workDay(technicianId, date)}/incidents`);
export const addIncident = (technicianId: number, date: string, incident: CreateIncident): Promise<Incident> =>
  request(incidentSchema, `${workDay(technicianId, date)}/incidents`, post(incident));
export const fetchOpenIncidents = (): Promise<Incident[]> => request(z.array(incidentSchema), '/incidents/open');
export const reviewIncident = (id: number): Promise<Incident> => request(incidentSchema, `/incidents/${id}/review`, { method: 'POST' });

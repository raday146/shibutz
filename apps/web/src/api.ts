import { z } from 'zod';
import { dayPlanSchema, daySummarySchema, insertionSuggestionsSchema, jobSchema, noteSchema, routeViewSchema, skillSchema, technicianSchema } from '@shibutz/contracts';
import type { CreateJob, DayPlan, DaySummary, InsertCommit, InsertionSuggestions, Job, JobStatus, Note, RouteView, Skill, Technician } from '@shibutz/contracts';

/** Carries the HTTP status so callers can tell a stale 409 from other failures. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

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
export const fetchJobs = (): Promise<Job[]> => request(z.array(jobSchema), '/jobs');
export const fetchRoute = (technicianId: number, date: string): Promise<RouteView> =>
  request(routeViewSchema, `/routes/${technicianId}/${date}`);
export const runOptimization = (date: string): Promise<DayPlan> =>
  request(dayPlanSchema, `/optimization/day/${date}`, { method: 'POST' });
export const fetchSkills = (): Promise<Skill[]> => request(z.array(skillSchema), '/skills');
export const createJob = (job: CreateJob): Promise<Job> => request(jobSchema, '/jobs', post(job));
export const fetchSuggestions = (jobId: number): Promise<InsertionSuggestions> =>
  request(insertionSuggestionsSchema, `/jobs/${jobId}/insertion-suggestions?limit=3`, { method: 'POST' });
export const insertJob = (jobId: number, commit: InsertCommit): Promise<Job> => request(jobSchema, `/jobs/${jobId}/insert`, post(commit));
export const fetchDaySummary = (date: string): Promise<DaySummary> => request(daySummarySchema, `/days/${date}/summary`);
export const setJobStatus = (jobId: number, status: JobStatus): Promise<Job> =>
  request(jobSchema, `/jobs/${jobId}/status`, { ...post({ status }), method: 'PATCH' });
export const fetchNote = (jobId: number): Promise<Note> => request(noteSchema, `/jobs/${jobId}/note`);
export const saveNote = (jobId: number, body: string): Promise<Note> =>
  request(noteSchema, `/jobs/${jobId}/note`, { ...post({ body }), method: 'PUT' });

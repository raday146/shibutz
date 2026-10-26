import { z } from 'zod';
import { dayPlanSchema, jobSchema, routeViewSchema, technicianSchema } from '@shibutz/contracts';
import type { DayPlan, Job, RouteView, Technician } from '@shibutz/contracts';

async function request<T>(schema: z.ZodType<T>, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body: unknown = await res.json();
  if (!res.ok) {
    const message = z.object({ message: z.string() }).safeParse(body);
    throw new Error(message.success ? message.data.message : `HTTP ${res.status}`);
  }
  return schema.parse(body);
}

export const fetchTechnicians = (): Promise<Technician[]> => request(z.array(technicianSchema), '/technicians');
export const fetchJobs = (): Promise<Job[]> => request(z.array(jobSchema), '/jobs');
export const fetchRoute = (technicianId: number, date: string): Promise<RouteView> =>
  request(routeViewSchema, `/routes/${technicianId}/${date}`);
export const runOptimization = (date: string): Promise<DayPlan> =>
  request(dayPlanSchema, `/optimization/day/${date}`, { method: 'POST' });

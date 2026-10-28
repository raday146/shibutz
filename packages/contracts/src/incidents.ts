import { z } from 'zod';

const text = z.string().trim().min(1).max(4000);

/** `PUT /technicians/:id/days/:date/report`: the one end-of-day summary of a work day. */
export const writeDayReportSchema = z.object({ body: text }).strict();
export type WriteDayReport = z.infer<typeof writeDayReportSchema>;

export const dayReportSchema = z.object({
  technicianId: z.number().int().positive(),
  date: z.iso.date(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type DayReport = z.infer<typeof dayReportSchema>;

/** `POST /technicians/:id/days/:date/incidents`; the job link is optional. */
export const createIncidentSchema = z.object({ body: text, jobId: z.number().int().positive().nullable().default(null) }).strict();
export type CreateIncident = z.input<typeof createIncidentSchema>;

export const incidentSchema = z.object({
  id: z.number().int().positive(),
  technicianId: z.number().int().positive(),
  date: z.iso.date(),
  jobId: z.number().int().positive().nullable(),
  body: z.string(),
  status: z.enum(['open', 'reviewed']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
});
export type Incident = z.infer<typeof incidentSchema>;

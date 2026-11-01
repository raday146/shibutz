import { type SQL, sql } from 'drizzle-orm';
import { boolean, check, date, integer, jsonb, pgEnum, pgTable, primaryKey, text, time, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';
import type { TechnicianChangeFields } from '@shibutz/contracts';
import { geographyPoint } from './geography';

// Integer ids: VROOM requires integer skill ids.
export const skills = pgTable('skills', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  code: text().notNull().unique(),
  nameEn: text('name_en').notNull(),
  nameHe: text('name_he').notNull(),
});

// Shift: daily local (Asia/Jerusalem) wall-clock times, never crossing midnight.
export const technicians = pgTable(
  'technicians',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: text().notNull(),
    home: geographyPoint('home').notNull(),
    shiftStart: time('shift_start').notNull(),
    shiftEnd: time('shift_end').notNull(),
    // Route color slot (DESIGN.md palette): held while active, freed (NULL) when inactive.
    color: integer('color'),
    active: boolean().notNull().default(true),
    // Optimistic-concurrency token for technician edits.
    version: integer().notNull().default(0),
  },
  (t) => [
    check('technicians_shift_order', sql`${t.shiftEnd} > ${t.shiftStart}`),
    check('technicians_color_range', sql`${t.color} BETWEEN 1 AND 8`),
    check('technicians_active_color', sql`${t.active} = (${t.color} IS NOT NULL)`),
    uniqueIndex('technicians_active_color_key').on(t.color).where(sql`${t.active}`),
  ],
);

const skillFk = (name: string) =>
  integer(name)
    .notNull()
    .references(() => skills.id);

export const technicianSkills = pgTable(
  'technician_skills',
  {
    technicianId: integer('technician_id')
      .notNull()
      .references(() => technicians.id, { onDelete: 'cascade' }),
    skillId: skillFk('skill_id'),
  },
  (t) => [primaryKey({ columns: [t.technicianId, t.skillId] })],
);

export const unassignedReason = pgEnum('unassigned_reason', [
  'NO_SKILLED_TECHNICIAN',
  'WINDOW_OUTSIDE_ALL_SHIFTS',
  'UNREACHABLE',
  'NOT_FEASIBLE_IN_PLAN',
]);

export const jobStatus = pgEnum('job_status', ['unassigned', 'assigned', 'in_progress', 'done', 'cancelled']);

const localDate = (column: string): SQL =>
  sql.raw(`(${column} AT TIME ZONE 'Asia/Jerusalem')::date`);

export const jobs = pgTable(
  'jobs',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    title: text('title').notNull(),
    address: text('address').notNull(),
    location: geographyPoint('location').notNull(),
    serviceDurationS: integer('service_duration_s').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    windowEnd: timestamp('window_end', { withTimezone: true }).notNull(),
    // A job's day is the local date of its window start; derived, so it can never drift.
    day: date('day', { mode: 'string' })
      .notNull()
      .generatedAlwaysAs(localDate('window_start')),
    priority: integer('priority').notNull(),
    status: jobStatus('status').notNull().default('unassigned'),
    unassignedReason: unassignedReason('unassigned_reason'),
    unassignedAt: timestamp('unassigned_at', { withTimezone: true }),
  },
  (t) => [
    check('jobs_window_order', sql`${t.windowEnd} > ${t.windowStart}`),
    // Ending at exactly 00:00 the next day counts as crossing midnight.
    check('jobs_window_same_local_day', sql`${localDate('window_start')} = ${localDate('window_end')}`),
    check('jobs_service_positive', sql`${t.serviceDurationS} > 0`),
    check('jobs_priority_range', sql`${t.priority} BETWEEN 0 AND 100`),
  ],
);

export const jobSkills = pgTable(
  'job_skills',
  {
    jobId: integer('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    skillId: skillFk('skill_id'),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.skillId] })],
);

// One route per technician and day. A missing row means version 0; every write bumps the version.
export const routes = pgTable(
  'routes',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    technicianId: integer('technician_id')
      .notNull()
      .references(() => technicians.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    version: integer('version').notNull().default(0),
  },
  (t) => [unique('routes_technician_date').on(t.technicianId, t.date)],
);

// Stops in gapless 1-based sequence; planned eta/etd from the plan, actual times from day operations.
export const routeStops = pgTable('route_stops', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  routeId: integer('route_id')
    .notNull()
    .references(() => routes.id, { onDelete: 'cascade' }),
  jobId: integer('job_id')
    .notNull()
    .unique()
    .references(() => jobs.id),
  sequence: integer('sequence').notNull(),
  eta: timestamp('eta', { withTimezone: true }).notNull(),
  etd: timestamp('etd', { withTimezone: true }).notNull(),
  actualArrival: timestamp('actual_arrival', { withTimezone: true }),
  actualDeparture: timestamp('actual_departure', { withTimezone: true }),
});

// Who a cancelled job belonged to and its actual times (ADR 0001); the stop itself is deleted.
export const jobCancellations = pgTable('job_cancellations', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  jobId: integer('job_id')
    .notNull()
    .unique()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  // Null when the job was never assigned.
  technicianId: integer('technician_id').references(() => technicians.id, { onDelete: 'set null' }),
  date: date('date', { mode: 'string' }).notNull(),
  previousStatus: jobStatus('previous_status').notNull(),
  actualArrival: timestamp('actual_arrival', { withTimezone: true }),
  actualDeparture: timestamp('actual_departure', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }).notNull(),
  reason: text('reason'),
});

// At most one note per job; it belongs to the job, so unassign, re-plan and reassignment leave it alone.
export const jobNotes = pgTable('job_notes', {
  jobId: integer('job_id')
    .primaryKey()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

// One optional end-of-day summary per technician and day. No cascade: a technician with a report cannot be deleted.
export const dayReports = pgTable(
  'day_reports',
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    technicianId: integer('technician_id')
      .notNull()
      .references(() => technicians.id),
    date: date('date', { mode: 'string' }).notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('day_reports_technician_date').on(t.technicianId, t.date)],
);

export const technicianChangeAction = pgEnum('technician_change_action', ['created', 'updated', 'deactivated', 'reactivated', 'deleted']);

// Permanent, append-only: rows are only ever inserted, in the same transaction as the change. Deleting a technician
// sets technician_id to NULL instead of erasing history. `name` is the name at that time; before/after hold only changed fields.
export const technicianChanges = pgTable('technician_changes', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  technicianId: integer('technician_id').references(() => technicians.id, { onDelete: 'set null' }),
  action: technicianChangeAction().notNull(),
  name: text().notNull(),
  before: jsonb().$type<TechnicianChangeFields>(),
  after: jsonb().$type<TechnicianChangeFields>(),
});

export const incidentStatus = pgEnum('incident_status', ['open', 'reviewed']);

// Belongs to the work day (technician and date), not to the report. Deleting the job only drops the link.
export const incidents = pgTable('incidents', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  technicianId: integer('technician_id')
    .notNull()
    .references(() => technicians.id),
  date: date('date', { mode: 'string' }).notNull(),
  jobId: integer('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  status: incidentStatus('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
});

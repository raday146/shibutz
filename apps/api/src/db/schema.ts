import { type SQL, sql } from 'drizzle-orm';
import { check, date, integer, pgEnum, pgTable, primaryKey, text, time, timestamp, unique } from 'drizzle-orm/pg-core';
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
    // Route color slot (DESIGN.md palette), stable for the technician's life.
    color: integer('color').notNull(),
  },
  (t) => [
    check('technicians_shift_order', sql`${t.shiftEnd} > ${t.shiftStart}`),
    check('technicians_color_range', sql`${t.color} BETWEEN 1 AND 8`),
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

// At most one note per job; it belongs to the job, so unassign, re-plan and reassignment leave it alone.
export const jobNotes = pgTable('job_notes', {
  jobId: integer('job_id')
    .primaryKey()
    .references(() => jobs.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

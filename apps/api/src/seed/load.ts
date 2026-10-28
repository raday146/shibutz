import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { CreateJob, JobStatus, LonLat } from '@shibutz/contracts';
import { DEFAULT_DATABASE_URL, type Db } from '../db/db.module';
import { runMigrations } from '../db/migrate';
import * as schema from '../db/schema';
import { buildSeed, comparisonScenario, SEED_DAY, type Dataset, type Scenario } from './datasets';

const { dayReports, incidents, jobCancellations, jobNotes, jobSkills, jobs, skills, technicianSkills, technicians } = schema;

/** Wipes the domain tables (identities restarted, so ids are positional) and inserts the dataset. */
export async function loadDataset(db: Db, data: Dataset | Scenario): Promise<void> {
  const routed = new Set('routes' in data ? data.routes.flatMap((r) => r.jobIds) : []);
  const cancelled = new Set(data.cancellations?.map((c) => c.jobId));
  const allJobs = 'newJob' in data ? [...data.jobs, data.newJob] : data.jobs;

  await db.transaction(async (tx) => {
    await tx.execute(sql`TRUNCATE ${skills}, ${technicians}, ${jobs} RESTART IDENTITY CASCADE`);
    await tx.insert(skills).values(data.skills);
    for (const [i, { skillIds, ...t }] of data.technicians.entries()) {
      const [row] = await tx.insert(technicians).values({ ...t, color: (i % 8) + 1 }).returning({ id: technicians.id });
      if (!row) throw new Error('Insert returned no row');
      await tx.insert(technicianSkills).values(skillIds.map((skillId) => ({ technicianId: row.id, skillId })));
    }
    for (const [i, { skillIds, windowStart, windowEnd, ...j }] of allJobs.entries()) {
      const status: JobStatus = cancelled.has(i + 1) ? 'cancelled' : routed.has(i + 1) ? 'assigned' : 'unassigned';
      const [row] = await tx
        .insert(jobs)
        .values({ ...j, status, windowStart: new Date(windowStart), windowEnd: new Date(windowEnd) })
        .returning({ id: jobs.id });
      if (!row) throw new Error('Insert returned no row');
      await tx.insert(jobSkills).values(skillIds.map((skillId) => ({ jobId: row.id, skillId })));
    }
    for (const { cancelledAt, ...c } of data.cancellations ?? []) {
      await tx.insert(jobCancellations).values({ ...c, date: SEED_DAY, cancelledAt: new Date(cancelledAt) });
    }
    const at = new Date();
    if (data.notes?.length) await tx.insert(jobNotes).values(data.notes.map((n) => ({ ...n, createdAt: at, updatedAt: at })));
    if (data.workDay) {
      await tx.insert(dayReports).values({ technicianId: 1, date: SEED_DAY, body: data.workDay.report });
      await tx.insert(incidents).values({ technicianId: 1, date: SEED_DAY, jobId: 1, body: data.workDay.incident });
    }
  });
}

/** Max distance (m) from a point to the road OSRM snaps it to; beyond this it is outside the extract. */
export const MAX_SNAP_M = 500;

/** Points that OSRM `/nearest` snaps farther than MAX_SNAP_M (or not at all). */
export async function snapCheck(
  data: Dataset & { newJob?: CreateJob },
  osrmUrl: string,
): Promise<{ label: string; meters: number | null }[]> {
  const points: [string, LonLat][] = [
    ...data.technicians.map((t, i): [string, LonLat] => [`technician ${i + 1}`, t.home]),
    ...data.jobs.map((j, i): [string, LonLat] => [`job ${i + 1}`, j.location]),
    ...(data.newJob ? [['new job', data.newJob.location] as [string, LonLat]] : []),
  ];
  const results = await Promise.all(
    points.map(async ([label, [lon, lat]]) => {
      const res = await fetch(`${osrmUrl}/nearest/v1/driving/${lon},${lat}?number=1`);
      const body = (await res.json()) as { code: string; waypoints?: { distance: number }[] };
      const meters = body.code === 'Ok' ? (body.waypoints?.[0]?.distance ?? null) : null;
      return { label, meters };
    }),
  );
  return results.filter((r) => r.meters === null || r.meters > MAX_SNAP_M);
}

async function main(which: string | undefined): Promise<void> {
  const data = which === 'seed' ? buildSeed() : which === 'scenario' ? comparisonScenario : undefined;
  if (!data) throw new Error('Usage: load.js seed|scenario');
  const osrmUrl = process.env.OSRM_URL ?? 'http://localhost:5001';
  try {
    const far = await snapCheck(data, osrmUrl);
    if (far.length) throw new Error(`Points outside the OSRM extract: ${JSON.stringify(far)}`);
  } catch (err) {
    if (!(err instanceof TypeError)) throw err; // fetch failed: OSRM is down
    console.warn(`OSRM not reachable at ${osrmUrl}; skipping snap check`);
  }

  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  await runMigrations(url);
  const db = drizzle(url, { schema });
  try {
    await loadDataset(db, data);
  } finally {
    await db.$client.end();
  }
  console.log(`Loaded ${which}: ${data.technicians.length} technicians, ${data.jobs.length} jobs`);
}

if (require.main === module) {
  main(process.argv[2]).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}

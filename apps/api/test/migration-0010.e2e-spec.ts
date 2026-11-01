import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { runMigrations } from '../src/db/migrate';

const DB_NAME = `${process.env.TEST_DB_NAME ?? 'shibutz_test'}_mig`;
const full = path.join(__dirname, '../drizzle');

/** A copy of the migrations folder that stops before 0010. */
function oldMigrations(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'mig-'));
  cpSync(full, dir, { recursive: true });
  const journalPath = path.join(dir, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number }[] };
  journal.entries = journal.entries.filter((e) => e.idx < 10);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

describe('migration 0010 (technician active flag)', () => {
  let url: string;
  let db: Client;

  beforeEach(async () => {
    const admin = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await admin.query(`CREATE DATABASE ${DB_NAME}`);
    await admin.end();
    const u = new URL(process.env.DATABASE_URL ?? '');
    u.pathname = `/${DB_NAME}`;
    url = u.toString();
    db = new Client({ connectionString: url });
    await db.connect();
    await migrate(drizzle(db), { migrationsFolder: oldMigrations() });
    // Ten technicians: the old color rule repeats colors from the 9th on.
    for (let i = 1; i <= 10; i++) {
      await db.query(`INSERT INTO technicians (name, home, shift_start, shift_end, color) VALUES ('T${i}', ST_GeogFromText('POINT(34.8 32)'), '08:00', '17:00', ${((i - 1) % 8) + 1})`);
    }
  });

  afterEach(async () => {
    await db.end();
    const admin = new Client({ connectionString: process.env.DATABASE_URL });
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME}`);
    await admin.end();
  });

  async function stopFor(technicianId: number, status: string): Promise<void> {
    const job = await db.query<{ id: number }>(
      `INSERT INTO jobs (title, address, location, service_duration_s, window_start, window_end, priority, status)
       VALUES ('J', 'A', ST_GeogFromText('POINT(34.8 32)'), 600, '2026-07-01T06:00Z', '2026-07-01T10:00Z', 50, $1) RETURNING id`,
      [status],
    );
    const route = await db.query<{ id: number }>(`INSERT INTO routes (technician_id, date) VALUES ($1, '2026-07-01') RETURNING id`, [technicianId]);
    await db.query(`INSERT INTO route_stops (route_id, job_id, sequence, eta, etd) VALUES ($1, $2, 1, now(), now())`, [route.rows[0]?.id, job.rows[0]?.id]);
  }

  it('refuses, naming the technician, when a duplicate-color technician has unfinished stops', async () => {
    await stopFor(9, 'assigned');

    // drizzle wraps the database error; the readable text is on its cause.
    const failure = await runMigrations(url).then(() => null, (e: Error & { cause?: Error }) => e.cause?.message ?? e.message);
    expect(failure).toMatch(/technician\(s\) 9 repeat a route color and have unfinished stops/);
    // Nothing was half-applied.
    const { rows } = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'technicians' AND column_name = 'active'`);
    expect(rows).toHaveLength(0);
  });

  it('deactivates duplicates whose stops are all done', async () => {
    await stopFor(9, 'done');

    await runMigrations(url);

    const { rows } = await db.query<{ id: number; active: boolean }>(`SELECT id, active FROM technicians ORDER BY id`);
    expect(rows.filter((r) => !r.active).map((r) => r.id)).toEqual([9, 10]);
    expect(rows.filter((r) => r.active)).toHaveLength(8);
    // Traceable: one "deactivated" entry per technician the migration deactivated, with the name at the time.
    const log = await db.query<{ technician_id: number; action: string; name: string }>(`SELECT technician_id, action, name FROM technician_changes ORDER BY id`);
    expect(log.rows).toEqual([
      { technician_id: 9, action: 'deactivated', name: 'T9' },
      { technician_id: 10, action: 'deactivated', name: 'T10' },
    ]);
  });
});

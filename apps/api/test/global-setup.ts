import { Client } from 'pg';
import { DEFAULT_DATABASE_URL } from '../src/db/db.module';
import { runMigrations } from '../src/db/migrate';
import { OSRM_URL, VROOM_URL } from './stack';

// Override per worktree so parallel e2e runs don't truncate each other's data.
const TEST_DB = process.env.TEST_DB_NAME ?? 'shibutz_test';
if (!/^[a-z_][a-z0-9_]*$/.test(TEST_DB)) throw new Error(`Invalid TEST_DB_NAME: ${TEST_DB}`);

async function isUp(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

/** Runs once per jest run: ensures the test DB exists and is migrated, and probes OSRM/VROOM. */
export default async function globalSetup(): Promise<void> {
  const adminUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [TEST_DB]);
  if (existing.rowCount === 0) await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${TEST_DB}`;
  // Tests run in this process (--runInBand), so env set here reaches them.
  process.env.DATABASE_URL = testUrl.toString();
  await runMigrations(process.env.DATABASE_URL);

  process.env.OSRM_UP = (await isUp(OSRM_URL)) ? '1' : '';
  process.env.VROOM_UP = (await isUp(`${VROOM_URL}/health`)) ? '1' : '';
}

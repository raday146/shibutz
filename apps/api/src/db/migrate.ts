import path from 'node:path';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { DEFAULT_DATABASE_URL } from './db.module';

// Programmatic migrator: `drizzle-kit migrate` can swallow SQL errors silently.
export async function runMigrations(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: path.join(__dirname, '../../drizzle') });
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runMigrations(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}

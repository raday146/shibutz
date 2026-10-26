import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { AppModule } from '../src/app.module';
import { DB, type Db } from '../src/db/db.module';

// Empties every app table between tests. spatial_ref_sys belongs to PostGIS, drizzle's
// migration journal lives in the "drizzle" schema, so both survive.
async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE tables text;
    BEGIN
      SELECT string_agg(format('%I', tablename), ', ') INTO tables
      FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys';
      IF tables IS NOT NULL THEN
        EXECUTE 'TRUNCATE ' || tables || ' RESTART IDENTITY CASCADE';
      END IF;
    END $$;
  `);
}

/** Boots the real AppModule against shibutz_test (set by global-setup) and truncates before each test. */
export function setupTestApp(): () => INestApplication {
  let app: INestApplication | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  beforeEach(async () => {
    await truncateAll(current().get<Db>(DB));
  });
  afterAll(async () => {
    await app?.close();
  });

  function current(): INestApplication {
    if (!app) throw new Error('Test app not initialised');
    return app;
  }
  return current;
}

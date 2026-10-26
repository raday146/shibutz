import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://shibutz:shibutz@localhost:5432/shibutz' },
  // Keep drizzle-kit away from PostGIS-owned objects (spatial_ref_sys).
  extensionsFilters: ['postgis'],
});

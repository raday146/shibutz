import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export const DEFAULT_DATABASE_URL = 'postgres://shibutz:shibutz@localhost:5432/shibutz';
export const DB = Symbol('DB');
export type Db = NodePgDatabase<typeof schema> & { $client: Pool };

@Global()
@Module({
  providers: [
    { provide: DB, useFactory: (): Db => drizzle(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL, { schema }) },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.$client.end();
  }
}

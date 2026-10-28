import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Note, PutNote } from '@shibutz/contracts';
import { CLOCK, type Clock } from '../clock/clock';
import { DB, type Db } from '../db/db.module';
import { isForeignKeyViolation } from '../db/errors';
import { jobNotes } from '../db/schema';

const toNote = (r: typeof jobNotes.$inferSelect): Note => ({
  jobId: r.jobId,
  body: r.body,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

@Injectable()
export class NotesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async get(jobId: number): Promise<Note> {
    const [row] = await this.db.select().from(jobNotes).where(eq(jobNotes.jobId, jobId));
    if (!row) throw new NotFoundException('Note not found');
    return toNote(row);
  }

  async put(jobId: number, { body }: PutNote): Promise<Note> {
    const now = this.clock.now();
    const [row] = await this.db
      .insert(jobNotes)
      .values({ jobId, body, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: jobNotes.jobId, set: { body, updatedAt: now } })
      .returning()
      .catch((err: unknown) => {
        if (isForeignKeyViolation(err)) throw new NotFoundException('Job not found');
        throw err;
      });
    if (!row) throw new Error('Upsert returned no row');
    return toNote(row);
  }
}

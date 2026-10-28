import { z } from 'zod';

/** `PUT /jobs/:id/note` replaces the job's one note (an empty body clears the text but keeps the row). */
export const putNoteSchema = z.object({ body: z.string().max(5000) }).strict();
export type PutNote = z.infer<typeof putNoteSchema>;

/** `GET`/`PUT /jobs/:id/note`. */
export const noteSchema = z.object({
  jobId: z.number().int().positive(),
  body: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Note = z.infer<typeof noteSchema>;

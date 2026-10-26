import { integer, pgTable, text } from 'drizzle-orm/pg-core';

// Integer ids: VROOM requires integer skill ids.
export const skills = pgTable('skills', {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  code: text().notNull().unique(),
  name: text().notNull(),
});

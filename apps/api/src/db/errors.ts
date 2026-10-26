import { BadRequestException } from '@nestjs/common';

interface PgError {
  code?: string;
  constraint?: string;
}

// Drizzle wraps driver errors (DrizzleQueryError) with the pg error as `cause`.
function pgError(err: unknown): PgError {
  const cause = err instanceof Error && err.cause !== undefined ? err.cause : err;
  return typeof cause === 'object' && cause !== null ? cause : {};
}

export function isUniqueViolation(err: unknown): boolean {
  return pgError(err).code === '23505';
}

export function isForeignKeyViolation(err: unknown): boolean {
  return pgError(err).code === '23503';
}

/** Maps rule violations enforced by the database (CHECK, unknown skill FK) to 400. */
export async function rejectInvalid<T>(query: Promise<T>): Promise<T> {
  try {
    return await query;
  } catch (err) {
    const { code, constraint } = pgError(err);
    if (code === '23514') throw new BadRequestException(`Violates ${constraint}`);
    if (code === '23503') throw new BadRequestException('Unknown skill id');
    throw err;
  }
}

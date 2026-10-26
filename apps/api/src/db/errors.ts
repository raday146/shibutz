// Drizzle wraps driver errors (DrizzleQueryError) with the pg error as `cause`.
export function isUniqueViolation(err: unknown): boolean {
  const pgError = err instanceof Error && err.cause !== undefined ? err.cause : err;
  return typeof pgError === 'object' && pgError !== null && 'code' in pgError && pgError.code === '23505';
}

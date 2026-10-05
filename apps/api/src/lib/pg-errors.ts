import type { AppError } from '@lib/errors';

interface PgErrorFields {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
}

// Drizzle wraps the driver's error; the SQLSTATE sits somewhere down the cause chain.
function pgError(err: unknown): PgErrorFields | undefined {
  for (let e = err as PgErrorFields | undefined; e; e = e.cause as PgErrorFields | undefined) {
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e;
  }
  return undefined;
}

export const isUniqueViolation = (err: unknown): boolean => pgError(err)?.code === '23505';

export function constraintName(err: unknown): string | undefined {
  const name = pgError(err)?.constraint;
  return typeof name === 'string' ? name : undefined;
}

/** A unique violation on one of `constraints` becomes `error()`; anything else is rethrown untouched. */
export async function withUniqueAs<T>(
  work: () => Promise<T>,
  constraints: readonly string[],
  error: () => AppError,
): Promise<T> {
  try {
    return await work();
  } catch (err) {
    if (isUniqueViolation(err) && constraints.includes(constraintName(err) ?? '')) throw error();
    throw err;
  }
}

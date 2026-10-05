import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

/** `column in ('a','b')` from a constant list, so a CHECK and its TypeScript union cannot drift. */
export function oneOf(column: AnyColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.raw(values.map(v => `'${v.replaceAll("'", "''")}'`).join(','))})`;
}

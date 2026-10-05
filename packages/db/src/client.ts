import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { Pool } from 'pg';
import * as schema from './schema/index.ts';

export type Db = NodePgDatabase<typeof schema>;
export type Queryable = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export interface DbOptions {
  max?: number;
  /** Lets a short-lived process (tests, a job runner) exit without an explicit end(). */
  allowExitOnIdle?: boolean;
}

export function createDb(connectionString: string, options: DbOptions = {}): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString, max: options.max ?? 10, ...options });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export async function pingDb(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}

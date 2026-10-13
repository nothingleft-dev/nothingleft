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
  /** Postgres `statement_timeout` on every pooled connection; 0 turns it off. */
  statementTimeoutMs?: number;
  /** Postgres `idle_in_transaction_session_timeout` on every pooled connection; 0 turns it off. */
  idleInTransactionTimeoutMs?: number;
}

const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS = 30_000;

const milliseconds = (value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`timeout must be whole milliseconds: ${value}`);
  return value;
};

export function createDb(connectionString: string, options: DbOptions = {}): { db: Db; pool: Pool } {
  const {
    statementTimeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS,
    idleInTransactionTimeoutMs = DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    ...poolOptions
  } = options;
  const timeouts =
    `set statement_timeout = ${milliseconds(statementTimeoutMs)}; ` +
    `set idle_in_transaction_session_timeout = ${milliseconds(idleInTransactionTimeoutMs)}`;
  const pool = new Pool({
    connectionString,
    max: poolOptions.max ?? 10,
    ...poolOptions,
    // A SET, not startup parameters, which some connection poolers refuse. onConnect rather than the
    // connect event: the pool awaits it, and a failure ends the connection instead of going unheard.
    onConnect: async client => {
      await client.query(timeouts);
    },
  });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export async function pingDb(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}

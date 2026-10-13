import { describe, expect, test } from 'bun:test';
import { createDb } from '../src/client.ts';

const url = process.env.DATABASE_URL!;

async function timeouts(options: Parameters<typeof createDb>[1]) {
  const { pool } = createDb(url, { max: 1, allowExitOnIdle: true, ...options });
  try {
    const statement = await pool.query<{ statement_timeout: string }>('show statement_timeout');
    const idle = await pool.query<{ idle_in_transaction_session_timeout: string }>(
      'show idle_in_transaction_session_timeout',
    );
    return {
      statement: statement.rows[0]!.statement_timeout,
      idle: idle.rows[0]!.idle_in_transaction_session_timeout,
    };
  } finally {
    await pool.end();
  }
}

describe('createDb', () => {
  test('every pooled connection carries the statement and idle-in-transaction timeouts', async () => {
    expect(await timeouts({})).toEqual({ statement: '30s', idle: '30s' });
  });

  test('the timeouts can be overridden per pool', async () => {
    expect(await timeouts({ statementTimeoutMs: 5_000, idleInTransactionTimeoutMs: 0 })).toEqual({
      statement: '5s',
      idle: '0',
    });
  });
});

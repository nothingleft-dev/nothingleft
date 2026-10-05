import { expect, test } from 'bun:test';
import { pino } from 'pino';
import { loggerOptions } from '@lib/logger';

const MARKER = 'alex.lee@acme.example';

class DrizzleQueryError extends Error {
  query: string;
  params: unknown[];
  constructor(query: string, params: unknown[], cause?: unknown) {
    super(`Failed query: ${query}\nparams: ${params.join(',')}`);
    this.query = query;
    this.params = params;
    this.cause = cause;
  }
}

const queryError = () =>
  new DrizzleQueryError(
    'select * from users where email = $1',
    [MARKER],
    Object.assign(new Error(`invalid input syntax for type uuid: "${MARKER}"`), { code: '22P02' }),
  );

test('05: a logged database error carries neither the SQL parameters nor the row values', () => {
  const lines: string[] = [];
  const log = pino(loggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'test' }), {
    write: (line: string) => void lines.push(line),
  });

  log.error({ err: queryError() }, 'unhandled error');
  log.child({ request_id: 'r1' }).error({ err: queryError() }, 'unhandled error');
  log.error(queryError());
  log.child({ request_id: 'r2' }).warn({ err: queryError() });

  expect(lines).toHaveLength(4);
  for (const line of lines) {
    expect(line).not.toContain(MARKER);
    expect(JSON.parse(line).err.message).toBe('Database query failed (22P02)');
  }
});

test('05: every call shape that can carry a database error is stripped', () => {
  const lines: string[] = [];
  const log = pino(loggerOptions({ LOG_LEVEL: 'info', NODE_ENV: 'test' }), {
    write: (line: string) => void lines.push(line),
  });
  const e = queryError();
  const circular: Record<string, unknown> = { err: e };
  circular.self = circular;

  log.error({ error: e }, 'x');
  log.error({ cause: e }, 'x');
  log.error({ ctx: { err: e } }, 'x');
  log.error({ list: [e] }, 'x');
  log.error('failed %o', e);
  log.error('failed %s', e);
  log.error({ err: new AggregateError([queryError()], 'several') }, 'x');
  log.error({ err: e }, e.message);
  log.error(circular, 'x');
  log.error({ err: new Error('wrapper', { cause: queryError() }) }, 'x');

  expect(lines).toHaveLength(10);
  for (const line of lines) expect(line).not.toContain(MARKER);
});

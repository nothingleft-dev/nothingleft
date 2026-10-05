import { describe, expect, test } from 'bun:test';
import { createAnalytics, distinctId, orgGroupId, redactError, sampledOut } from '../src/index.ts';

describe('identities', () => {
  test('prefix internal ids so users and organisations never collide', () => {
    expect(distinctId(1234)).toBe('user_1234');
    expect(orgGroupId(56)).toBe('org_56');
  });

  test('an anonymous request has a fixed distinct id', () => {
    expect(distinctId(undefined)).toBe('anonymous');
  });
});

describe('createAnalytics', () => {
  test('is a no-op without a key, and never throws', async () => {
    const a = createAnalytics({
      key: undefined,
      host: undefined,
      analyticsEnabled: true,
      errorsEnabled: true,
      sampleRate: 1,
    });
    a.capture('api_request', { route: '/x', method: 'GET', status_code: 200, duration_ms: 1, via: 'anonymous' });
    a.capture(
      'api_request',
      { route: '/x', method: 'GET', status_code: 200, duration_ms: 1, via: 'session', org_id: 56 },
      { userId: 1234, orgId: 56 },
    );
    a.captureException(new Error('boom'), { user_id: 1234, org_id: 56 });
    await a.shutdown();
  });
});

describe('sampling', () => {
  test('thins only the high-volume events; funnel steps always send', () => {
    expect(sampledOut('api_request', 0.1, 0.5)).toBe(true);
    expect(sampledOut('api_request', 0.1, 0.05)).toBe(false);
    expect(sampledOut('issues_searched', 0.1, 0.5)).toBe(true);
    for (const name of [
      'account_created',
      'organization_created',
      'project_created',
      'issue_created',
      'user_active_day',
    ] as const) {
      expect(sampledOut(name, 0.1, 0.99)).toBe(false);
    }
    expect(sampledOut('api_request', 1, 0.99)).toBe(false);
  });
});

const MARKER = 'private-issue-title-7f3a';

// Shaped like drizzle-orm's: it never sets `name`, and carries the SQL and its parameters.
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

// Shaped like pg's: the detail quotes the row.
class DatabaseError extends Error {
  code: string;
  detail: string;
  constructor(message: string, code: string, detail: string) {
    super(message);
    this.name = 'error';
    this.code = code;
    this.detail = detail;
  }
}

const driverError = () =>
  new DatabaseError(
    'duplicate key value violates unique constraint',
    '23505',
    `Key (title)=(${MARKER}) already exists.`,
  );
const queryError = () => new DrizzleQueryError('insert into issues (title) values ($1)', [MARKER], driverError());

/** Every own property of an error and its causes, enumerable or not. */
const dump = (e: unknown): string => {
  if (!(e instanceof Error)) return String(e);
  const record = e as unknown as Record<string, unknown>;
  return Object.getOwnPropertyNames(e)
    .map(k => (k === 'cause' ? dump(e.cause) : String(record[k])))
    .join('\n');
};

describe('redactError', () => {
  test('05: a query error keeps its SQLSTATE and loses the SQL, parameters and row values', () => {
    const redacted = redactError(queryError());
    expect(redacted).toBeInstanceOf(Error);
    expect((redacted as Error).message).toBe('Database query failed (23505)');
    expect(dump(redacted)).not.toContain(MARKER);
    expect(dump(redacted)).not.toContain('insert into issues');
    expect('params' in (redacted as object)).toBe(false);
  });

  test('05: a bare driver error is redacted the same way', () => {
    const redacted = redactError(driverError()) as Error;
    expect(redacted.message).toBe('Database query failed (23505)');
    expect(dump(redacted)).not.toContain(MARKER);
  });

  test('05: a query error further down the cause chain is replaced, the wrapper kept', () => {
    const wrapped = new Error('job failed', { cause: queryError() });
    const redacted = redactError(wrapped) as Error;
    expect(redacted.message).toBe('job failed');
    expect((redacted.cause as Error).message).toBe('Database query failed (23505)');
    expect(dump(redacted)).not.toContain(MARKER);
    expect(dump(wrapped)).toContain(MARKER);
  });

  test('other errors pass through untouched', () => {
    const plain = new Error('boom', { cause: new Error('inner') });
    expect(redactError(plain)).toBe(plain);
    expect(redactError('a string')).toBe('a string');
  });

  test('a cause cycle terminates', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    a.cause = b;
    expect(redactError(a)).toBe(a);
  });
});

describe('captureException', () => {
  test('05: a database error reaches the provider without its parameters', () => {
    const sent: unknown[] = [];
    const analytics = createAnalytics(
      { key: 'phc_test', host: undefined, analyticsEnabled: false, errorsEnabled: true, sampleRate: 1 },
      () => ({
        capture() {},
        captureException: (error: unknown) => void sent.push(error),
        shutdown: async () => {},
      }),
    );
    analytics.captureException(queryError(), { request_id: 'r1', user_id: 1 });
    expect(sent).toHaveLength(1);
    expect((sent[0] as Error).message).toBe('Database query failed (23505)');
    expect(dump(sent[0])).not.toContain(MARKER);
  });
});

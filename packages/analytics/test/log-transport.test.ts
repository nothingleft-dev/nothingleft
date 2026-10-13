import { describe, expect, test } from 'bun:test';
import { createLogSink, toLogRecord } from '../src/log-transport.ts';

const line = (fields: Record<string, unknown>) => JSON.stringify({ time: 1_760_000_000_000, ...fields }) + '\n';

function sink() {
  const calls: { url: string; init: RequestInit }[] = [];
  const stream = createLogSink({
    host: 'https://us.i.posthog.com/',
    token: 'phc_test',
    service: 'api',
    environment: 'production',
    flushMs: 60_000,
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 200 });
    }) as typeof fetch,
  });
  const end = () => new Promise<void>(resolve => stream.end(resolve));
  return { stream, calls, end };
}

describe('toLogRecord', () => {
  test('maps pino levels and keeps the error without the request', () => {
    const record = toLogRecord({
      level: 50,
      time: 1_760_000_000_000,
      msg: 'unhandled error',
      reqId: 'req-1',
      org_id: 7,
      req: { method: 'GET', url: '/v1/issues/PROJ-1?q=secret', remoteAddress: '203.0.113.9' },
      subject: 'PROJ-1 Fix the login page',
      hostname: 'api-blue',
      err: { type: 'Error', message: 'boom', stack: 'Error: boom', code: 'E1', extra: 'dropped' },
    });

    expect(record.severityNumber).toBe(17);
    expect(record.severityText).toBe('ERROR');
    expect(record.timeUnixNano).toBe('1760000000000000000');
    expect(record.body).toEqual({ stringValue: 'unhandled error' });
    expect(record.attributes).toEqual([
      { key: 'reqId', value: { stringValue: 'req-1' } },
      { key: 'org_id', value: { intValue: '7' } },
      { key: 'err.type', value: { stringValue: 'Error' } },
      { key: 'err.message', value: { stringValue: 'boom' } },
      { key: 'err.stack', value: { stringValue: 'Error: boom' } },
      { key: 'err.code', value: { stringValue: 'E1' } },
    ]);
    const text = JSON.stringify(record);
    for (const leaked of ['203.0.113.9', 'secret', 'Fix the login page', 'api-blue', 'dropped']) {
      expect(text).not.toContain(leaked);
    }
  });
});

describe('createLogSink', () => {
  test('batches lines, including one split across writes, and posts them on close', async () => {
    const { stream, calls, end } = sink();
    stream.write(line({ level: 40, msg: 'idempotency store unavailable' }));
    const second = line({ level: 50, msg: 'pg-boss error' });
    stream.write(second.slice(0, 10));
    stream.write(second.slice(10));
    await end();

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://us.i.posthog.com/i/v1/logs');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer phc_test');
    const body = JSON.parse(calls[0]!.init.body as string);
    const resource = body.resourceLogs[0];
    expect(resource.resource.attributes).toContainEqual({ key: 'service.name', value: { stringValue: 'api' } });
    expect(resource.scopeLogs[0].logRecords.map((r: { body: { stringValue: string } }) => r.body.stringValue)).toEqual([
      'idempotency store unavailable',
      'pg-boss error',
    ]);
  });

  test('a failing endpoint never throws into the logger', async () => {
    const stream = createLogSink({
      host: 'https://us.i.posthog.com',
      token: 'phc_test',
      service: 'api',
      environment: 'production',
      fetch: (async () => {
        throw new Error('offline');
      }) as unknown as typeof fetch,
    });
    stream.write(line({ level: 40, msg: 'x' }));
    await new Promise<void>(resolve => stream.end(resolve));
  });

  test('sends nothing when nothing was logged', async () => {
    const { calls, end } = sink();
    await end();
    expect(calls).toHaveLength(0);
  });
});

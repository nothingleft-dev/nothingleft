import { afterEach, describe, expect, test } from 'bun:test';
import pino from 'pino';
import { loadEnv, type Env } from '@config/env';
import { createMailer, type Message } from '@lib/email';

const base = loadEnv({
  DATABASE_URL: 'postgres://user:password@localhost/app',
  DATABASE_URL_POOLED: 'postgres://user:password@localhost/app',
  REDIS_URL: 'redis://localhost:6379',
});

const reset: Message = {
  to: 'alex@example.com',
  subject: 'email.password_reset.subject',
  body: 'email.password_reset.body',
  params: { name: 'Alex', url: 'https://work.example.com/reset-password?token=secret-token' },
};

function capture() {
  const lines: string[] = [];
  const log = pino({ level: 'info' }, { write: (line: string) => void lines.push(line) });
  return { log, output: () => lines.join('') };
}

describe('mailer without RESEND_API_KEY', () => {
  test('development logs the body, so local flows can be followed', async () => {
    const { log, output } = capture();
    await createMailer({ ...base, NODE_ENV: 'development', RESEND_API_KEY: undefined } as Env, log).send(reset);
    expect(output()).toContain('secret-token');
  });

  test.each(['test', 'production'] as const)('%s logs neither the body, the link nor the recipient', async mode => {
    const { log, output } = capture();
    await createMailer({ ...base, NODE_ENV: mode, RESEND_API_KEY: undefined } as Env, log).send(reset);
    expect(output()).toContain('email.password_reset.subject');
    expect(output()).not.toContain('secret-token');
    expect(output()).not.toContain('alex@example.com');
  });
});

describe('mailer with RESEND_API_KEY', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("a rejection reports the provider's error code, never its message or the recipient", async () => {
    globalThis.fetch = (async () =>
      Response.json(
        { statusCode: 422, name: 'validation_error', message: 'Invalid `to` field: alex@example.com' },
        { status: 422 },
      )) as unknown as typeof fetch;
    const { log, output } = capture();
    const mailer = createMailer({ ...base, NODE_ENV: 'production', RESEND_API_KEY: 're_test' } as Env, log);
    const error = await mailer.send(reset).catch((e: unknown) => e as Error);
    expect((error as Error).message).toBe('resend 422 validation_error');
    expect(output()).toContain('validation_error');
    expect(output()).not.toContain('alex@example.com');
  });

  test("a rejection that is not the provider's JSON reports the status alone", async () => {
    globalThis.fetch = (async () =>
      new Response('could not deliver https://work.example.com/reset-password?token=secret-token', {
        status: 422,
      })) as unknown as typeof fetch;
    const { log, output } = capture();
    const mailer = createMailer({ ...base, NODE_ENV: 'production', RESEND_API_KEY: 're_test' } as Env, log);
    const error = await mailer.send(reset).catch((e: unknown) => e as Error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('resend 422');
    expect(output()).not.toContain('secret-token');
    expect(output()).not.toContain('alex@example.com');
  });
});

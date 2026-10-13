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

describe('mailer without provider credentials', () => {
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

  test('sends the support address as reply_to, and nothing without one', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string) as Record<string, unknown>);
      return Response.json({ id: 'x' });
    }) as unknown as typeof fetch;
    const env = { ...base, NODE_ENV: 'production', RESEND_API_KEY: 're_test' } as Env;
    await createMailer({ ...env, SUPPORT_EMAIL: 'admin@nothingleft.dev' }, capture().log).send(reset);
    await createMailer(env, capture().log).send(reset);
    expect(bodies[0]!.reply_to).toBe('admin@nothingleft.dev');
    expect(bodies[0]!.replyTo).toBeUndefined();
    expect(bodies[1]).not.toHaveProperty('reply_to');
  });
});

describe('mailer with zoho', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const env = (key: string) =>
    ({
      ...base,
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'zoho',
      EMAIL_FROM: 'Nothing Left <noreply@mail.example.com>',
      ZOHO_EMAIL_API_KEY: key,
    }) as Env;

  test('posts the zoho body shape, prefixes a bare key, and carries headers as mime_headers', async () => {
    let seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | undefined;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      seen = {
        url,
        headers: init.headers as Record<string, string>,
        body: JSON.parse(init.body as string) as Record<string, unknown>,
      };
      return Response.json({ message: 'OK' });
    }) as unknown as typeof fetch;
    await createMailer(env('abc123'), capture().log).send({
      ...reset,
      headers: { 'List-Unsubscribe': '<https://x.example/u>' },
    });
    expect(seen?.url).toBe('https://cpaas.zoho.com/v1.1/email');
    expect(seen?.headers.authorization).toBe('Zoho-enczapikey abc123');
    expect(seen?.body.from).toEqual({ address: 'noreply@mail.example.com', name: 'Nothing Left' });
    expect(seen?.body.to).toEqual([{ email_address: { address: 'alex@example.com' } }]);
    expect(seen?.body.mime_headers).toEqual({ 'List-Unsubscribe': '<https://x.example/u>' });
    expect(String(seen?.body.textbody)).toContain('secret-token');
    expect(seen?.body.reply_to).toBeUndefined();
  });

  test('replies go to the support address when one is set', async () => {
    let body: Record<string, unknown> = {};
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      body = JSON.parse(init.body as string) as Record<string, unknown>;
      return Response.json({});
    }) as unknown as typeof fetch;
    await createMailer({ ...env('abc123'), SUPPORT_EMAIL: 'help@mail.example.com' }, capture().log).send(reset);
    expect(body.reply_to).toEqual([{ address: 'help@mail.example.com' }]);
  });

  test('a key that already carries the prefix is sent as is', async () => {
    let authorization = '';
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      authorization = (init.headers as Record<string, string>).authorization!;
      return Response.json({});
    }) as unknown as typeof fetch;
    await createMailer(env('Zoho-enczapikey abc123'), capture().log).send(reset);
    expect(authorization).toBe('Zoho-enczapikey abc123');
  });

  test("a rejection reports the provider's error code, never its message or the recipient", async () => {
    globalThis.fetch = (async () =>
      Response.json(
        { data: { error_code: 'TM_3004', message: 'Invalid to: alex@example.com' }, message: 'error' },
        { status: 400 },
      )) as unknown as typeof fetch;
    const { log, output } = capture();
    const error = await createMailer(env('k'), log)
      .send(reset)
      .catch((e: unknown) => e as Error);
    expect((error as Error).message).toBe('zoho 400 TM_3004');
    expect(output()).not.toContain('alex@example.com');
  });
});

describe('mailer with smtp', () => {
  const env = (port: number) =>
    ({
      ...base,
      NODE_ENV: 'production',
      EMAIL_PROVIDER: 'smtp',
      EMAIL_FROM: 'Nothing Left <noreply@mail.example.com>',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: port,
      SMTP_SECURE: false,
    }) as Env;

  function fakeServer() {
    let data = '';
    const server = Bun.listen<{ inData: boolean }>({
      hostname: '127.0.0.1',
      port: 0,
      socket: {
        open(socket) {
          socket.data = { inData: false };
          socket.write('220 fake ESMTP\r\n');
        },
        data(socket, chunk) {
          const text = chunk.toString();
          if (socket.data.inData) {
            data += text;
            if (text.endsWith('\r\n.\r\n')) {
              socket.data.inData = false;
              socket.write('250 queued\r\n');
            }
            return;
          }
          for (const line of text.split('\r\n').filter(Boolean)) {
            if (/^EHLO/i.test(line)) socket.write('250 fake\r\n');
            else if (/^DATA/i.test(line)) {
              socket.data.inData = true;
              socket.write('354 go\r\n');
            } else if (/^QUIT/i.test(line)) {
              socket.write('221 bye\r\n');
              socket.end();
            } else socket.write('250 ok\r\n');
          }
        },
      },
    });
    return { server, received: () => data };
  }

  test('delivers a text and html message with its headers', async () => {
    const { server, received } = fakeServer();
    try {
      await createMailer(env(server.port), capture().log).send({
        ...reset,
        headers: { 'List-Unsubscribe': '<https://x.example/u>' },
      });
      const raw = received();
      expect(raw).toContain('Subject: =?UTF-8?Q?Reset_your_password');
      expect(raw).toContain('List-Unsubscribe: <https://x.example/u>');
      expect(raw).not.toContain('Reply-To');
      expect(raw).toContain('text/html');
      expect(raw).toContain('text/plain');
    } finally {
      server.stop(true);
    }
  });

  test('a refused connection reports its code, never the recipient', async () => {
    const { server } = fakeServer();
    const port = server.port;
    server.stop(true);
    const { log, output } = capture();
    const error = await createMailer(env(port), log)
      .send(reset)
      .catch((e: unknown) => e as Error);
    expect((error as Error).message).toBe('smtp ESOCKET');
    expect(output()).not.toContain('alex@example.com');
  });
});

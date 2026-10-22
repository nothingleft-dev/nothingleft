import { describe, expect, test } from 'bun:test';
import { fastifyTrustProxy, loadEnv, parseTrustProxy, type Env, type TrustProxy } from '@config/env';

const source = {
  DATABASE_URL: 'postgres://user:password@localhost/app',
  DATABASE_URL_POOLED: 'postgres://user:password@localhost/app',
};

describe('Redis URL validation', () => {
  test.each([
    'redis://localhost:6379',
    'redis://127.0.0.1:6379',
    'redis://[::1]:6379',
    'redis://redis:6379',
    'redis://localhost',
    'redis://default:password@localhost:6379',
    'rediss://default:password@example.upstash.io:6379',
  ])('accepts %s', REDIS_URL => {
    expect(loadEnv({ ...source, REDIS_URL }).REDIS_URL).toBe(REDIS_URL);
  });

  test.each([
    'redis://example.upstash.io:6379',
    'redis://localhost.example.com:6379',
    'redis://example.com/@localhost:6379',
    'https://localhost:6379',
    'not-a-url',
  ])('rejects %s', REDIS_URL => {
    expect(() => loadEnv({ ...source, REDIS_URL })).toThrow('Invalid environment');
  });
});

describe('BYO_ALLOW_ANY_ENDPOINT', () => {
  const base = { ...source, REDIS_URL: 'redis://localhost:6379' };
  const production = {
    ...base,
    NODE_ENV: 'production',
    EMAIL_LINK_SECRET: 'x'.repeat(32),
    ENCRYPTION_MASTER_KEY: Buffer.alloc(32, 1).toString('base64'),
    RESEND_API_KEY: 're_test',
  };

  test('is off unless set, and allowed outside production', () => {
    expect(loadEnv(base).BYO_ALLOW_ANY_ENDPOINT).toBe(false);
    expect(loadEnv({ ...base, BYO_ALLOW_ANY_ENDPOINT: 'true' }).BYO_ALLOW_ANY_ENDPOINT).toBe(true);
    expect(loadEnv(production).BYO_ALLOW_ANY_ENDPOINT).toBe(false);
  });

  test('production refuses to boot with it', () => {
    expect(() => loadEnv({ ...production, BYO_ALLOW_ANY_ENDPOINT: 'true' })).toThrow('BYO_ALLOW_ANY_ENDPOINT');
  });
});

describe('RESEND_API_KEY', () => {
  test('production refuses to boot without it, so mail is never logged there', () => {
    expect(() =>
      loadEnv({
        ...source,
        REDIS_URL: 'redis://localhost:6379',
        NODE_ENV: 'production',
        EMAIL_LINK_SECRET: 'x'.repeat(32),
        ENCRYPTION_MASTER_KEY: Buffer.alloc(32, 1).toString('base64'),
      }),
    ).toThrow('RESEND_API_KEY');
  });
});

describe('EMAIL_PROVIDER', () => {
  const production = {
    ...source,
    REDIS_URL: 'redis://localhost:6379',
    NODE_ENV: 'production',
    EMAIL_LINK_SECRET: 'x'.repeat(32),
    ENCRYPTION_MASTER_KEY: Buffer.alloc(32, 1).toString('base64'),
  };

  test('defaults to resend', () => {
    expect(loadEnv({ ...production, RESEND_API_KEY: 're_test' }).EMAIL_PROVIDER).toBe('resend');
  });

  test('production needs the chosen provider’s credentials, and only those', () => {
    expect(() => loadEnv({ ...production, EMAIL_PROVIDER: 'zoho', RESEND_API_KEY: 're_test' })).toThrow(
      'ZOHO_EMAIL_API_KEY',
    );
    expect(() => loadEnv({ ...production, EMAIL_PROVIDER: 'smtp', RESEND_API_KEY: 're_test' })).toThrow('SMTP_HOST');
    expect(loadEnv({ ...production, EMAIL_PROVIDER: 'zoho', ZOHO_EMAIL_API_KEY: 'k' }).EMAIL_PROVIDER).toBe('zoho');
    expect(loadEnv({ ...production, EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.com' }).SMTP_PORT).toBe(587);
  });

  test('an unknown provider is refused', () => {
    expect(() => loadEnv({ ...production, EMAIL_PROVIDER: 'sendgrid' })).toThrow('EMAIL_PROVIDER');
  });

  test('SMTP user and password come as a pair', () => {
    expect(() => loadEnv({ ...production, EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'h', SMTP_USER: 'u' })).toThrow(
      'SMTP_PASSWORD',
    );
  });
});

describe('TRUST_PROXY', () => {
  const base = { ...source, REDIS_URL: 'redis://localhost:6379' };
  const cases: [string | undefined, Env['NODE_ENV'], TrustProxy][] = [
    ['false', 'production', false],
    ['0', 'production', false],
    ['2', 'development', 2],
    ['10.0.0.0/8, 2001:db8::/32', 'production', '10.0.0.0/8, 2001:db8::/32'],
    ['', 'production', 1],
    [undefined, 'production', 1],
    [undefined, 'development', false],
    [undefined, 'test', false],
  ];

  test.each(cases)('%p under %s trusts %p', (raw, nodeEnv, expected) => {
    expect(parseTrustProxy(raw, nodeEnv)).toBe(expected);
  });

  test('a valid value passes boot validation unchanged', () => {
    expect(loadEnv({ ...base, TRUST_PROXY: '10.0.0.0/8,172.16.0.0/12' }).TRUST_PROXY).toBe('10.0.0.0/8,172.16.0.0/12');
    expect(loadEnv(base).TRUST_PROXY).toBeUndefined();
  });

  test.each(['true', 'yes', 'proxy.internal', '1 hop'])('refuses to boot with %p', TRUST_PROXY => {
    expect(() => loadEnv({ ...base, TRUST_PROXY })).toThrow('TRUST_PROXY');
  });

  test('a hop count trusts exactly that many hops', () => {
    const trust = fastifyTrustProxy(1);
    if (typeof trust !== 'function') throw new Error('a hop count must become a trust function');
    expect(trust('10.0.0.1', 0)).toBe(true);
    expect(trust('198.51.100.9', 1)).toBe(false);
    expect(fastifyTrustProxy(false)).toBe(false);
    expect(fastifyTrustProxy('10.0.0.0/8')).toBe('10.0.0.0/8');
  });
});

describe('LOG_TARGETS posthog', () => {
  const base = { ...source, REDIS_URL: 'redis://localhost:6379', LOG_TARGETS: 'json,posthog' };

  test('needs the project key that ships the lines', () => {
    expect(() => loadEnv(base)).toThrow('POSTHOG_KEY');
    expect(loadEnv({ ...base, POSTHOG_KEY: 'phc_test' }).LOG_TARGETS).toEqual(['json', 'posthog']);
  });
});

describe('S3 key pair', () => {
  const base = { ...source, REDIS_URL: 'redis://localhost:6379', S3_ENDPOINT: 'https://s3.eu-west-1.amazonaws.com' };

  test('both or neither: neither leaves signing to the runtime role', () => {
    expect(loadEnv(base).S3_ACCESS_KEY_ID).toBeUndefined();
    expect(loadEnv({ ...base, S3_ACCESS_KEY_ID: 'key', S3_SECRET_ACCESS_KEY: 'secret' }).S3_ACCESS_KEY_ID).toBe('key');
  });

  test('refuses half a pair', () => {
    expect(() => loadEnv({ ...base, S3_ACCESS_KEY_ID: 'key' })).toThrow('S3_SECRET_ACCESS_KEY');
    expect(() => loadEnv({ ...base, S3_SECRET_ACCESS_KEY: 'secret' })).toThrow('S3_SECRET_ACCESS_KEY');
  });
});

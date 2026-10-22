import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { loadEnv } from '@config/env';
import { createStorage } from '@lib/storage';

const env = loadEnv({
  DATABASE_URL: 'postgres://user:password@localhost/app',
  DATABASE_URL_POOLED: 'postgres://user:password@localhost/app',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'https://s3.eu-west-1.amazonaws.com',
  S3_REGION: 'eu-west-1',
  S3_PUBLIC_BUCKET: 'acme-public',
  S3_PUBLIC_BUCKET_BASE_URL: 'https://acme-public.s3.eu-west-1.amazonaws.com',
  S3_PRIVATE_BUCKET: 'acme-private',
});

const spec = { contentType: 'image/png', size: 10 };
const credentialOf = (url: string) => new URL(url).searchParams.get('X-Amz-Credential')?.split('/')[0];

describe('platform storage endpoints', () => {
  const local = { ...env, S3_ENDPOINT: 'http://storage:9000', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' };
  const hostOf = (url: string) => new URL(url).host;

  test('presigned URLs name S3_ENDPOINT when no browser endpoint is set', async () => {
    const storage = createStorage(local);
    expect(hostOf(await storage.presignPublicPut('avatars/a.png', spec, 60))).toBe('storage:9000');
  });

  test('presigned URLs name the browser endpoint when one is set', async () => {
    const storage = createStorage({ ...local, S3_BROWSER_ENDPOINT: 'https://storage.example.com' });
    const sha256 = Buffer.alloc(32).toString('base64');
    const put = await storage.private!.presignPut('a/b', { contentType: 'text/plain', size: 1, sha256 }, 60);
    const get = await storage.private!.presignGet('a/b', { contentType: 'text/plain', disposition: 'inline' }, 60);
    expect([hostOf(await storage.presignPublicPut('avatars/a.png', spec, 60)), hostOf(put.url), hostOf(get)]).toEqual([
      'storage.example.com',
      'storage.example.com',
      'storage.example.com',
    ]);
  });
});

describe('platform storage credentials', () => {
  const saved = { id: process.env.AWS_ACCESS_KEY_ID, secret: process.env.AWS_SECRET_ACCESS_KEY };
  beforeAll(() => {
    process.env.AWS_ACCESS_KEY_ID = 'ROLEKEY';
    process.env.AWS_SECRET_ACCESS_KEY = 'role-secret';
  });
  afterAll(() => {
    for (const [name, value] of [
      ['AWS_ACCESS_KEY_ID', saved.id],
      ['AWS_SECRET_ACCESS_KEY', saved.secret],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  test('without a key pair, storage is configured and signs with the runtime credentials', async () => {
    const storage = createStorage(env);
    expect(storage.configured).toBe(true);
    expect(storage.private?.bucket).toBe('acme-private');
    expect(credentialOf(await storage.presignPublicPut('avatars/a.png', spec, 60))).toBe('ROLEKEY');
  });

  test('a configured key pair wins over the runtime credentials', async () => {
    const storage = createStorage({ ...env, S3_ACCESS_KEY_ID: 'STATICKEY', S3_SECRET_ACCESS_KEY: 'static-secret' });
    expect(credentialOf(await storage.presignPublicPut('avatars/a.png', spec, 60))).toBe('STATICKEY');
  });
});

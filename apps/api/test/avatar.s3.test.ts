import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { AVATAR_PRESIGN_TTL_SECONDS } from '@nothingleft/types';
import { avatarObjectKey } from '@lib/avatar';
import { createStorage } from '@lib/storage';
import { testEnv } from './helpers.ts';

setDefaultTimeout(60_000);

const configured = Boolean(testEnv.S3_ENDPOINT && testEnv.S3_PUBLIC_BUCKET && testEnv.S3_PUBLIC_BUCKET_BASE_URL);
const storage = createStorage(testEnv);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

async function presign(size: number) {
  const key = avatarObjectKey(1, 'image/png');
  const url = await storage.presignPublicPut(key, { contentType: 'image/png', size }, AVATAR_PRESIGN_TTL_SECONDS);
  return { key, url };
}

describe.skipIf(!configured)('avatar uploads against real object storage', () => {
  test('the declared type and size upload', async () => {
    const { key, url } = await presign(png.length);
    const put = await fetch(url, { method: 'PUT', body: png, headers: { 'content-type': 'image/png' } });
    expect(put.status).toBe(200);
    expect(await storage.headPublic(key)).toMatchObject({ size: png.length, content_type: 'image/png' });
    await storage.deletePublic(key);
  });

  test('storage refuses a body longer than the signed size', async () => {
    const { key, url } = await presign(png.length);
    const larger = new Uint8Array(png.length * 4);
    const put = await fetch(url, { method: 'PUT', body: larger, headers: { 'content-type': 'image/png' } });
    expect(put.status).toBeGreaterThanOrEqual(400);
    expect(await storage.headPublic(key)).toBeNull();
  });

  test('storage refuses a type other than the signed one', async () => {
    const { key, url } = await presign(png.length);
    const put = await fetch(url, { method: 'PUT', body: png, headers: { 'content-type': 'text/html' } });
    expect(put.status).toBeGreaterThanOrEqual(400);
    expect(await storage.headPublic(key)).toBeNull();
  });
});

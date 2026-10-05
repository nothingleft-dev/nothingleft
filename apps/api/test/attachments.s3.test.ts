import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createStorage } from '@lib/storage';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import { testEnv } from './helpers.ts';

setDefaultTimeout(120_000);

// Against a real S3-compatible store (docker compose `storage`); skipped where none is configured.
const configured = Boolean(testEnv.S3_ENDPOINT && testEnv.S3_PRIVATE_BUCKET);
const KEY = 'S3T';
const DAY_MS = 86_400_000;

let w: IssueWorld;
const storage = createStorage(testEnv);
const bytes = new TextEncoder().encode('a screenshot, honestly');
const sha256 = async (body: Uint8Array<ArrayBuffer>) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', body)).toString('base64');

async function presignAndPut(key: string, body: Uint8Array<ArrayBuffer>, filename = 'shot.png', mime = 'image/png') {
  const res = await w.call(w.contributor, 'POST', '/v1/attachments/presign', {
    issue: key,
    filename,
    mime,
    size: body.length,
    sha256: await sha256(body),
  });
  expect(res.statusCode).toBe(201);
  const { attachment, upload_url, upload_headers } = res.json().data;
  const put = await fetch(upload_url, { method: 'PUT', body, headers: upload_headers });
  return { attachment, put, upload_url, upload_headers };
}

beforeAll(async () => {
  if (configured) w = await issueWorld(KEY);
});

afterAll(async () => {
  if (configured) await w.close();
});

describe.skipIf(!configured)('attachments against real object storage', () => {
  test('upload, download through the 302, delete and sweep', async () => {
    const key = (await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Real bytes' })).json().data.key;
    const { attachment, put } = await presignAndPut(key, bytes);
    expect(put.status).toBe(200);

    const done = await w.call(w.contributor, 'POST', `/v1/attachments/${attachment.id}/complete`);
    expect(done.statusCode).toBe(200);

    const redirect = await w.app.inject({
      method: 'GET',
      url: new URL(attachment.url).pathname,
      headers: w.observer.headers,
    });
    expect(redirect.statusCode).toBe(302);
    const download = await fetch(String(redirect.headers.location));
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
    expect(download.headers.get('content-type')).toBe('image/png');
    expect(download.headers.get('content-disposition')).toStartWith('inline;');

    // The bucket itself answers nobody without a signature.
    const objectUrl = String(redirect.headers.location).split('?')[0]!;
    expect((await fetch(objectUrl)).status).toBe(403);

    await w.call(w.contributor, 'DELETE', `/v1/attachments/${attachment.id}`);
    await w.app.jobHandlers['attachments.sweep']();
    const objectKey = new URL(objectUrl).pathname.split('/').slice(2).join('/');
    expect(await storage.private!.head(objectKey)).toBeNull();
  });

  test('storage refuses bytes that differ from the signed length or checksum', async () => {
    const key = (await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Tampered' })).json().data.key;
    const { upload_url, upload_headers } = await presignAndPut(key, bytes);
    const tampered = new TextEncoder().encode('a screenshot, honestlY');
    const res = await fetch(upload_url, { method: 'PUT', body: tampered, headers: upload_headers });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  test('the browser may PUT from the app origin', async () => {
    const key = (await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'CORS' })).json().data.key;
    const res = await w.call(w.contributor, 'POST', '/v1/attachments/presign', {
      issue: key,
      filename: 'a.png',
      mime: 'image/png',
      size: bytes.length,
      sha256: await sha256(bytes),
    });
    const preflight = await fetch(res.json().data.upload_url, {
      method: 'OPTIONS',
      headers: {
        origin: testEnv.APP_BASE_URL,
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type,x-amz-checksum-sha256',
      },
    });
    expect(preflight.status).toBeLessThan(300);
    expect(preflight.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  test('issues.purge deletes the objects of a purged issue', async () => {
    const key = (await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Purged' })).json().data.key;
    const { attachment, upload_url } = await presignAndPut(key, bytes);
    await w.call(w.contributor, 'POST', `/v1/attachments/${attachment.id}/complete`);
    const objectKey = new URL(upload_url).pathname.split('/').slice(2).join('/');
    expect(await storage.private!.head(objectKey)).not.toBeNull();

    await w.call(w.admin, 'DELETE', `/v1/issues/${key}`);
    const id = await w.repos.issueId(Number(key.split('-')[1]));
    await w.repos.issues.update(w.repos.ctx, id, { deleted_at: new Date(Date.now() - 15 * DAY_MS) });
    await w.app.jobHandlers['issues.purge']();
    expect(await storage.private!.head(objectKey)).toBeNull();
  });
});

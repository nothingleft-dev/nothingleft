import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { CreateBucketCommand, ListObjectsV2Command, PutBucketCorsCommand, S3Client } from '@aws-sdk/client-s3';
import { attachmentsRepository } from '@nothingleft/db';
import { BYO_CHECK_OBJECT_BYTES, byoCorsRules } from '@nothingleft/types';
import { runQueued, type RecordingQueue } from '@lib/jobs';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import { testEnv } from './helpers.ts';
import { password } from './people.ts';

setDefaultTimeout(120_000);

// Against the local S3-compatible store (docker compose `storage`): a second bucket on it plays the customer's own.
const configured = Boolean(testEnv.S3_ENDPOINT && testEnv.S3_PRIVATE_BUCKET);
const CUSTOMER = 'nl-byo-test';
const sha256 = async (body: Uint8Array<ArrayBuffer>) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', body)).toString('base64');

let w: IssueWorld;
const client = new S3Client({
  ...(testEnv.S3_ENDPOINT ? { endpoint: testEnv.S3_ENDPOINT } : {}),
  region: testEnv.S3_REGION,
  credentials: { accessKeyId: testEnv.S3_ACCESS_KEY_ID ?? '', secretAccessKey: testEnv.S3_SECRET_ACCESS_KEY ?? '' },
  forcePathStyle: true,
});
const listCustomer = async (prefix: string) =>
  ((await client.send(new ListObjectsV2Command({ Bucket: CUSTOMER, Prefix: prefix }))).Contents ?? []).map(o => o.Key!);

beforeAll(async () => {
  if (!configured) return;
  try {
    await client.send(new CreateBucketCommand({ Bucket: CUSTOMER }));
  } catch (error) {
    if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes((error as Error).name)) throw error;
  }
  await client.send(
    new PutBucketCorsCommand({
      Bucket: CUSTOMER,
      CORSConfiguration: { CORSRules: byoCorsRules(testEnv.APP_BASE_URL) },
    }),
  );
  w = await issueWorld('BS3');
});

afterAll(async () => {
  if (configured) await w.close();
});

describe.skipIf(!configured)('bring your own storage against real object storage', () => {
  test('connect, verify from the browser, upload, migrate, serve both, disconnect — and their objects stay', async () => {
    const base = `/v1/organizations/${w.slug}/storage`;
    const key = (await w.call(w.admin, 'POST', '/v1/issues', { project: 'BS3', title: 'Real bytes' })).json().data.key;
    const put = async (body: Uint8Array<ArrayBuffer>) => {
      const res = await w.call(w.contributor, 'POST', '/v1/attachments/presign', {
        issue: key,
        filename: 'shot.png',
        mime: 'image/png',
        size: body.length,
        sha256: await sha256(body),
      });
      const { attachment, upload_url, upload_headers } = res.json().data;
      expect((await fetch(upload_url, { method: 'PUT', body, headers: upload_headers })).status).toBe(200);
      expect((await w.call(w.contributor, 'POST', `/v1/attachments/${attachment.id}/complete`)).statusCode).toBe(200);
      return { attachment, upload_url: upload_url as string };
    };
    const download = async (id: string) => {
      const redirect = await w.app.inject({ method: 'GET', url: `/files/${id}/shot.png`, headers: w.observer.headers });
      expect(redirect.statusCode).toBe(302);
      const location = String(redirect.headers.location);
      return { location, bytes: new Uint8Array(await (await fetch(location)).arrayBuffer()) };
    };

    const ours = crypto.getRandomValues(new Uint8Array(200_000));
    const platformFile = await put(ours);
    expect((await download(platformFile.attachment.id)).bytes).toEqual(ours);

    const connection = {
      provider: 's3',
      endpoint: testEnv.S3_ENDPOINT,
      region: 'us-east-1',
      bucket: CUSTOMER,
      access_key_id: testEnv.S3_ACCESS_KEY_ID,
      current_password: password,
    };
    const wrong = await w.call(w.admin, 'PUT', `${base}/connection`, { ...connection, secret_access_key: 'not-it' });
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json().error.code).toBe('storage.check_wrong_secret');
    const ok = await w.call(w.admin, 'PUT', `${base}/connection`, {
      ...connection,
      secret_access_key: testEnv.S3_SECRET_ACCESS_KEY,
    });
    expect(ok.json().data.status).toBe('pending');

    // The browser's half, with the preflight a real browser would send first.
    const verifyFromBrowser = async () => {
      const sample = crypto.getRandomValues(new Uint8Array(BYO_CHECK_OBJECT_BYTES));
      const check = (
        await w.call(w.admin, 'POST', `${base}/connection/browser-check`, {
          size: sample.length,
          sha256: await sha256(sample),
        })
      ).json().data;
      const preflight = await fetch(check.upload_url, {
        method: 'OPTIONS',
        headers: {
          origin: testEnv.APP_BASE_URL,
          'access-control-request-method': 'PUT',
          'access-control-request-headers': 'content-type,x-amz-checksum-sha256',
        },
      });
      expect(preflight.headers.get('access-control-allow-origin')).toBeTruthy();
      expect(
        (await fetch(check.upload_url, { method: 'PUT', body: sample, headers: check.upload_headers })).status,
      ).toBe(200);
      expect(new Uint8Array(await (await fetch(check.download_url)).arrayBuffer())).toEqual(sample);
      const verified = await w.call(w.admin, 'POST', `${base}/connection/verify`, {
        check_id: check.check_id,
        sha256: await sha256(sample),
      });
      expect(verified.json().data.status).toBe('verified');
    };
    await verifyFromBrowser();
    const orgId = w.repos.ctx.orgId;
    expect(await listCustomer(`api/${orgId}/_check/`)).toEqual([]);

    const theirs = crypto.getRandomValues(new Uint8Array(120_000));
    const customerFile = await put(theirs);
    expect(customerFile.upload_url).toContain(`/${CUSTOMER}/`);
    expect((await download(customerFile.attachment.id)).location).toContain(`/${CUSTOMER}/`);
    expect((await download(customerFile.attachment.id)).bytes).toEqual(theirs);
    const doomed = await put(crypto.getRandomValues(new Uint8Array(1_000)));

    expect((await w.call(w.admin, 'POST', `${base}/migration`)).statusCode).toBe(202);
    const queue = w.app.jobQueue as RecordingQueue;
    for (const job of queue.pending.splice(0)) await runQueued(w.app.queuedHandlers, job);
    const done = (await w.call(w.admin, 'GET', base)).json().data;
    expect(done.connection.migration).toMatchObject({ state: 'done', migrated_files: 1, migrated_bytes: ours.length });
    expect(done.platform.bytes).toBe(0);
    const moved = await download(platformFile.attachment.id);
    expect(moved.location).toContain(`/${CUSTOMER}/`);
    expect(moved.bytes).toEqual(ours);

    const before = await listCustomer(`api/${orgId}/`);
    expect(before).toHaveLength(3);
    const off = await w.call(w.admin, 'DELETE', `${base}/connection`, { current_password: password });
    expect(off.statusCode).toBe(200);
    expect(
      (
        await w.app.inject({
          method: 'GET',
          url: `/files/${customerFile.attachment.id}/shot.png`,
          headers: w.admin.headers,
        })
      ).statusCode,
    ).toBe(410);

    // The same physical store under another endpoint string: to the application, another location.
    const elsewhere = new URL(testEnv.S3_ENDPOINT!);
    elsewhere.hostname = elsewhere.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
    const other = await w.call(w.admin, 'PUT', `${base}/connection`, {
      ...connection,
      endpoint: elsewhere.origin,
      secret_access_key: testEnv.S3_SECRET_ACCESS_KEY,
    });
    expect(other.json().data).toMatchObject({ status: 'pending', endpoint: elsewhere.origin });
    await verifyFromBrowser();
    const view = (await w.call(w.admin, 'GET', base)).json().data;
    expect(view.bring_your_own).toEqual({ files: 0, bytes: 0 });
    const serveElsewhere = await w.app.inject({
      method: 'GET',
      url: `/files/${customerFile.attachment.id}/shot.png`,
      headers: w.admin.headers,
    });
    expect(serveElsewhere.statusCode).toBe(410);
    expect(serveElsewhere.json().error.code).toBe('storage.byo_disconnected');
    expect((await w.call(w.admin, 'DELETE', `/v1/attachments/${doomed.attachment.id}`)).statusCode).toBe(200);
    await w.app.jobHandlers['attachments.sweep']();
    expect(await attachmentsRepository(w.db).findByPublicId(w.repos.ctx, doomed.attachment.id)).toBeUndefined();
    expect(await listCustomer(`api/${orgId}/`)).toEqual(before);

    const again = await w.call(w.admin, 'PUT', `${base}/connection`, {
      ...connection,
      secret_access_key: testEnv.S3_SECRET_ACCESS_KEY,
    });
    expect(again.json().data.status).toBe('pending');
    await verifyFromBrowser();
    expect((await download(customerFile.attachment.id)).bytes).toEqual(theirs);
    expect((await download(platformFile.attachment.id)).bytes).toEqual(ours);

    await w.call(w.admin, 'POST', `/v1/organizations/${w.slug}/deletion`, { current_password: password });
    await w.app.jobHandlers['org.delete'](new Date(Date.now() + 15 * 86_400_000));
    expect(await listCustomer(`api/${orgId}/`)).toEqual(before);
  });
});

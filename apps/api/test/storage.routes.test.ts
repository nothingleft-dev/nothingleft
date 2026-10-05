import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { attachmentsRepository, organizationsRepository, orgStorageConfigsRepository } from '@nothingleft/db';
import { BYO_CHECK_OBJECT_BYTES, BYO_SECRET_MASK, FREE_STORAGE_BYTES_DEFAULT } from '@nothingleft/types';
import { runQueued, type RecordingQueue } from '@lib/jobs';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import { BYO_TEST_ENDPOINT, memoryStorage, type MemoryBucket } from './memory-storage.ts';
import { password, type Person } from './people.ts';

setDefaultTimeout(120_000);

const SHA = Buffer.alloc(32, 7).toString('base64');
const CHECK_SHA = Buffer.alloc(32, 9).toString('base64');
const SECRET = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
const DAY_MS = 86_400_000;

interface Attachment {
  id: string;
  url: string;
  issue: string | null;
  available: boolean;
  size_bytes: number;
}

type Memory = ReturnType<typeof memoryStorage>;

function helpers(w: IssueWorld, memory: Memory) {
  const base = `/v1/organizations/${w.slug}/storage`;
  const seen: string[] = [];
  const call: IssueWorld['call'] = async (...args) => {
    const res = await w.call(...args);
    seen.push(res.body);
    return res;
  };

  const newIssue = async (title = 'Checkout times out') => {
    const res = await call(w.admin, 'POST', '/v1/issues', { project: w.key, title });
    if (res.statusCode !== 201) throw new Error(res.body);
    return res.json().data.key as string;
  };

  async function upload(who: Person, body: object, size = 1000): Promise<Attachment & { upload_url: string }> {
    const res = await call(who, 'POST', '/v1/attachments/presign', {
      filename: 'shot.png',
      mime: 'image/png',
      size,
      sha256: SHA,
      ...body,
    });
    if (res.statusCode !== 201) throw new Error(`presign: ${res.body}`);
    const { attachment, upload_url } = res.json().data;
    memory.uploadUrl(upload_url, size, SHA);
    const done = await call(who, 'POST', `/v1/attachments/${attachment.id}/complete`);
    if (done.statusCode !== 200) throw new Error(`complete: ${done.body}`);
    return { ...done.json().data, upload_url };
  }

  const serve = (who: Person, a: { id: string }) =>
    w.app.inject({ method: 'GET', url: `/files/${a.id}/shot.png`, headers: who.headers });

  const overview = async (who: Person = w.admin) => {
    const res = await call(who, 'GET', base);
    if (res.statusCode !== 200) throw new Error(res.body);
    return res.json().data;
  };

  const connect = (body: object = {}, who: Person = w.admin) =>
    call(who, 'PUT', `${base}/connection`, {
      provider: 's3',
      endpoint: BYO_TEST_ENDPOINT,
      region: 'us-east-1',
      bucket: 'acme-files',
      access_key_id: KEY_ID,
      secret_access_key: SECRET,
      current_password: password,
      ...body,
    });

  /** The browser's half: presigned PUT and GET of the test file, then verify. */
  async function browserCheck(who: Person = w.admin, landed = true) {
    const res = await call(who, 'POST', `${base}/connection/browser-check`, {
      size: BYO_CHECK_OBJECT_BYTES,
      sha256: CHECK_SHA,
    });
    if (res.statusCode !== 201) throw new Error(res.body);
    const check = res.json().data;
    if (landed) memory.uploadUrl(check.upload_url, BYO_CHECK_OBJECT_BYTES, CHECK_SHA);
    return {
      check,
      verify: () => call(who, 'POST', `${base}/connection/verify`, { check_id: check.check_id, sha256: CHECK_SHA }),
    };
  }

  async function connectAndVerify(body: object = {}) {
    const connected = await connect(body);
    if (connected.statusCode !== 200) throw new Error(connected.body);
    const verified = await (await browserCheck()).verify();
    if (verified.statusCode !== 200) throw new Error(verified.body);
    return verified.json().data;
  }

  async function drain(at = new Date()) {
    const queue = w.app.jobQueue as RecordingQueue;
    let moved = 0;
    for (let guard = 0; guard < 20 && queue.pending.length > 0; guard++) {
      for (const job of queue.pending.splice(0)) {
        if (job.name === 'storage.migrate') moved += await runQueued(w.app.queuedHandlers, job, at);
      }
    }
    return moved;
  }

  const org = async () => (await call(w.admin, 'GET', `/v1/organizations/${w.slug}`)).json().data;
  const configs = orgStorageConfigsRepository(w.db);
  const setUsed = async (bytes: number) => {
    const orgs = organizationsRepository(w.db);
    const current = (await orgs.findById(w.repos.ctx))!.storage_used_bytes;
    await orgs.adjustStorageUsed(w.repos.ctx, bytes - current);
  };

  return {
    base,
    seen,
    call,
    newIssue,
    upload,
    serve,
    overview,
    connect,
    browserCheck,
    connectAndVerify,
    drain,
    org,
    configs,
    setUsed,
  };
}

async function promote(w: IssueWorld, username: string) {
  const res = await w.call(w.admin, 'PATCH', `/v1/organizations/${w.slug}/members/${username}`, {
    org_role: 'org_admin',
  });
  if (res.statusCode !== 200) throw new Error(res.body);
}

async function token(w: IssueWorld, who: Person, scopes: string[]): Promise<Person> {
  const res = await w.call(who, 'POST', '/v1/me/tokens', { name: `t-${scopes.join('-')}`, scopes });
  return { email: who.email, sid: '', headers: { authorization: `Bearer ${res.json().data.token}` } };
}

describe('the usage screen', () => {
  let w: IssueWorld;
  let memory: Memory;
  let h: ReturnType<typeof helpers>;

  beforeAll(async () => {
    memory = memoryStorage();
    w = await issueWorld('STU', { storage: memory.storage });
    h = helpers(w, memory);
  });
  afterAll(async () => {
    await w.close();
  });

  test('Org Admins and the Owner see it; project roles are refused and strangers find nothing', async () => {
    await promote(w, w.projectAdmin.username);
    expect((await h.call(w.admin, 'GET', h.base)).statusCode).toBe(200);
    expect((await h.call(w.projectAdmin, 'GET', `${h.base}/files`)).statusCode).toBe(200);
    for (const who of [w.contributor, w.observer]) {
      expect((await h.call(who, 'GET', h.base)).statusCode).toBe(403);
      expect((await h.call(who, 'GET', `${h.base}/files`)).statusCode).toBe(403);
    }
    expect((await h.call(w.outsider, 'GET', h.base)).statusCode).toBe(404);
  });

  test('a token reads it with admin:org, and never reaches the connection routes', async () => {
    const reader = await token(w, w.admin, ['admin:org']);
    expect((await h.call(reader, 'GET', h.base)).statusCode).toBe(200);
    expect((await h.call(reader, 'GET', `${h.base}/files`)).statusCode).toBe(200);
    const narrow = await token(w, w.admin, ['issues:read']);
    expect((await h.call(narrow, 'GET', h.base)).statusCode).toBe(403);
    const connect = await h.connect({}, reader);
    expect(connect.statusCode).toBe(403);
    expect(connect.json().error.code).toBe('auth.session_required');
    for (const [method, path] of [
      ['POST', '/connection/browser-check'],
      ['POST', '/connection/verify'],
      ['POST', '/migration'],
      ['DELETE', '/connection'],
    ] as const) {
      const res = await h.call(reader, method, `${h.base}${path}`, {});
      expect(res.json().error.code).not.toBe('internal');
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
    }
  });

  test('files are listed largest first with what holds them, drafts and deleted parents apart', async () => {
    const key = await h.newIssue();
    const big = await h.upload(w.contributor, { issue: key }, 50_000);
    await h.upload(w.contributor, { issue: key }, 2_000);
    const comment = (
      await h.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, { body_md: 'see attached' })
    ).json().data;
    await h.upload(w.contributor, { issue: key, comment_id: comment.id }, 30_000);
    const draft = await h.upload(w.contributor, { project: w.key }, 7_000);

    const gone = await h.newIssue('Deleted soon');
    await h.upload(w.contributor, { issue: gone }, 9_000);
    await h.call(w.admin, 'DELETE', `/v1/issues/${gone}`);

    const res = await h.call(w.admin, 'GET', `${h.base}/files`);
    const files = res.json().data;
    expect(files.map((f: { size_bytes: number }) => f.size_bytes)).toEqual([50_000, 30_000, 9_000, 2_000]);
    expect(files[0]).toMatchObject({
      id: big.id,
      issue: key,
      project: w.key,
      storage_target: 'platform',
      available: true,
      purges_at: null,
      me: { can_delete: true },
    });
    expect(files[1]).toMatchObject({ comment_id: comment.id, issue: key });
    expect(files[2].issue).toBe(gone);
    expect(files[2].purges_at).not.toBeNull();
    expect(files[2].me.can_delete).toBe(false);
    expect(files.some((f: { id: string }) => f.id === draft.id)).toBe(false);
    expect(res.json().meta.pagination).toMatchObject({ total: 4, offset: 0 });

    const view = await h.overview();
    expect(view.platform).toMatchObject({ files: 5, bytes: 98_000, level: 'ok' });
    expect(view.unclaimed).toEqual({ files: 1, bytes: 7_000 });
    expect(view.awaiting_purge).toEqual({ files: 1, bytes: 9_000 });
    expect(view.bring_your_own).toEqual({ files: 0, bytes: 0 });
    expect(view.connection).toBeNull();
    expect(view.cors_origin).toStartWith('http');
  });

  test('pages, sorts by date and filters by project and target', async () => {
    const page = await h.call(w.admin, 'GET', `${h.base}/files?limit=2&offset=1`);
    expect(page.json().data).toHaveLength(2);
    expect(page.json().meta.pagination).toMatchObject({ total: 4, limit: 2, offset: 1, has_more: true });
    const byDate = (await h.call(w.admin, 'GET', `${h.base}/files?sort=created`)).json().data;
    expect(byDate[0].size_bytes).toBe(9_000);
    expect((await h.call(w.admin, 'GET', `${h.base}/files?target=byo`)).json().data).toEqual([]);
    expect((await h.call(w.admin, 'GET', `${h.base}/files?project=${w.key}`)).json().data).toHaveLength(4);
    expect((await h.call(w.admin, 'GET', `${h.base}/files?project=NOPE`)).statusCode).toBe(404);
  });

  test('deleting from the list is the attachment delete, and frees the bytes', async () => {
    const [first] = (await h.call(w.admin, 'GET', `${h.base}/files`)).json().data;
    const before = (await h.overview()).platform.bytes;
    expect((await h.call(w.admin, 'DELETE', `/v1/attachments/${first.id}`)).statusCode).toBe(200);
    expect((await h.overview()).platform.bytes).toBe(before - first.size_bytes);
  });

  test('storage.reconcile corrects drift, re-arms the notices, and raises them when the truth is past 95%', async () => {
    const actual = (await h.overview()).platform.bytes;
    await h.setUsed(actual + 12_345);
    const orgs = organizationsRepository(w.db);
    await orgs.setStorageNoticeLevel(w.repos.ctx, 95);
    expect(await w.app.jobHandlers['storage.reconcile']()).toBeGreaterThanOrEqual(1);
    const row = (await orgs.findById(w.repos.ctx))!;
    expect(row.storage_used_bytes).toBe(actual);
    expect(row.storage_notice_level).toBe(0);

    // The counter says almost nothing is used, the files say 96%: the truth wins, and the email goes once.
    const repo = attachmentsRepository(w.db);
    const huge = Math.ceil(FREE_STORAGE_BYTES_DEFAULT * 0.96);
    await repo.insert(w.repos.ctx, {
      public_id: crypto.randomUUID(),
      issue_id: null,
      article_id: null,
      comment_id: null,
      work_item_id: null,
      filename: 'backup.zip',
      mime_type: 'application/zip',
      size_bytes: huge,
      checksum: Buffer.alloc(32),
      storage_target: 'platform',
      bucket: memory.storage.private!.bucket,
      object_key: `api/${w.repos.ctx.orgId}/drafts/1/${crypto.randomUUID()}`,
      created_by: (await orgs.findById(w.repos.ctx))!.owner_user_id,
      completed_at: new Date(),
    });
    const sent = w.box.sent.length;
    await w.app.jobHandlers['storage.reconcile']();
    expect((await orgs.findById(w.repos.ctx))!.storage_notice_level).toBe(95);
    const mails = w.box.sent.slice(sent).filter(m => m.subject === 'email.storage_almost_full.subject');
    expect(mails.length).toBeGreaterThan(0);
    await w.app.jobHandlers['storage.reconcile']();
    expect(w.box.sent.slice(sent).filter(m => m.subject === 'email.storage_almost_full.subject')).toHaveLength(
      mails.length,
    );
  });
});

describe('bring your own storage', () => {
  let w: IssueWorld;
  let memory: Memory;
  let h: ReturnType<typeof helpers>;
  let bucket: MemoryBucket;
  let key: string;
  let before: Attachment;

  beforeAll(async () => {
    memory = memoryStorage();
    bucket = memory.createBucket('acme-files', KEY_ID, SECRET);
    w = await issueWorld('BYO', { storage: memory.storage });
    h = helpers(w, memory);
    key = await h.newIssue();
    before = await h.upload(w.contributor, { issue: key });
  });
  afterAll(async () => {
    await w.close();
  });

  test('connecting needs step-up and the Configure BYO storage cell', async () => {
    expect((await h.connect({ current_password: 'wrong-password-entirely' })).statusCode).toBe(401);
    for (const who of [w.projectAdmin, w.contributor, w.observer]) {
      expect((await h.connect({ current_password: password }, who)).statusCode).toBe(403);
    }
    expect((await h.connect({}, w.outsider)).statusCode).toBe(404);
  });

  test('the server round trip names what is wrong, and the form keeps what was typed', async () => {
    const wrong = await h.connect({ secret_access_key: 'not-the-secret' });
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json().error).toMatchObject({ code: 'storage.check_wrong_secret', field: 'secret_access_key' });
    expect((await h.overview()).connection).toMatchObject({
      status: 'failed',
      bucket: 'acme-files',
      access_key_id: KEY_ID,
      secret: BYO_SECRET_MASK,
      last_error: { step: 'put', reason: 'wrong_secret' },
    });
    // A setup that never verified blocks nothing: members see it as still being set up.
    expect((await h.org()).storage).toMatchObject({ bring_your_own: 'pending', level: 'ok' });

    expect((await h.connect({ access_key_id: 'AKIANOBODY' })).json().error.code).toBe('storage.check_invalid_key');
    expect((await h.connect({ bucket: 'no-such-bucket' })).json().error).toMatchObject({
      code: 'storage.check_no_bucket',
      field: 'bucket',
    });
    bucket.denied.add('delete');
    expect((await h.connect()).json().error.code).toBe('storage.check_denied_delete');
    // The key could write but not delete, so its test object stays behind in their bucket.
    expect([...bucket.objects.keys()]).toEqual([expect.stringContaining('/_check/server-')]);
    bucket.denied.clear();
    bucket.objects.clear();
    const r2 = await h.connect({ provider: 'r2', endpoint: undefined, region: undefined });
    expect(r2.json().error).toMatchObject({ code: 'storage.endpoint_required', field: 'account_id' });
    // Uploads still go to the platform: nothing is verified.
    expect((await h.upload(w.contributor, { issue: key })).upload_url).toContain('/nl-private-test/');
  });

  test('a passing round trip is pending until the browser check proves the bucket answers the app', async () => {
    const res = await h.connect();
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ status: 'pending', last_error: null, provider: 's3' });
    expect(bucket.objects.size).toBe(0);

    const missing = await (await h.browserCheck(w.admin, false)).verify();
    expect(missing.statusCode).toBe(422);
    expect(missing.json().error.code).toBe('storage.check_expired');
    expect((await h.org()).storage.bring_your_own).toBe('pending');
  });

  test('the quota lifts on verification: a full organisation uploads to its own bucket at once', async () => {
    await h.setUsed(FREE_STORAGE_BYTES_DEFAULT);
    const refused = await h.call(w.contributor, 'POST', '/v1/attachments/presign', {
      issue: key,
      filename: 'a.png',
      mime: 'image/png',
      size: 10,
      sha256: SHA,
    });
    expect(refused.json().error.code).toBe('storage.quota_exceeded');

    const sent = w.box.sent.length;
    const { check, verify } = await h.browserCheck();
    expect(check.upload_url).toContain('/acme-files/');
    expect(check.download_url).toContain('/acme-files/');
    const verified = await verify();
    expect(verified.statusCode).toBe(200);
    expect(verified.json().data.status).toBe('verified');
    expect(bucket.objects.size).toBe(0);
    expect(w.box.sent.slice(sent).map(m => m.subject)).toContain('email.storage_connected.subject');
    const org = await h.org();
    expect(org.storage).toMatchObject({ bring_your_own: 'verified', level: 'ok' });

    const theirs = await h.upload(w.contributor, { issue: key }, 4_000);
    expect(theirs.upload_url).toContain('/acme-files/');
    expect(bucket.objects.size).toBe(1);
    expect((await h.org()).storage.used_bytes).toBe(FREE_STORAGE_BYTES_DEFAULT);
    await h.setUsed(2_000);

    const activity = (
      await h.call(w.admin, 'GET', `/v1/organizations/${w.slug}/activity?kind=storage_connected`)
    ).json().data;
    expect(activity[0].new_value).toMatchObject({ bucket: 'acme-files', access_key_id: KEY_ID });
  });

  test('a file on the platform and a file in the customer bucket both serve through the files route', async () => {
    const theirs = (await h.call(w.admin, 'GET', `${h.base}/files?target=byo`)).json().data[0];
    const platform = await h.serve(w.observer, before);
    expect(platform.statusCode).toBe(302);
    expect(platform.headers.location).toContain('/nl-private-test/');
    const customer = await h.serve(w.observer, theirs);
    expect(customer.statusCode).toBe(302);
    expect(customer.headers.location).toContain('/acme-files/');
    expect((await h.serve(w.outsider, theirs)).statusCode).toBe(404);
  });

  test('a failed migration leaves every file serving, and a retry finishes it', async () => {
    const view = await h.overview();
    expect(view.platform.files).toBe(2);
    bucket.failPuts = 1;
    const started = await h.call(w.admin, 'POST', `${h.base}/migration`);
    expect(started.statusCode).toBe(202);
    expect(started.json().data.migration).toMatchObject({ state: 'running', total_files: 2, migrated_files: 0 });
    expect((await h.call(w.admin, 'POST', `${h.base}/migration`)).json().error.code).toBe('storage.migration_running');
    await h.drain();

    const failed = (await h.overview()).connection.migration;
    expect(failed).toMatchObject({ state: 'failed', error: { step: 'connect', reason: 'unreachable' } });
    for (const f of (await h.call(w.admin, 'GET', `${h.base}/files`)).json().data) {
      expect((await h.serve(w.admin, f)).statusCode).toBe(302);
    }

    expect((await h.call(w.admin, 'POST', `${h.base}/migration`)).statusCode).toBe(202);
    await h.drain();
    const done = await h.overview();
    expect(done.connection.migration).toMatchObject({ state: 'done', migrated_files: 2, total_files: 2 });
    expect(done.connection.migration.migrated_bytes).toBe(done.connection.migration.total_bytes);
    expect(done.platform).toMatchObject({ files: 0, bytes: 0 });
    expect(done.bring_your_own.files).toBe(3);
    expect(memory.objects.size).toBe(0);
    const moved = await h.serve(w.admin, before);
    expect(moved.headers.location).toContain('/acme-files/');
  });

  test('a secret is never returned by any route', async () => {
    await h.call(w.admin, 'GET', `/v1/organizations/${w.slug}/activity`);
    await h.call(w.admin, 'GET', `/v1/organizations/${w.slug}`);
    const row = await h.configs.find(w.repos.ctx);
    expect(row!.secret_ciphertext).toStartWith('v1.');
    for (const body of h.seen) {
      expect(body).not.toContain(SECRET);
      expect(body).not.toContain(row!.secret_ciphertext);
    }
  });

  test('a revoked key trips the connection once: files and uploads answer clearly, nobody is spammed', async () => {
    bucket.credentials = { accessKeyId: KEY_ID, secret: 'rotated-by-someone' };
    const sent = w.box.sent.length;
    const presign = await h.call(w.contributor, 'POST', '/v1/attachments/presign', {
      issue: key,
      filename: 'late.png',
      mime: 'image/png',
      size: 10,
      sha256: SHA,
    });
    const { attachment, upload_url } = presign.json().data;
    memory.uploadUrl(upload_url, 10, SHA);
    const complete = await h.call(w.contributor, 'POST', `/v1/attachments/${attachment.id}/complete`);
    expect(complete.statusCode).toBe(409);
    expect(complete.json().error.code).toBe('storage.byo_unavailable');
    expect((await h.overview()).connection).toMatchObject({
      status: 'failed',
      last_error: { step: 'get', reason: 'wrong_secret' },
    });
    expect((await h.org()).storage.bring_your_own).toBe('failed');
    const failedMails = w.box.sent.slice(sent).filter(m => m.subject === 'email.storage_byo_failed.subject');
    expect(failedMails.length).toBeGreaterThan(0);

    const serve = await h.serve(w.admin, before);
    expect(serve.statusCode).toBe(409);
    expect(serve.json().error.code).toBe('storage.byo_unavailable');
    const again = await h.call(w.contributor, 'POST', '/v1/attachments/presign', {
      issue: key,
      filename: 'b.png',
      mime: 'image/png',
      size: 10,
      sha256: SHA,
    });
    expect(again.json().error.code).toBe('storage.byo_unavailable');
    const listed = (await h.call(w.admin, 'GET', `/v1/issues/${key}/attachments`)).json().data;
    expect(listed.every((a: Attachment) => a.available === false)).toBe(true);

    // The sweep leaves the customer's files alone while the key is broken, and says nothing.
    await h.call(w.admin, 'DELETE', `/v1/attachments/${before.id}`);
    await w.app.jobHandlers['attachments.sweep']();
    expect(await attachmentsRepository(w.db).findByPublicId(w.repos.ctx, before.id)).toBeDefined();
    expect(w.box.sent.slice(sent).filter(m => m.subject === 'email.storage_byo_failed.subject')).toHaveLength(
      failedMails.length,
    );
  });

  test('rotating the key: a wrong one changes nothing, the right one restores serving and deletes resume', async () => {
    const prior = await h.configs.find(w.repos.ctx);
    const wrong = await h.connect({ secret_access_key: 'still-wrong' });
    expect(wrong.statusCode).toBe(422);
    const kept = await h.configs.find(w.repos.ctx);
    expect(kept!.status).toBe('failed');
    expect(kept!.location_id).toBe(prior!.location_id);
    expect(kept!.access_key_id).toBe(prior!.access_key_id);

    const rotated = await h.connect({ access_key_id: KEY_ID, secret_access_key: 'rotated-by-someone' });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().data).toMatchObject({ status: 'verified', last_error: null });
    expect(rotated.json().data.migration.state).toBe('done');
    const files = (await h.call(w.admin, 'GET', `${h.base}/files`)).json().data;
    expect((await h.serve(w.admin, files[0])).statusCode).toBe(302);

    const deletedKey = memory.objectKeyOf(before.id);
    await w.app.jobHandlers['attachments.sweep']();
    expect(bucket.deleted).toContain(deletedKey);
    const kinds = (await h.call(w.admin, 'GET', `/v1/organizations/${w.slug}/activity?kind=storage_updated`)).json()
      .data;
    expect(kinds).toHaveLength(1);
  });

  test('another bucket is refused while files live in this one', async () => {
    const res = await h.connect({ bucket: 'other-bucket', secret_access_key: 'rotated-by-someone' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('storage.bucket_in_use');
  });

  test('a late platform upload after the migration follows the rest across', async () => {
    await h.configs.recordCheck(w.repos.ctx, { status: 'pending', last_error: null, at: new Date() });
    const late = await h.upload(w.contributor, { issue: key }, 321);
    expect(late.upload_url).toContain('/nl-private-test/');
    await h.configs.recordCheck(w.repos.ctx, { status: 'verified', last_error: null, at: new Date() });
    // What complete does when it lands after verification: queue the migration again.
    await w.app.jobQueue.send(
      'storage.migrate',
      { org_id: w.repos.ctx.orgId },
      { startAfter: new Date(), singletonKey: 'x' },
    );
    await h.drain();
    expect((await h.serve(w.admin, late)).headers.location).toContain('/acme-files/');
    expect((await h.overview()).platform.files).toBe(0);
  });

  test('disconnecting keeps the files in the bucket, stops serving them, and reconnecting brings them back', async () => {
    const objects = new Set(bucket.objects.keys());
    const sent = w.box.sent.length;
    expect(
      (await h.call(w.admin, 'DELETE', `${h.base}/connection`, { current_password: 'nope-nope-nope' })).statusCode,
    ).toBe(401);
    const res = await h.call(w.admin, 'DELETE', `${h.base}/connection`, { current_password: password });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.connection).toBeNull();
    expect(res.json().data.earlier_buckets).toEqual([expect.objectContaining({ bucket: 'acme-files' })]);
    expect(new Set(bucket.objects.keys())).toEqual(objects);
    expect(w.box.sent.slice(sent).map(m => m.subject)).toContain('email.storage_disconnected.subject');

    const file = (await h.call(w.admin, 'GET', `${h.base}/files`)).json().data[0];
    expect(file.available).toBe(false);
    const serve = await h.serve(w.admin, file);
    expect(serve.statusCode).toBe(410);
    expect(serve.json().error.code).toBe('storage.byo_disconnected');

    // A delete while disconnected removes the row and leaves their object where it is.
    await h.call(w.admin, 'DELETE', `/v1/attachments/${file.id}`);
    const itsKey = memory.objectKeyOf(file.id);
    await w.app.jobHandlers['attachments.sweep']();
    expect(await attachmentsRepository(w.db).findByPublicId(w.repos.ctx, file.id)).toBeUndefined();
    expect(bucket.objects.has(itsKey)).toBe(true);

    expect((await h.upload(w.contributor, { issue: key })).upload_url).toContain('/nl-private-test/');

    await h.connectAndVerify({ secret_access_key: 'rotated-by-someone' });
    const back = (await h.call(w.admin, 'GET', `${h.base}/files?target=byo`)).json().data[0];
    expect(back.available).toBe(true);
    expect((await h.serve(w.admin, back)).statusCode).toBe(302);
    const kinds = (
      await h.call(w.admin, 'GET', `/v1/organizations/${w.slug}/activity?kind=storage_disconnected`)
    ).json().data;
    expect(kinds).toHaveLength(1);
  });

  test('storage.reconcile probes the bucket: a revoked key fails it, and a stalled migration is queued again', async () => {
    bucket.denied.add('put');
    await w.app.jobHandlers['storage.reconcile']();
    expect((await h.configs.find(w.repos.ctx))!.status).toBe('failed');
    bucket.denied.clear();
    await w.app.jobHandlers['storage.reconcile']();
    expect((await h.configs.find(w.repos.ctx))!.status).toBe('verified');

    await h.call(w.admin, 'POST', `${h.base}/migration`);
    (w.app.jobQueue as RecordingQueue).pending.splice(0);
    await w.db.execute(
      `update org_storage_configs set updated_at = now() - interval '2 hours' where org_id = ${w.repos.ctx.orgId}`,
    );
    expect((await h.overview()).connection.migration.stalled).toBe(true);
    await w.app.jobHandlers['storage.reconcile']();
    expect((w.app.jobQueue as RecordingQueue).pending.some(j => j.name === 'storage.migrate')).toBe(true);
    await h.drain();
    expect((await h.overview()).connection.migration.state).toBe('done');
  });

  test('nothing but the file lifecycle deletes a customer object: organisation deletion leaves them all', async () => {
    const objects = new Set(bucket.objects.keys());
    expect(objects.size).toBeGreaterThan(0);
    const del = await h.call(w.admin, 'POST', `/v1/organizations/${w.slug}/deletion`, { current_password: password });
    expect(del.statusCode).toBe(200);
    await w.app.jobHandlers['org.delete'](new Date(Date.now() + 15 * DAY_MS));
    expect(new Set(bucket.objects.keys())).toEqual(objects);
    expect(await h.configs.find(w.repos.ctx)).toBeUndefined();
  });
});

describe('a storage location is its endpoint and bucket, not the bucket name', () => {
  const OTHER_ENDPOINT = 'http://other.test.local';
  const OTHER_KEY = 'AKIAOTHERACCOUNT0001';
  const OTHER_SECRET = 'another-account-entirely-secret';
  const elsewhere = {
    bucket: 'files',
    endpoint: OTHER_ENDPOINT,
    access_key_id: OTHER_KEY,
    secret_access_key: OTHER_SECRET,
  };
  let w: IssueWorld;
  let memory: Memory;
  let h: ReturnType<typeof helpers>;
  let original: MemoryBucket;
  let other: MemoryBucket;
  let key: string;
  let kept: Attachment;

  const fileDeletes = (bucket: MemoryBucket) => bucket.deleted.filter(k => !k.includes('/_check/'));

  beforeAll(async () => {
    memory = memoryStorage();
    original = memory.createBucket('files', KEY_ID, SECRET);
    other = memory.createBucket('files', OTHER_KEY, OTHER_SECRET, OTHER_ENDPOINT);
    w = await issueWorld('LOC', { storage: memory.storage });
    h = helpers(w, memory);
    key = await h.newIssue();
  });
  afterAll(async () => {
    await w.close();
  });

  test('after a disconnect, another account’s bucket of the same name never serves or deletes the old files', async () => {
    await h.connectAndVerify({ bucket: 'files' });
    kept = await h.upload(w.contributor, { issue: key });
    const doomed = await h.upload(w.contributor, { issue: key });
    expect(original.objects.size).toBe(2);
    const doomedKey = memory.objectKeyOf(doomed.id);

    const off = await h.call(w.admin, 'DELETE', `${h.base}/connection`, { current_password: password });
    expect(off.statusCode).toBe(200);
    await h.connectAndVerify(elsewhere);

    const view = await h.overview();
    expect(view.connection).toMatchObject({ bucket: 'files', endpoint: OTHER_ENDPOINT, status: 'verified' });
    expect(view.bring_your_own).toEqual({ files: 0, bytes: 0 });
    expect(view.earlier_buckets).toEqual([{ bucket: 'files', files: 2, bytes: 2000 }]);
    const listed = (await h.call(w.admin, 'GET', `${h.base}/files?target=byo`)).json().data;
    expect(listed.map((f: Attachment) => f.available)).toEqual([false, false]);
    const onIssue = (await h.call(w.admin, 'GET', `/v1/issues/${key}/attachments`)).json().data;
    expect(onIssue.every((a: Attachment) => a.available === false)).toBe(true);
    const serve = await h.serve(w.admin, kept);
    expect(serve.statusCode).toBe(410);
    expect(serve.json().error.code).toBe('storage.byo_disconnected');

    expect((await h.call(w.admin, 'DELETE', `/v1/attachments/${doomed.id}`)).statusCode).toBe(200);
    await w.app.jobHandlers['attachments.sweep']();
    expect(await attachmentsRepository(w.db).findByPublicId(w.repos.ctx, doomed.id)).toBeUndefined();
    expect(fileDeletes(other)).toEqual([]);
    expect(fileDeletes(original)).toEqual([]);
    expect(original.objects.has(doomedKey)).toBe(true);
  });

  test('connecting the original location again serves its files again', async () => {
    await h.connectAndVerify({ bucket: 'files' });
    const view = await h.overview();
    expect(view.bring_your_own).toEqual({ files: 1, bytes: 1000 });
    expect(view.earlier_buckets).toEqual([]);
    const back = await h.serve(w.admin, kept);
    expect(back.statusCode).toBe(302);
    expect(back.headers.location).toStartWith('https://s3.test.local/files/');
  });

  test('a same-named bucket elsewhere is refused while files live at this location', async () => {
    const res = await h.connect(elsewhere);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('storage.bucket_in_use');
    expect((await h.configs.find(w.repos.ctx))!.endpoint).toBe(BYO_TEST_ENDPOINT);
  });
});

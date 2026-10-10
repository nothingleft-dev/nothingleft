import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { exportJobsRepository, organizationsRepository } from '@nothingleft/db';
import { runQueued, type RecordingQueue } from '@lib/jobs';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import { memoryStorage } from './memory-storage.ts';
import type { Person } from './people.ts';
import { readZip } from './zip.ts';

setDefaultTimeout(120_000);

const KEY = 'EXP';
const SHA = Buffer.alloc(32, 7).toString('base64');
let w: IssueWorld;
let other: IssueWorld;
let memory: ReturnType<typeof memoryStorage>;

const queue = () => w.app.jobQueue as RecordingQueue;
const base = () => `/v1/organizations/${w.slug}/exports`;
const request = (who: Person = w.admin) => w.call(who, 'POST', base());

async function runExports(at?: Date) {
  let done = 0;
  const jobs = queue().pending.filter(j => j.name === 'export.org');
  queue().pending.splice(0, queue().pending.length, ...queue().pending.filter(j => j.name !== 'export.org'));
  for (const job of jobs) done += await runQueued(w.app.queuedHandlers, job, at);
  return done;
}

const archiveOf = (id: number) => {
  const key = [...memory.objects.keys()].find(k => k.includes(`/export/${id}/`));
  return key ? readZip(memory.objects.get(key)!.body) : null;
};
const json = (zip: Map<string, Buffer>, path: string) => JSON.parse(zip.get(path)!.toString('utf8'));

async function attach(key: string, filename: string) {
  const res = await w.call(w.admin, 'POST', '/v1/attachments/presign', {
    filename,
    mime: 'text/plain',
    size: 12,
    sha256: SHA,
    issue: key,
  });
  const { attachment, upload_url } = res.json().data;
  memory.uploadUrl(upload_url, 12, SHA);
  await w.call(w.admin, 'POST', `/v1/attachments/${attachment.id}/complete`);
  return attachment.id as string;
}

let liveKey: string;
let fileId: string;
let goneId: string;

beforeAll(async () => {
  memory = memoryStorage();
  w = await issueWorld(KEY, { storage: memory.storage });
  other = await issueWorld('EXQ', { storage: memory.storage });
  liveKey = (await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Exported invoice bug' })).json().data
    .key;
  const deletedKey = (
    await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Deleted before export' })
  ).json().data.key;
  await w.call(w.admin, 'DELETE', `/v1/issues/${deletedKey}`);
  await other.call(other.admin, 'POST', '/v1/issues', { project: 'EXQ', title: 'Elsewhere secret' });
  const commented = await w.call(w.admin, 'POST', `/v1/issues/${liveKey}/comments`, {
    body_md: 'A comment worth keeping',
  });
  if (commented.statusCode !== 201) throw new Error(commented.body);
  for (const view of [
    { name: 'Shared view', query: 'invoice', visibility: 'org' },
    { name: 'My private view', query: 'invoice' },
  ]) {
    const res = await w.call(w.admin, 'POST', '/v1/saved-views', view);
    if (res.statusCode !== 201) throw new Error(res.body);
  }
  fileId = await attach(liveKey, 'notes/today.txt');
  goneId = await attach(liveKey, 'gone.txt');
  memory.objects.delete(memory.objectKeyOf(goneId));
});

afterAll(async () => {
  await w.close();
  await other.close();
});

describe('requesting an export', () => {
  test('queues one job, records who asked, and answers the same job while it is pending', async () => {
    const res = await request();
    expect(res.statusCode).toBe(202);
    const job = res.json().data;
    expect(job).toMatchObject({
      scope: 'org',
      format: 'json',
      status: 'queued',
      download_url: null,
      created_by: { username: w.admin.username },
    });
    expect((await request()).json().data.id).toBe(job.id);
    expect(queue().pending.filter(j => j.name === 'export.org')).toHaveLength(1);
    const activity = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/activity`)).json().data;
    expect(activity.filter((a: { kind: string }) => a.kind === 'export_requested')).toHaveLength(1);
  });

  test('the job writes one archive: readable issues, the tables, the files and a manifest', async () => {
    const [job] = (await w.call(w.admin, 'GET', base())).json().data;
    expect(await runExports()).toBe(1);
    const done = (await w.call(w.admin, 'GET', `${base()}/${job.id}`)).json().data;
    expect(done).toMatchObject({
      status: 'completed',
      file_count: 1,
      missing_file_count: 1,
      download_url: `${base()}/${job.id}/download`,
    });
    expect(done.size_bytes).toBeGreaterThan(0);
    expect(new Date(done.expires_at).getTime() - new Date(done.completed_at).getTime()).toBe(7 * 86_400_000);

    const zip = archiveOf(job.id)!;
    const manifest = json(zip, 'manifest.json');
    expect(manifest).toMatchObject({
      format_version: 1,
      organization: { slug: w.slug },
      counts: { issues: 1, files: 1, 'tables/issues': 1 },
      missing_files: [{ id: goneId, filename: 'gone.txt', reason: 'gone' }],
    });
    const issues = json(zip, 'issues.json');
    expect(issues.map((i: { key: string }) => i.key)).toEqual([liveKey]);
    expect(issues[0]).toMatchObject({ title: 'Exported invoice bug', status: { name: 'Open' } });
    const rawIssues = json(zip, 'tables/issues.json');
    expect(rawIssues).toHaveLength(1);
    expect('search_tsv' in rawIssues[0]).toBe(false);
    expect(json(zip, 'tables/comments.json').map((c: { body_md: string }) => c.body_md)).toEqual([
      'A comment worth keeping',
    ]);
    expect(json(zip, 'tables/saved_views.json').map((v: { name: string }) => v.name)).toEqual(['Shared view']);
    const members = json(zip, 'members.json');
    expect(members.map((m: { email: string }) => m.email)).toContain(w.contributor.email);
    expect(JSON.stringify(members)).not.toContain('password');
    const files = json(zip, 'files.json');
    expect(files.find((f: { id: string }) => f.id === fileId).path).toBe(`files/${fileId}/notes_today.txt`);
    expect(files.find((f: { id: string }) => f.id === goneId).path).toBeNull();
    expect(zip.get(`files/${fileId}/notes_today.txt`)?.length).toBe(12);
    expect([...zip.values()].some(b => b.toString('utf8').includes('Elsewhere secret'))).toBe(false);
  });

  test('the requester is emailed a link to the settings page, never to the file', async () => {
    const mail = w.box.sent.findLast(m => m.subject === 'email.export_ready.subject')!;
    expect(mail.to).toBe(w.admin.email);
    expect(String(mail.params?.url)).toEndWith('/organization?tab=exports');
  });

  test('download redirects to a short-lived link named after the organisation', async () => {
    const [job] = (await w.call(w.admin, 'GET', base())).json().data;
    const res = await w.call(w.admin, 'GET', `${base()}/${job.id}/download`);
    expect(res.statusCode).toBe(302);
    const location = new URL(res.headers.location as string);
    expect(location.searchParams.get('response-content-disposition')).toStartWith(
      `attachment; filename="nothingleft-${w.slug}-`,
    );
  });

  test('a new export may be requested once the last one has finished', async () => {
    const res = await request();
    expect(res.json().data.status).toBe('queued');
    await runExports();
  });

  test('a completed export past its expiry reads as expired before the sweep has run', async () => {
    const repo = exportJobsRepository(w.db);
    const row = await repo.insertPending(w.repos.ctx, (await idOf(w.admin))!);
    await repo.transition(w.repos.ctx, row!.id, ['queued'], {
      status: 'completed',
      object_key: `api/${w.repos.ctx.orgId}/export/${row!.id}/lapsed`,
      completed_at: new Date(Date.now() - 8 * 86_400_000),
      expires_at: new Date(Date.now() - 60_000),
    });
    const listed = (await w.call(w.admin, 'GET', base())).json().data.find((j: { id: number }) => j.id === row!.id);
    expect(listed).toMatchObject({ status: 'expired', download_url: null });
    expect((await w.call(w.admin, 'GET', `${base()}/${row!.id}`)).json().data.status).toBe('expired');
  });

  test('past its expiry the archive is deleted and the download refused', async () => {
    const job = (await w.call(w.admin, 'GET', base()))
      .json()
      .data.find((j: { status: string }) => j.status === 'completed');
    const later = new Date(Date.now() + 8 * 86_400_000);
    expect(await w.app.jobHandlers['transfers.sweep'](later)).toBeGreaterThanOrEqual(1);
    expect(archiveOf(job.id)).toBeNull();
    const after = (await w.call(w.admin, 'GET', `${base()}/${job.id}`)).json().data;
    expect(after).toMatchObject({ status: 'expired', download_url: null });
    const res = await w.call(w.admin, 'GET', `${base()}/${job.id}/download`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('export.not_ready');
  });

  test('a queued job whose requester lost the right fails instead of exporting', async () => {
    const row = await exportJobsRepository(w.db).insertPending(w.repos.ctx, (await idOf(w.contributor))!);
    const result = await runQueued(w.app.queuedHandlers, {
      name: 'export.org',
      data: { org_id: w.repos.ctx.orgId, job_id: row!.id },
    });
    expect(result).toBe(0);
    const failed = (await w.call(w.admin, 'GET', `${base()}/${row!.id}`)).json().data;
    expect(failed).toMatchObject({ status: 'failed', error: { code: 'forbidden' } });
  });
});

async function idOf(who: { username: string }): Promise<number | undefined> {
  return (await organizationsRepository(w.db).findMemberByUsername(w.repos.ctx, who.username))?.user.id;
}

describe('who may export', () => {
  test('Org Admins and the Owner; members are refused, strangers see nothing', async () => {
    expect((await request(w.contributor)).statusCode).toBe(403);
    expect((await request(w.projectAdmin)).statusCode).toBe(403);
    expect((await request(w.outsider)).statusCode).toBe(404);
    expect((await w.call(w.contributor, 'GET', base())).statusCode).toBe(403);
  });

  test('a token needs admin:org', async () => {
    const token = (
      await w.call(w.admin, 'POST', '/v1/me/tokens', { name: 'export', scopes: ['issues:read', 'admin:project'] })
    ).json().data.token as string;
    const res = await w.call({ email: '', sid: '', headers: { authorization: `Bearer ${token}` } }, 'GET', base());
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('token.scope_missing');
  });

  test('another organisation’s export is not found', async () => {
    const [job] = (await w.call(w.admin, 'GET', base())).json().data;
    const res = await other.call(other.admin, 'GET', `/v1/organizations/${other.slug}/exports/${job.id}`);
    expect(res.statusCode).toBe(404);
  });
});

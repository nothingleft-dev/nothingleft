import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { attachmentsRepository, organizationsRepository } from '@nothingleft/db';
import { ATTACHMENT_MAX_BYTES, ATTACHMENTS_PER_ISSUE_MAX, FREE_STORAGE_BYTES_DEFAULT } from '@nothingleft/types';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import { memoryStorage } from './memory-storage.ts';
import type { Person } from './people.ts';
import { testApp } from './helpers.ts';

setDefaultTimeout(120_000);

const KEY = 'ATT';
const SHA = Buffer.alloc(32, 7).toString('base64');
const DAY_MS = 86_400_000;

let w: IssueWorld;
let bucket: ReturnType<typeof memoryStorage>;

interface Attachment {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  width: number | null;
  height: number | null;
  issue: string | null;
  comment_id: number | null;
  work_item_id: number | null;
  status: 'pending' | 'ready';
  inline: boolean;
  created_by: { username: string };
  deleted_at: string | null;
  me: { can_delete: boolean };
}

const newIssue = async (extra: object = {}) => {
  const res = await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Checkout times out', ...extra });
  if (res.statusCode !== 201) throw new Error(`issue create failed: ${res.body}`);
  return res.json().data.key as string;
};

const presign = (who: Person, body: object) =>
  w.call(who, 'POST', '/v1/attachments/presign', {
    filename: 'login-bug.png',
    mime: 'image/png',
    size: 1000,
    sha256: SHA,
    ...body,
  });

/** presign → PUT (simulated) → complete, as the browser does it. */
async function upload(who: Person, body: object): Promise<Attachment> {
  const res = await presign(who, body);
  if (res.statusCode !== 201) throw new Error(`presign failed: ${res.body}`);
  const { attachment, upload_url } = res.json().data as { attachment: Attachment; upload_url: string };
  const objectKey = new URL(upload_url).pathname.split('/').slice(2).join('/');
  bucket.upload(objectKey, attachment.size_bytes, SHA);
  const done = await w.call(who, 'POST', `/v1/attachments/${attachment.id}/complete`);
  if (done.statusCode !== 200) throw new Error(`complete failed: ${done.body}`);
  return done.json().data;
}

const list = async (key: string, who: Person = w.admin) =>
  (await w.call(who, 'GET', `/v1/issues/${key}/attachments`)).json().data as Attachment[];

const fetchFile = (who: Person | null, attachment: Attachment, name = attachment.filename) =>
  w.app.inject({
    method: 'GET',
    url: `/files/${attachment.id}/${encodeURIComponent(name)}`,
    headers: who ? who.headers : {},
  });

const history = async (key: string) =>
  (await w.call(w.admin, 'GET', `/v1/issues/${key}/activity?limit=200`)).json().data as {
    kind: string;
    change_group_id: string;
    old_value: Record<string, unknown> | null;
    new_value: Record<string, unknown> | null;
  }[];

const org = async () => (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}`)).json().data;
const setUsed = async (bytes: number) => {
  const orgs = organizationsRepository(w.db);
  const current = (await orgs.findById(w.repos.ctx))!.storage_used_bytes;
  await orgs.adjustStorageUsed(w.repos.ctx, bytes - current);
};

/** Pending uploads from earlier tests hold bytes too, so "free" is measured after them. */
const setFree = async (bytes: number) =>
  setUsed(FREE_STORAGE_BYTES_DEFAULT - (await attachmentsRepository(w.db).reservedBytes(w.repos.ctx)) - bytes);

async function token(who: Person, scopes: string[]): Promise<Person> {
  const res = await w.call(who, 'POST', '/v1/me/tokens', { name: `t-${scopes.join('-')}`, scopes });
  return { email: who.email, sid: '', headers: { authorization: `Bearer ${res.json().data.token}` } };
}

beforeAll(async () => {
  bucket = memoryStorage();
  w = await issueWorld(KEY, { storage: bucket.storage });
});

afterAll(async () => {
  await w.close();
});

describe('upload: presign → PUT → complete', () => {
  test('presign reserves a pending row under the issue key and signs the checksum into the PUT', async () => {
    const key = await newIssue();
    const res = await presign(w.contributor, { issue: key, width: 1280, height: 720 });
    expect(res.statusCode).toBe(201);
    const { attachment, upload_url, upload_headers, expires_in } = res.json().data;
    expect(attachment).toMatchObject({
      filename: 'login-bug.png',
      status: 'pending',
      issue: key,
      width: 1280,
      height: 720,
      comment_id: null,
      inline: false,
      created_by: { username: w.contributor.username },
    });
    expect(attachment.url).toBe(`${attachment.url.split('/files/')[0]}/files/${attachment.id}/login-bug.png`);
    const issueId = await w.repos.issueId(Number(key.split('-')[1]));
    expect(upload_url).toContain(`/api/${w.repos.ctx.orgId}/issues/${issueId}/${attachment.id}`);
    expect(upload_headers).toEqual({ 'Content-Type': 'image/png', 'x-amz-checksum-sha256': SHA });
    expect(expires_in).toBe(900);
    expect(await list(key)).toEqual([]);
  });

  test('complete refuses a missing or mismatched object, then succeeds once and is idempotent', async () => {
    const key = await newIssue();
    const before = (await org()).storage.used_bytes;
    const { attachment, upload_url } = (await presign(w.contributor, { issue: key })).json().data;
    const objectKey = new URL(upload_url).pathname.split('/').slice(2).join('/');

    const missing = await w.call(w.contributor, 'POST', `/v1/attachments/${attachment.id}/complete`);
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe('attachment.upload_missing');

    bucket.upload(objectKey, 999, SHA);
    const short = await w.call(w.contributor, 'POST', `/v1/attachments/${attachment.id}/complete`);
    expect(short.json().error.code).toBe('attachment.upload_mismatch');
    bucket.upload(objectKey, 1000, Buffer.alloc(32, 1).toString('base64'));
    expect((await w.call(w.contributor, 'POST', `/v1/attachments/${attachment.id}/complete`)).json().error.code).toBe(
      'attachment.upload_mismatch',
    );

    const other = await w.call(w.admin, 'POST', `/v1/attachments/${attachment.id}/complete`);
    expect(other.statusCode).toBe(404);

    bucket.upload(objectKey, 1000, SHA);
    const done = await w.call(w.contributor, 'POST', `/v1/attachments/${attachment.id}/complete`);
    expect(done.statusCode).toBe(200);
    expect(done.json().data.status).toBe('ready');
    const again = await w.call(w.contributor, 'POST', `/v1/attachments/${attachment.id}/complete`);
    expect(again.json().data).toEqual(done.json().data);
    expect((await org()).storage.used_bytes).toBe(before + 1000);

    const attached = (await history(key)).filter(h => h.kind === 'attached');
    expect(attached).toHaveLength(1);
    expect(attached[0]!.new_value).toEqual({
      attachment_id: attachment.id,
      filename: 'login-bug.png',
      mime_type: 'image/png',
      size_bytes: 1000,
      comment_id: null,
      work_item_id: null,
    });
    expect((await list(key)).map(a => a.id)).toEqual([attachment.id]);
  });

  test('a file over 100MB is refused before anything is written', async () => {
    const key = await newIssue();
    const res = await presign(w.contributor, { issue: key, size: ATTACHMENT_MAX_BYTES + 1 });
    expect(res.statusCode).toBe(413);
    expect(res.json().error).toMatchObject({ code: 'attachment.too_large', field: 'size' });
  });

  test('an issue holds at most 50, pending uploads included', async () => {
    const key = await newIssue();
    for (let i = 0; i < ATTACHMENTS_PER_ISSUE_MAX; i++) {
      expect((await presign(w.contributor, { issue: key, size: 1 })).statusCode).toBe(201);
    }
    const res = await presign(w.contributor, { issue: key, size: 1 });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('attachment.issue_limit');
  });

  test('the body needs exactly one of issue or project', async () => {
    expect((await presign(w.contributor, {})).statusCode).toBe(400);
    expect((await presign(w.contributor, { issue: 'ATT-1', project: KEY })).statusCode).toBe(400);
    expect((await presign(w.contributor, { project: KEY, comment_id: 1 })).statusCode).toBe(400);
  });
});

describe('permissions (docs/permissions.md § Attachments)', () => {
  test('upload: Contributor and up; an Observer is refused, an outsider cannot see the issue', async () => {
    const key = await newIssue();
    expect((await presign(w.observer, { issue: key })).statusCode).toBe(403);
    expect((await presign(w.outsider, { issue: key })).statusCode).toBe(404);
    for (const who of [w.contributor, w.projectAdmin, w.admin]) {
      expect((await presign(who, { issue: key, size: 1 })).statusCode).toBe(201);
    }
  });

  test('download: every role that can read the issue; nobody else', async () => {
    const key = await newIssue();
    const file = await upload(w.contributor, { issue: key });
    for (const who of [w.observer, w.contributor, w.projectAdmin, w.admin]) {
      expect((await fetchFile(who, file)).statusCode).toBe(302);
      expect((await list(key, who)).map(a => a.id)).toEqual([file.id]);
    }
    expect((await fetchFile(w.outsider, file)).statusCode).toBe(404);
    expect((await w.call(w.outsider, 'GET', `/v1/attachments/${file.id}`)).statusCode).toBe(404);
    expect((await fetchFile(null, file)).statusCode).toBe(401);
  });

  test('delete: own for a Contributor, anyone’s from Project Admin, never an Observer', async () => {
    const key = await newIssue();
    const admins = await upload(w.admin, { issue: key });
    const own = await upload(w.contributor, { issue: key });
    const another = await upload(w.contributor, { issue: key });

    const listed = await list(key, w.contributor);
    expect(listed.find(a => a.id === admins.id)!.me.can_delete).toBe(false);
    expect(listed.find(a => a.id === own.id)!.me.can_delete).toBe(true);
    expect((await list(key, w.observer)).every(a => !a.me.can_delete)).toBe(true);

    expect((await w.call(w.observer, 'DELETE', `/v1/attachments/${own.id}`)).statusCode).toBe(403);
    expect((await w.call(w.contributor, 'DELETE', `/v1/attachments/${admins.id}`)).statusCode).toBe(403);
    expect((await w.call(w.contributor, 'DELETE', `/v1/attachments/${own.id}`)).statusCode).toBe(200);
    expect((await w.call(w.projectAdmin, 'DELETE', `/v1/attachments/${another.id}`)).statusCode).toBe(200);
    expect((await w.call(w.admin, 'DELETE', `/v1/attachments/${admins.id}`)).statusCode).toBe(200);
  });

  test('a token needs issues:write to upload and issues:read to download', async () => {
    const key = await newIssue();
    const reader = await token(w.contributor, ['issues:read']);
    const writer = await token(w.contributor, ['issues:read', 'issues:write']);
    expect((await presign(reader, { issue: key })).statusCode).toBe(403);
    const file = await upload(writer, { issue: key });
    const res = await fetchFile(reader, file);
    expect(res.statusCode).toBe(302);
  });
});

describe('the files route', () => {
  test('302 to a five-minute signed URL, cached privately for four minutes, images inline', async () => {
    const key = await newIssue();
    const file = await upload(w.contributor, { issue: key, filename: 'Login bug é.png' });
    const res = await fetchFile(w.observer, file);
    expect(res.statusCode).toBe(302);
    expect(res.headers['cache-control']).toBe('private, max-age=240');
    const location = new URL(String(res.headers.location));
    expect(location.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(location.searchParams.get('response-content-type')).toBe('image/png');
    expect(location.searchParams.get('response-content-disposition')).toBe(
      `inline; filename="Login bug _.png"; filename*=UTF-8''Login%20bug%20%C3%A9.png`,
    );
    expect(location.pathname).toContain(`/issues/`);
    expect((await fetchFile(w.observer, file, 'anything-else.txt')).statusCode).toBe(302);
  });

  test('SVG, HTML and everything else download rather than render', async () => {
    const key = await newIssue();
    for (const [filename, mime] of [
      ['logo.svg', 'image/svg+xml'],
      ['page.html', 'text/html'],
      ['notes.txt', 'text/plain'],
    ] as const) {
      const file = await upload(w.contributor, { issue: key, filename, mime });
      const location = new URL(String((await fetchFile(w.admin, file)).headers.location));
      expect(location.searchParams.get('response-content-disposition')).toStartWith('attachment;');
    }
    const pdf = await upload(w.contributor, { issue: key, filename: 'spec.pdf', mime: 'application/pdf' });
    const location = new URL(String((await fetchFile(w.admin, pdf)).headers.location));
    expect(location.searchParams.get('response-content-disposition')).toStartWith('inline;');
  });

  test('404 for a deleted file, a deleted issue, someone else’s pending upload and an unknown id', async () => {
    const key = await newIssue();
    const file = await upload(w.contributor, { issue: key });
    const pending = (await presign(w.contributor, { issue: key })).json().data.attachment as Attachment;
    expect((await fetchFile(w.admin, pending)).statusCode).toBe(404);
    expect((await fetchFile(w.contributor, pending)).statusCode).toBe(404);
    expect((await w.call(w.admin, 'GET', `/v1/attachments/${pending.id}`)).statusCode).toBe(404);
    expect((await w.call(w.contributor, 'GET', `/v1/attachments/${pending.id}`)).statusCode).toBe(200);

    await w.call(w.admin, 'DELETE', `/v1/issues/${key}`);
    expect((await fetchFile(w.admin, file)).statusCode).toBe(404);
    await w.call(w.admin, 'POST', `/v1/issues/${key}/restore`);
    expect((await fetchFile(w.admin, file)).statusCode).toBe(302);

    await w.call(w.admin, 'DELETE', `/v1/attachments/${file.id}`);
    expect((await fetchFile(w.admin, file)).statusCode).toBe(404);
    const unknown = { ...file, id: crypto.randomUUID() };
    const res = await fetchFile(w.admin, unknown);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('attachment.not_found');
  });

  test('a token works too: an agent reads Location instead of following it', async () => {
    const key = await newIssue();
    const file = await upload(w.contributor, { issue: key });
    const res = await fetchFile(await token(w.observer, ['issues:read']), file);
    expect(res.statusCode).toBe(302);
    expect(String(res.headers.location)).toStartWith('https://s3.test.local/');
  });
});

describe('listing, inline files and delete', () => {
  test('a file linked from the description or a comment is inline; one from a deleted comment is not', async () => {
    const key = await newIssue();
    const shown = await upload(w.contributor, { issue: key });
    const inComment = await upload(w.contributor, { issue: key });
    const listed = await upload(w.contributor, { issue: key, filename: 'trace.log', mime: 'text/plain' });
    await w.call(w.admin, 'PATCH', `/v1/issues/${key}`, { description_md: `![shot](${shown.url})` });
    const comment = (
      await w.call(w.admin, 'POST', `/v1/issues/${key}/comments`, { body_md: `see ${inComment.url}` })
    ).json().data;

    const byId = new Map((await list(key)).map(a => [a.id, a.inline]));
    expect(byId.get(shown.id)).toBe(true);
    expect(byId.get(inComment.id)).toBe(true);
    expect(byId.get(listed.id)).toBe(false);

    await w.call(w.admin, 'DELETE', `/v1/issues/${key}/comments/${comment.id}`);
    expect((await list(key)).find(a => a.id === inComment.id)!.inline).toBe(false);
  });

  test('delete answers the final state, releases the bytes and records detached', async () => {
    const key = await newIssue();
    const file = await upload(w.contributor, { issue: key });
    const before = (await org()).storage.used_bytes;
    const res = await w.call(w.contributor, 'DELETE', `/v1/attachments/${file.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted_at).not.toBeNull();
    expect(res.json().data.me.can_delete).toBe(false);
    expect((await org()).storage.used_bytes).toBe(before - 1000);
    expect(await list(key)).toEqual([]);
    const detached = (await history(key)).filter(h => h.kind === 'detached');
    expect(detached.map(h => h.old_value?.['attachment_id'])).toEqual([file.id]);
    expect((await w.call(w.contributor, 'DELETE', `/v1/attachments/${file.id}`)).statusCode).toBe(404);
  });

  test('comment and work-item files list under their parent and go with it', async () => {
    const key = await newIssue();
    const comment = (await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, { body_md: 'log' })).json().data;
    const item = (
      await w.call(w.contributor, 'POST', `/v1/issues/${key}/work-items`, {
        records: [{ work_date: '2026-09-21', duration: '1h' }],
      })
    ).json().data[0];
    const onComment = await upload(w.contributor, { issue: key, comment_id: comment.id });
    const onItem = await upload(w.contributor, { issue: key, work_item_id: item.id });
    expect(onComment.comment_id).toBe(comment.id);
    expect(onItem.work_item_id).toBe(item.id);

    const issueDto = (await w.call(w.observer, 'GET', `/v1/issues/${key}`)).json().data;
    expect(issueDto.attachment_count).toBe(2);
    await presign(w.contributor, { issue: key });
    await presign(w.contributor, { project: KEY });
    expect((await w.call(w.admin, 'GET', `/v1/issues/${key}`)).json().data.attachment_count).toBe(2);

    const commentFiles = await w.call(w.admin, 'GET', `/v1/issues/${key}/comments/${comment.id}/attachments`);
    expect(commentFiles.json().data.map((a: Attachment) => a.id)).toEqual([onComment.id]);
    const itemFiles = await w.call(w.admin, 'GET', `/v1/issues/${key}/work-items/${item.id}/attachments`);
    expect(itemFiles.json().data.map((a: Attachment) => a.id)).toEqual([onItem.id]);
    expect((await list(key)).map(a => a.id)).toEqual([onComment.id, onItem.id]);

    const used = (await org()).storage.used_bytes;
    await w.call(w.contributor, 'DELETE', `/v1/issues/${key}/comments/${comment.id}`);
    await w.call(w.contributor, 'DELETE', `/v1/issues/${key}/work-items/${item.id}`);
    expect(await list(key)).toEqual([]);
    expect((await w.call(w.admin, 'GET', `/v1/issues/${key}`)).json().data.attachment_count).toBe(0);
    expect((await org()).storage.used_bytes).toBe(used - 2000);
  });

  test('attaching to someone else’s comment needs the right to edit it', async () => {
    const key = await newIssue();
    const comment = (await w.call(w.admin, 'POST', `/v1/issues/${key}/comments`, { body_md: 'mine' })).json().data;
    expect((await presign(w.contributor, { issue: key, comment_id: comment.id })).statusCode).toBe(403);
    expect((await presign(w.contributor, { issue: key, comment_id: 999_999 })).statusCode).toBe(404);
    expect((await presign(w.projectAdmin, { issue: key, comment_id: comment.id })).statusCode).toBe(201);
  });
});

describe('drafts: uploads from a form whose parent does not exist yet', () => {
  test('a draft belongs to its uploader alone until a create claims it', async () => {
    const draft = await upload(w.contributor, { project: KEY });
    expect(draft.issue).toBeNull();
    expect(draft.me.can_delete).toBe(true);
    expect((await fetchFile(w.contributor, draft)).statusCode).toBe(302);
    expect((await fetchFile(w.admin, draft)).statusCode).toBe(404);
    expect(new URL(String((await fetchFile(w.contributor, draft)).headers.location)).pathname).toContain('/drafts/');

    const res = await w.call(w.contributor, 'POST', '/v1/issues', {
      project: KEY,
      title: 'With a screenshot',
      description_md: `![shot](${draft.url})`,
      attachment_ids: [draft.id],
    });
    expect(res.statusCode).toBe(201);
    const key = res.json().data.key as string;
    const [claimed] = await list(key);
    expect(claimed).toMatchObject({ id: draft.id, issue: key, inline: true });
    expect((await fetchFile(w.admin, draft)).statusCode).toBe(302);

    const rows = await history(key);
    const created = rows.find(h => h.kind === 'created')!;
    const attached = rows.find(h => h.kind === 'attached')!;
    expect(attached.change_group_id).toBe(created.change_group_id);
  });

  test('a claim refuses someone else’s draft, an unknown id, and an upload still in flight', async () => {
    const theirs = await upload(w.admin, { project: KEY });
    const stolen = await w.call(w.contributor, 'POST', '/v1/issues', {
      project: KEY,
      title: 'x',
      attachment_ids: [theirs.id],
    });
    expect(stolen.statusCode).toBe(400);
    expect(stolen.json().error).toMatchObject({ code: 'attachment.not_a_draft', field: 'attachment_ids' });

    const inFlight = (await presign(w.contributor, { project: KEY })).json().data.attachment as Attachment;
    const early = await w.call(w.contributor, 'POST', '/v1/issues', {
      project: KEY,
      title: 'x',
      attachment_ids: [inFlight.id],
    });
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('attachment.upload_incomplete');
  });

  test('comments and work items claim drafts too', async () => {
    const key = await newIssue();
    const forComment = await upload(w.contributor, { project: KEY });
    const comment = await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, {
      body_md: `![x](${forComment.url})`,
      attachment_ids: [forComment.id],
    });
    expect(comment.statusCode).toBe(201);
    const forItem = await upload(w.contributor, { project: KEY });
    const items = await w.call(w.contributor, 'POST', `/v1/issues/${key}/work-items`, {
      records: [{ work_date: '2026-09-21', duration: '1h' }],
      attachment_ids: [forItem.id],
    });
    expect(items.statusCode).toBe(201);

    const listed = await list(key);
    expect(listed.find(a => a.id === forComment.id)!.comment_id).toBe(comment.json().data.id);
    expect(listed.find(a => a.id === forItem.id)!.work_item_id).toBe(items.json().data[0].id);
  });

  test('an Observer cannot upload a draft', async () => {
    expect((await presign(w.observer, { project: KEY })).statusCode).toBe(403);
  });
});

describe('storage quota and the two emails', () => {
  test('the organisation reports usage and level; 95% emails the admins once', async () => {
    await setUsed(FREE_STORAGE_BYTES_DEFAULT * 0.8);
    expect((await org()).storage).toMatchObject({
      limit_bytes: FREE_STORAGE_BYTES_DEFAULT,
      level: 'warning',
      configured: true,
    });

    await setUsed(Math.floor(FREE_STORAGE_BYTES_DEFAULT * 0.95) - 500);
    const key = await newIssue();
    await upload(w.contributor, { issue: key });
    expect((await org()).storage.level).toBe('critical');
    const almost = w.box.sent.filter(m => m.subject === 'email.storage_almost_full.subject');
    expect(almost.map(m => m.to)).toEqual([w.admin.email]);
    await upload(w.contributor, { issue: key });
    expect(w.box.sent.filter(m => m.subject === 'email.storage_almost_full.subject')).toHaveLength(1);
  });

  test('at 100% presign is refused with the two options, and the admins hear about it once', async () => {
    await setFree(10);
    const key = await newIssue();
    const refused = await presign(w.contributor, { issue: key, size: 100 });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('storage.quota_exceeded');
    expect(refused.json().error.message).toContain('Delete files');
    expect(refused.json().error.message).toContain('connect your own storage');
    await presign(w.contributor, { issue: key, size: 100 });
    expect(w.box.sent.filter(m => m.subject === 'email.storage_full.subject').map(m => m.to)).toEqual([w.admin.email]);

    // Pending uploads hold their bytes: two presigns cannot both fit the last free space.
    await setFree(1500);
    expect((await presign(w.contributor, { issue: key, size: 1000 })).statusCode).toBe(201);
    expect((await presign(w.contributor, { issue: key, size: 1000 })).statusCode).toBe(409);
  });

  test('deleting below 95% re-arms the emails', async () => {
    await setFree(5000);
    const key = await newIssue();
    const file = await upload(w.contributor, { issue: key });
    await setUsed(Math.floor(FREE_STORAGE_BYTES_DEFAULT * 0.5));
    await w.call(w.contributor, 'DELETE', `/v1/attachments/${file.id}`);
    const level = (await organizationsRepository(w.db).findById(w.repos.ctx))!.storage_notice_level;
    expect(level).toBe(0);
    await setUsed(0);
  });
});

describe('jobs', () => {
  test('issues.purge deletes every object of a purged issue before its rows, and releases the bytes', async () => {
    await setUsed(0);
    const key = await newIssue();
    const one = await upload(w.contributor, { issue: key });
    const comment = (await w.call(w.contributor, 'POST', `/v1/issues/${key}/comments`, { body_md: 'x' })).json().data;
    const two = await upload(w.contributor, { issue: key, comment_id: comment.id });
    const keys = [one, two].map(a => bucket.objectKeyOf(a.id));
    expect(keys.every(k => bucket.objects.has(k))).toBe(true);
    expect((await org()).storage.used_bytes).toBe(2000);

    await w.call(w.admin, 'DELETE', `/v1/issues/${key}`);
    const id = await w.repos.issueId(Number(key.split('-')[1]));
    await w.repos.issues.update(w.repos.ctx, id, { deleted_at: new Date(Date.now() - 15 * DAY_MS) });
    await w.app.jobHandlers['issues.purge']();

    expect(keys.some(k => bucket.objects.has(k))).toBe(false);
    expect(await attachmentsRepository(w.db).findByPublicId(w.repos.ctx, one.id)).toBeUndefined();
    expect((await org()).storage.used_bytes).toBe(0);
  });

  test('attachments.sweep removes abandoned uploads, stale drafts and deleted files, objects first', async () => {
    const repo = attachmentsRepository(w.db);
    const old = new Date(Date.now() - 3 * DAY_MS);
    const key = await newIssue();
    const issueId = await w.repos.issueId(Number(key.split('-')[1]));
    const kept = await upload(w.contributor, { issue: key });
    const userId = (await repo.findByPublicId(w.repos.ctx, kept.id))!.created_by;
    const row = (over: object) => ({
      public_id: crypto.randomUUID(),
      issue_id: issueId,
      filename: 'x.png',
      mime_type: 'image/png',
      size_bytes: 10,
      checksum: Buffer.alloc(32),
      storage_target: 'platform',
      bucket: 'nl-private-test',
      object_key: `sweep/${crypto.randomUUID()}`,
      created_by: userId,
      ...over,
    });
    const abandoned = await repo.insert(w.repos.ctx, row({ created_at: old }));
    const staleDraft = await repo.insert(w.repos.ctx, row({ issue_id: null, created_at: old, completed_at: old }));
    const deleted = await upload(w.contributor, { issue: key });
    await w.call(w.contributor, 'DELETE', `/v1/attachments/${deleted.id}`);
    for (const r of [abandoned, staleDraft]) bucket.upload(r.object_key, 10);
    await setUsed(2010);

    expect(await w.app.jobHandlers['attachments.sweep']()).toBeGreaterThanOrEqual(3);
    for (const r of [abandoned, staleDraft]) {
      expect(bucket.objects.has(r.object_key)).toBe(false);
      expect(await repo.findByPublicId(w.repos.ctx, r.public_id)).toBeUndefined();
    }
    expect(await repo.findByPublicId(w.repos.ctx, deleted.id)).toBeUndefined();
    expect(bucket.objects.has(bucket.objectKeyOf(deleted.id))).toBe(false);
    expect((await repo.findByPublicId(w.repos.ctx, kept.id))?.completed_at).not.toBeNull();
    // The stale draft had completed, so its 10 bytes come back; the abandoned upload never counted.
    expect((await org()).storage.used_bytes).toBe(2000);
    await setUsed(0);
  });
});

describe('storage not configured', () => {
  test('uploads and downloads answer storage.not_configured; health reports it without degrading', async () => {
    const app = await testApp({ storage: { ...memoryStorage().storage, private: null } });
    try {
      const health = await app.inject({ method: 'GET', url: '/health/deep' });
      expect(health.statusCode).toBe(200);
      expect(health.json().data.checks.storage).toBe('not_configured');
      const organization = await app.inject({
        method: 'GET',
        url: `/v1/organizations/${w.slug}`,
        headers: w.contributor.headers,
      });
      expect(organization.json().data.storage.configured).toBe(false);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/attachments/presign',
        headers: w.contributor.headers,
        body: { project: KEY, filename: 'a.png', mime: 'image/png', size: 1, sha256: SHA },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe('storage.not_configured');
    } finally {
      await app.close();
    }
  });
});

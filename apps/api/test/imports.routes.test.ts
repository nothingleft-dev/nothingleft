import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { importJobsRepository } from '@nothingleft/db';
import { CSV_IMPORT_MAX_ROWS } from '@nothingleft/types';
import { runQueued, type RecordingQueue } from '@lib/jobs';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import { memoryStorage } from './memory-storage.ts';
import type { Person } from './people.ts';

setDefaultTimeout(120_000);

const KEY = 'IMP';
let w: IssueWorld;
let memory: ReturnType<typeof memoryStorage>;

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('base64');
const queue = () => w.app.jobQueue as RecordingQueue;

async function upload(text: string | Uint8Array, who: Person = w.admin, filename = 'issues.csv') {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  const res = await w.call(who, 'POST', `/v1/projects/${KEY}/imports`, {
    filename,
    size: bytes.length,
    sha256: sha(bytes),
  });
  if (res.statusCode !== 201) return { res, id: 0 };
  const { job, upload_url } = res.json().data;
  memory.uploadBytes(upload_url, bytes, sha(bytes));
  return { res, id: job.id as number };
}

const complete = (id: number, who: Person = w.admin) =>
  w.call(who, 'POST', `/v1/projects/${KEY}/imports/${id}/complete`);
const dryRun = (id: number, column_mapping: Record<string, string>, who: Person = w.admin) =>
  w.call(who, 'POST', `/v1/projects/${KEY}/imports/${id}/dry-run`, { column_mapping });
const start = (id: number, column_mapping: Record<string, string>, who: Person = w.admin) =>
  w.call(who, 'POST', `/v1/projects/${KEY}/imports/${id}/start`, { column_mapping });
const status = async (id: number) => (await w.call(w.admin, 'GET', `/v1/projects/${KEY}/imports/${id}`)).json().data;

async function runImports(at?: Date) {
  let created = 0;
  for (let guard = 0; guard < 20 && queue().pending.some(j => j.name === 'import.csv'); guard++) {
    const jobs = queue().pending.filter(j => j.name === 'import.csv');
    queue().pending.splice(0, queue().pending.length, ...queue().pending.filter(j => j.name !== 'import.csv'));
    for (const job of jobs) created += await runQueued(w.app.queuedHandlers, job, at);
  }
  return created;
}

const titles = async () =>
  (await w.call(w.admin, 'GET', `/v1/issues?q=${encodeURIComponent(`project: ${KEY}`)}&limit=200`))
    .json()
    .data.map((i: { title: string }) => i.title) as string[];

beforeAll(async () => {
  memory = memoryStorage();
  w = await issueWorld(KEY, { storage: memory.storage });
  await w.call(w.admin, 'POST', `/v1/projects/${KEY}/custom-fields`, {
    name: 'Severity',
    type: 'select',
    options: [{ name: 'Low' }, { name: 'High' }],
  });
  await w.call(w.admin, 'POST', `/v1/projects/${KEY}/custom-fields`, { name: 'Customer', type: 'text' });
});

afterAll(async () => {
  await w.close();
});

describe('upload and preview', () => {
  test('complete reads the headers and a sample, and suggests a mapping by name', async () => {
    const { res, id } = await upload('Summary,State,Labels,Severity,Notes\r\nFirst,Open,"a, b",High,x\r\n');
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ job: { status: 'awaiting_upload', project: KEY, source: 'csv' } });
    const preview = await complete(id);
    expect(preview.statusCode).toBe(200);
    expect(preview.json().data).toMatchObject({
      job: { status: 'ready', headers: ['Summary', 'State', 'Labels', 'Severity', 'Notes'], total_rows: 1 },
      sample: [['First', 'Open', 'a, b', 'High', 'x']],
      suggested_mapping: { title: 'Summary', status: 'State', tags: 'Labels', 'custom:severity': 'Severity' },
    });
  });

  test('a file over the size limit, one not in UTF-8 and one with too many rows are refused', async () => {
    const big = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/imports`, {
      filename: 'huge.csv',
      size: 20 * 1024 * 1024 + 1,
      sha256: sha(new Uint8Array(1)),
    });
    expect(big.statusCode).toBe(400);
    expect(big.json().error.code).toBe('import.too_large');

    const latin = await upload(new Uint8Array([0x54, 0x69, 0x74, 0x6c, 0x65, 0x0a, 0xe9, 0x0a]));
    expect((await complete(latin.id)).json().error.code).toBe('import.not_utf8');

    const many = await upload(`Title\n${'x\n'.repeat(CSV_IMPORT_MAX_ROWS + 1)}`);
    const refused = await complete(many.id);
    expect(refused.statusCode).toBe(400);
    expect(refused.json().error.code).toBe('import.too_many_rows');
  });

  test('a file that does not match what was announced is refused', async () => {
    const bytes = new TextEncoder().encode('Title\nOne\n');
    const res = await w.call(w.admin, 'POST', `/v1/projects/${KEY}/imports`, {
      filename: 'x.csv',
      size: bytes.length,
      sha256: sha(bytes),
    });
    memory.uploadBytes(res.json().data.upload_url, new TextEncoder().encode('Title\nTwo!\n'), sha(bytes));
    expect((await complete(res.json().data.job.id)).json().error.code).toBe('import.upload_mismatch');
  });
});

describe('mapping and dry run', () => {
  test('the mapping must name the title and real headers and fields', async () => {
    const { id } = await upload('Title,Owner\nOne,x\n');
    await complete(id);
    expect((await dryRun(id, { status: 'Owner' })).json().error.code).toBe('import.title_required');
    const unknown = (await dryRun(id, { title: 'Name' })).json().error;
    expect(unknown).toMatchObject({ code: 'import.unknown_header', valid_values: ['Title', 'Owner'] });
    const field = (await dryRun(id, { title: 'Title', 'custom:nope': 'Owner' })).json().error;
    expect(field.code).toBe('import.unknown_field');
    expect(field.valid_values).toEqual(expect.arrayContaining(['custom:severity', 'custom:customer']));
  });

  test('the dry run reports each bad row with its column and valid values, and writes nothing', async () => {
    const before = (await titles()).length;
    const csv = [
      'Title,Status,Assignee,Due,Points',
      'Good one,Open,,2026-10-20,3',
      'Bad status,Doing,,,',
      ',Open,,,',
      'Bad person,Open,@nobody,,',
      'Bad date,Open,,20/10/2026,',
      'Bad status again,Doing,,,',
    ].join('\n');
    const { id } = await upload(csv);
    await complete(id);
    const res = await dryRun(id, {
      title: 'Title',
      status: 'Status',
      assignees: 'Assignee',
      due_date: 'Due',
      story_points: 'Points',
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data).toMatchObject({ total_rows: 6, valid_rows: 1, failed_rows: 5 });
    expect(
      data.errors.map((e: { row: number; code: string; column: string | null }) => [e.row, e.code, e.column]),
    ).toEqual([
      [3, 'issue.unknown_status', 'Status'],
      [4, 'import.title_missing', 'Title'],
      [5, 'issue.unknown_assignee', 'Assignee'],
      [6, 'import.invalid_value', 'Due'],
      [7, 'issue.unknown_status', 'Status'],
    ]);
    expect(data.errors[0].valid_values).toContain('Open');
    expect(data.unknown_values).toEqual([
      { field: 'status', value: 'Doing', rows: 2 },
      { field: 'assignees', value: '@nobody', rows: 1 },
    ]);
    expect((await titles()).length).toBe(before);
  });
});

describe('the import job', () => {
  test('creates the valid rows, skips and lists the rest, then deletes the file', async () => {
    const csv = [
      'Title,Status,Assignee,Labels,Severity,Customer,Description',
      `Imported one,In Progress,${w.contributor.email},"area:billing, Imported",High,ACME,"Line one\nLine two"`,
      `Imported two,Open,@${w.contributor.username},,,,`,
      'Imported bad,Nope,,,,,',
      `'=SUM(A1),Open,,,,,`,
    ].join('\r\n');
    const { id } = await upload(csv);
    await complete(id);
    const mapping = {
      title: 'Title',
      status: 'Status',
      assignees: 'Assignee',
      tags: 'Labels',
      'custom:severity': 'Severity',
      'custom:customer': 'Customer',
      description: 'Description',
    };
    const res = await start(id, mapping);
    expect(res.statusCode).toBe(202);
    expect(res.json().data).toMatchObject({ status: 'queued', column_mapping: mapping });
    expect((await start(id, mapping)).json().error.code).toBe('import.not_ready');
    const fanoutsBefore = queue().pending.filter(j => j.name === 'notify.fanout').length;

    expect(await runImports()).toBe(3);
    const job = await status(id);
    expect(job).toMatchObject({
      status: 'completed',
      total_rows: 4,
      processed_rows: 4,
      created_issues: 3,
      failed_rows: 1,
      errors: [{ row: 4, column: 'Status', code: 'issue.unknown_status' }],
    });
    expect(job.completed_at).not.toBeNull();
    expect(memory.deleted.some(k => k.startsWith(`api/`) && k.includes(`/import/${id}/`))).toBe(true);
    expect(queue().pending.filter(j => j.name === 'notify.fanout').length).toBe(fanoutsBefore);

    const list = (await w.call(w.admin, 'GET', `/v1/issues?q=${encodeURIComponent('Imported')}&limit=50`)).json()
      .data as { key: string; title: string }[];
    const one = list.find(i => i.title === 'Imported one')!;
    const issue = (await w.call(w.admin, 'GET', `/v1/issues/${one.key}`)).json().data;
    expect(issue).toMatchObject({
      status: { name: 'In Progress' },
      assignees: [{ username: w.contributor.username }],
      description_md: 'Line one\nLine two',
    });
    expect(issue.tags.map((t: { name: string }) => t.name)).toEqual(['area:billing', 'Imported']);
    expect(issue.custom_fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'severity', value: expect.objectContaining({ name: 'High' }) }),
        expect.objectContaining({ slug: 'customer', value: 'ACME' }),
      ]),
    );
    const watchers = (await w.call(w.admin, 'GET', `/v1/issues/${one.key}/watchers`)).json().data;
    expect(watchers.map((x: { username: string }) => x.username)).toEqual([w.contributor.username]);
    const history = (await w.call(w.admin, 'GET', `/v1/issues/${one.key}/activity`)).json().data;
    expect(history.some((h: { kind: string }) => h.kind === 'created')).toBe(true);
    expect(await titles()).toContain('=SUM(A1)');
  });

  test('a run cut short resumes at the first unwritten row', async () => {
    const { id } = await upload('Title\nResume one\nResume two\nResume three\n');
    await complete(id);
    await start(id, { title: 'Title' });
    await importJobsRepository(w.db).update(w.repos.ctx, id, {
      status: 'running',
      processed_rows: 1,
      created_issues: 1,
    });
    expect(await runImports()).toBe(2);
    expect(await status(id)).toMatchObject({ status: 'completed', created_issues: 3, processed_rows: 3 });
    const all = await titles();
    expect(all).toContain('Resume two');
    expect(all).not.toContain('Resume one');
    expect(
      await runQueued(w.app.queuedHandlers, { name: 'import.csv', data: { org_id: w.repos.ctx.orgId, job_id: id } }),
    ).toBe(0);
  });

  test('the list shows the project’s imports, newest first', async () => {
    const res = await w.call(w.admin, 'GET', `/v1/projects/${KEY}/imports`);
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((j: { id: number }) => j.id);
    expect(ids).toEqual([...ids].sort((a: number, b: number) => b - a));
  });

  test('an upload nobody ran is swept after a day; a spent file is deleted', async () => {
    const { id } = await upload('Title\nNever run\n');
    expect(await w.app.jobHandlers['transfers.sweep'](new Date())).toBeGreaterThanOrEqual(0);
    expect((await status(id)).status).toBe('awaiting_upload');
    await w.app.jobHandlers['transfers.sweep'](new Date(Date.now() + 25 * 3_600_000));
    expect((await status(id)).status).toBe('expired');
    expect((await complete(id)).json().error.code).toBe('import.not_ready');
  });
});

describe('who may import', () => {
  test('Project Admins and above; a contributor is refused, a stranger sees nothing', async () => {
    expect((await upload('Title\nA\n', w.projectAdmin)).res.statusCode).toBe(201);
    const contributor = await upload('Title\nA\n', w.contributor);
    expect(contributor.res.statusCode).toBe(403);
    expect((await upload('Title\nA\n', w.observer)).res.statusCode).toBe(403);
    expect((await upload('Title\nA\n', w.outsider)).res.statusCode).toBe(404);
    expect((await w.call(w.contributor, 'GET', `/v1/projects/${KEY}/imports`)).statusCode).toBe(403);
  });

  test('a token needs admin:project', async () => {
    const make = async (scopes: string[]) =>
      (await w.call(w.admin, 'POST', '/v1/me/tokens', { name: `import ${scopes.join(' ')}`, scopes })).json().data
        .token as string;
    const narrow = {
      email: '',
      sid: '',
      headers: { authorization: `Bearer ${await make(['issues:read', 'issues:write'])}` },
    };
    const res = await upload('Title\nA\n', narrow);
    expect(res.res.statusCode).toBe(403);
    expect(res.res.json().error).toMatchObject({ code: 'token.scope_missing' });
    const wide = {
      email: '',
      sid: '',
      headers: { authorization: `Bearer ${await make(['issues:read', 'admin:project'])}` },
    };
    const viaToken = await upload('Title\nA\n', wide);
    expect(viaToken.res.statusCode).toBe(201);
    expect((await complete(viaToken.id, wide)).statusCode).toBe(200);
    expect((await dryRun(viaToken.id, { title: 'Title' }, wide)).json().data).toMatchObject({ valid_rows: 1 });
  });

  test('an archived project takes no imports', async () => {
    await w.call(w.admin, 'POST', '/v1/projects', { name: 'Old', key: 'IMPOLD' });
    await w.call(w.admin, 'POST', '/v1/projects/IMPOLD/archive');
    const bytes = new TextEncoder().encode('Title\nA\n');
    const res = await w.call(w.admin, 'POST', '/v1/projects/IMPOLD/imports', {
      filename: 'a.csv',
      size: bytes.length,
      sha256: sha(bytes),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('project.archived');
  });
});

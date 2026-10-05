import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { projectSchemaRepository, projectsRepository } from '@nothingleft/db';
import { queuedBehind } from './held-transaction.ts';
import { issueWorld, type IssueWorld } from './issue-world.ts';

setDefaultTimeout(120_000);

let w: IssueWorld;
const KEY = 'CFG';
const base = `/v1/projects/${KEY}`;
const names = async (table: string) =>
  ((await w.call(w.admin, 'GET', `${base}/${table}`)).json().data as { name: string }[]).map(r => r.name);

beforeAll(async () => {
  w = await issueWorld(KEY);
});

afterAll(async () => {
  await w.close();
});

describe('the seed', () => {
  test('every project starts with the documented values, readable by an observer', async () => {
    const statuses = await w.call(w.observer, 'GET', `${base}/statuses`);
    expect(statuses.statusCode).toBe(200);
    expect(statuses.json().data[0]).toEqual({
      name: 'Submitted',
      category: 'backlog',
      color: 'gray-1',
      short_label: 'S',
      position: 0,
      is_default: false,
      is_archived: false,
    });
    expect(await names('priorities')).toEqual(['Show-stopper', 'Critical', 'Major', 'Normal', 'Minor']);
    expect(await names('types')).toEqual(['Bug', 'Feature', 'Task', 'Epic']);
    expect(await names('work-types')).toEqual([
      'Development',
      'Documentation',
      'Implementation',
      'Investigation',
      'Maintenance',
      'Observation',
      'Testing',
    ]);
    const [development] = (await w.call(w.observer, 'GET', `${base}/work-types`)).json().data;
    expect(development).toEqual({
      name: 'Development',
      short_label: 'D',
      position: 0,
      is_default: true,
      is_archived: false,
    });
  });
});

describe('managing values', () => {
  test('create, with uniqueness by name regardless of case', async () => {
    const res = await w.call(w.admin, 'POST', `${base}/statuses`, {
      name: 'In Review',
      category: 'started',
      position: 3,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ name: 'In Review', short_label: 'I', color: 'gray-2', position: 3 });
    expect((await names('statuses'))[3]).toBe('In Review');

    const hue = await w.call(w.admin, 'PATCH', `${base}/statuses/In%20Review`, { color: 'red' });
    expect(hue.json().error).toMatchObject({ code: 'validation_failed', field: 'color' });

    const dup = await w.call(w.admin, 'POST', `${base}/statuses`, { name: 'in review', category: 'started' });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('config.name_taken');
    const rename = await w.call(w.admin, 'PATCH', `${base}/statuses/In%20Review`, { name: 'OPEN' });
    expect(rename.json().error.code).toBe('config.name_taken');
  });

  test('exactly one default: choosing another moves it, and it cannot be cleared directly', async () => {
    const res = await w.call(w.admin, 'PATCH', `${base}/priorities/Major`, { is_default: true });
    expect(res.json().data.is_default).toBe(true);
    const all = (await w.call(w.admin, 'GET', `${base}/priorities`)).json().data as {
      name: string;
      is_default: boolean;
    }[];
    expect(all.filter(p => p.is_default).map(p => p.name)).toEqual(['Major']);
    expect((await w.call(w.admin, 'PATCH', `${base}/priorities/Major`, { is_default: false })).statusCode).toBe(400);
    expect(
      (await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Default' })).json().data.priority.name,
    ).toBe('Major');
    await w.call(w.admin, 'PATCH', `${base}/priorities/Normal`, { is_default: true });
  });

  test('the default can be neither archived nor deleted', async () => {
    expect((await w.call(w.admin, 'PATCH', `${base}/statuses/Open`, { is_archived: true })).json().error.code).toBe(
      'config.default_not_archivable',
    );
    expect((await w.call(w.admin, 'DELETE', `${base}/statuses/Open`)).json().error.code).toBe(
      'config.default_not_deletable',
    );
  });

  test('reordering renumbers the siblings', async () => {
    await w.call(w.admin, 'PATCH', `${base}/types/Epic`, { position: 0 });
    const types = (await w.call(w.admin, 'GET', `${base}/types`)).json().data as { name: string; position: number }[];
    expect(types.map(t => [t.name, t.position])).toEqual([
      ['Epic', 0],
      ['Bug', 1],
      ['Feature', 2],
      ['Task', 3],
    ]);
  });

  test('an unknown value lists the known ones', async () => {
    const res = await w.call(w.admin, 'PATCH', `${base}/types/Story`, { color: 'red-3' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatchObject({
      code: 'config.not_found',
      valid_values: ['Epic', 'Bug', 'Feature', 'Task'],
    });
  });
});

describe('deleting a value in use', () => {
  test('needs move_to, then re-points the issues and records it on each', async () => {
    const issue = (
      await w.call(w.admin, 'POST', '/v1/issues', { project: KEY, title: 'Moves', status: 'In Progress' })
    ).json().data;
    const refused = await w.call(w.admin, 'DELETE', `${base}/statuses/In%20Progress`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toMatchObject({ code: 'config.in_use', field: 'move_to' });
    expect(refused.json().error.valid_values).toContain('Fixed');
    expect((await w.call(w.admin, 'DELETE', `${base}/statuses/In%20Progress?move_to=Nowhere`)).json().error.code).toBe(
      'config.move_to_invalid',
    );

    const res = await w.call(w.admin, 'DELETE', `${base}/statuses/In%20Progress?move_to=Fixed`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('In Progress');
    const moved = (await w.call(w.admin, 'GET', `/v1/issues/${issue.key}`)).json().data;
    expect(moved.status.name).toBe('Fixed');
    expect(moved.resolved_at).not.toBeNull();
    const history = (await w.call(w.admin, 'GET', `/v1/issues/${issue.key}/activity`)).json().data;
    expect(history.at(-1)).toMatchObject({
      field: 'status',
      old_value: { name: 'In Progress' },
      new_value: { name: 'Fixed' },
    });
  });

  test('work types have one default, which moves and cannot be deleted', async () => {
    const created = await w.call(w.admin, 'POST', `${base}/work-types`, { name: 'Review', is_default: true });
    expect(created.json().data).toMatchObject({ name: 'Review', short_label: 'R', is_default: true });
    const all = (await w.call(w.admin, 'GET', `${base}/work-types`)).json().data as {
      name: string;
      is_default: boolean;
    }[];
    expect(all.filter(t => t.is_default).map(t => t.name)).toEqual(['Review']);
    expect((await w.call(w.admin, 'DELETE', `${base}/work-types/Review`)).json().error.code).toBe(
      'config.default_not_deletable',
    );
    await w.call(w.admin, 'PATCH', `${base}/work-types/Development`, { is_default: true });
    expect((await w.call(w.admin, 'DELETE', `${base}/work-types/Review`)).statusCode).toBe(200);
  });

  test('an unused value deletes directly and the rest renumber', async () => {
    expect((await w.call(w.admin, 'DELETE', `${base}/work-types/Testing`)).statusCode).toBe(200);
    expect(await names('work-types')).not.toContain('Testing');
  });

  test('every change lands in the audit log as schema_changed', async () => {
    const log = (
      await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/activity?kind=schema_changed&limit=200`)
    ).json().data as { new_value: { table: string; action: string } | null; old_value: { name: string } | null }[];
    expect(log.some(e => e.new_value?.table === 'statuses' && e.new_value.action === 'created')).toBe(true);
    expect(log.some(e => e.old_value?.name === 'In Progress')).toBe(true);
  });
});

describe('permissions', () => {
  test('only a project admin and up manages values', async () => {
    for (const who of [w.contributor, w.observer]) {
      expect((await w.call(who, 'POST', `${base}/priorities`, { name: 'Trivial' })).statusCode).toBe(403);
      expect((await w.call(who, 'PATCH', `${base}/priorities/Minor`, { color: 'red-3' })).statusCode).toBe(403);
      expect((await w.call(who, 'DELETE', `${base}/priorities/Minor`)).statusCode).toBe(403);
    }
    expect(
      (await w.call(w.outsider, 'GET', `${base}/priorities`, undefined, { 'x-organization': w.slug })).statusCode,
    ).toBe(404);
  });
});

describe('names under concurrency', () => {
  test('concurrent creates of one name in any case leave one row; the others hear config.name_taken', async () => {
    const results = await Promise.all(
      ['Triage', 'triage', 'TRIAGE'].map(name => w.call(w.admin, 'POST', `${base}/priorities`, { name })),
    );
    expect(results.filter(r => r.statusCode === 201)).toHaveLength(1);
    for (const r of results.filter(r => r.statusCode !== 201)) {
      expect(r.statusCode).toBe(409);
      expect(r.json().error.code).toBe('config.name_taken');
    }
    expect((await names('priorities')).filter(n => n.toLowerCase() === 'triage')).toHaveLength(1);
  });

  test('renaming a value to a case variant of its own name still works', async () => {
    expect((await w.call(w.admin, 'POST', `${base}/work-types`, { name: 'Pairing' })).statusCode).toBe(201);
    const res = await w.call(w.admin, 'PATCH', `${base}/work-types/Pairing`, { name: 'PAIRING' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('PAIRING');
  });

  test('a name the database folds onto an existing one answers config.name_taken, never a bare conflict', async () => {
    expect((await w.call(w.admin, 'POST', `${base}/work-types`, { name: 'istanbul' })).statusCode).toBe(201);
    const res = await w.call(w.admin, 'POST', `${base}/work-types`, { name: 'İstanbul' });
    if (res.statusCode !== 201) {
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('config.name_taken');
    }
  });

  test('two values created as the default at once leave exactly one default', async () => {
    const results = await Promise.all(
      ['Urgent', 'Someday'].map(name => w.call(w.admin, 'POST', `${base}/priorities`, { name, is_default: true })),
    );
    expect(results.map(r => r.statusCode)).toEqual([201, 201]);
    const all = (await w.call(w.admin, 'GET', `${base}/priorities`)).json().data as { is_default: boolean }[];
    expect(all.filter(p => p.is_default)).toHaveLength(1);
  });

  test('moving the default, and reviving an archived status as the default in one request, still work', async () => {
    const moved = await w.call(w.admin, 'PATCH', `${base}/priorities/Minor`, { is_default: true });
    expect(moved.json().data.is_default).toBe(true);
    expect((await w.call(w.admin, 'PATCH', `${base}/statuses/Obsolete`, { is_archived: true })).statusCode).toBe(200);
    const revived = await w.call(w.admin, 'PATCH', `${base}/statuses/Obsolete`, {
      is_default: true,
      is_archived: false,
    });
    expect(revived.statusCode).toBe(200);
    expect(revived.json().data).toMatchObject({ is_default: true, is_archived: false });
    const statuses = (await w.call(w.admin, 'GET', `${base}/statuses`)).json().data as { is_default: boolean }[];
    expect(statuses.filter(s => s.is_default)).toHaveLength(1);
  });

  test('a default switch that waited on the project leaves exactly one default', async () => {
    const { ctx, projectId } = w.repos;
    const [held, wanted] = (await projectSchemaRepository(w.db).list(ctx, 'priorities', projectId)).filter(
      p => !p.is_default,
    );
    const res = await queuedBehind(
      w,
      async tx => {
        await projectsRepository(tx).lockById(ctx, projectId);
        await projectSchemaRepository(tx).clearDefault(ctx, 'priorities', projectId);
        await projectSchemaRepository(tx).update(ctx, 'priorities', held!.id, { is_default: true });
      },
      () => w.call(w.admin, 'PATCH', `${base}/priorities/${encodeURIComponent(wanted!.name)}`, { is_default: true }),
    );

    expect(res.statusCode).toBe(200);
    const defaults = (await projectSchemaRepository(w.db).list(ctx, 'priorities', projectId)).filter(p => p.is_default);
    expect(defaults.map(p => p.name)).toEqual([wanted!.name]);
  });

  test('an archive that waited on the project is refused once its value became the default', async () => {
    const { ctx, projectId } = w.repos;
    const [target] = (await projectSchemaRepository(w.db).list(ctx, 'work_types', projectId)).filter(
      t => !t.is_default && !t.is_archived,
    );
    const res = await queuedBehind(
      w,
      async tx => {
        await projectsRepository(tx).lockById(ctx, projectId);
        await projectSchemaRepository(tx).clearDefault(ctx, 'work_types', projectId);
        await projectSchemaRepository(tx).update(ctx, 'work_types', target!.id, { is_default: true });
      },
      () => w.call(w.admin, 'PATCH', `${base}/work-types/${encodeURIComponent(target!.name)}`, { is_archived: true }),
    );

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('config.default_not_archivable');
  });
});

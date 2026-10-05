import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { databaseFoldsDottedCapitalI } from './held-transaction.ts';
import { issueWorld, type IssueWorld } from './issue-world.ts';

setDefaultTimeout(120_000);

let w: IssueWorld;
const KEY = 'WA';
const base = `/v1/projects/${KEY}/work-item-attributes`;
let issueKey: string;

beforeAll(async () => {
  w = await issueWorld(KEY);
  issueKey = (await w.call(w.contributor, 'POST', '/v1/issues', { project: KEY, title: 'Timed' })).json().data.key;
});

afterAll(async () => {
  await w.close();
});

const log = (body: object, who = w.contributor) => w.call(who, 'POST', `/v1/issues/${issueKey}/work-items`, body);

describe('managing attributes', () => {
  test('create with values and letter badges; Work type is taken', async () => {
    const res = await w.call(w.admin, 'POST', base, {
      name: 'Billable',
      values: [{ name: 'Yes' }, { name: 'No', short_label: 'n' }],
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data).toEqual({
      name: 'Billable',
      position: 0,
      is_archived: false,
      values: [
        { name: 'Yes', short_label: 'Y', position: 0, is_archived: false },
        { name: 'No', short_label: 'N', position: 1, is_archived: false },
      ],
    });
    expect((await w.call(w.admin, 'POST', base, { name: 'work type' })).json().error.code).toBe(
      'work_item_attribute.name_taken',
    );
    expect((await w.call(w.admin, 'POST', base, { name: 'billable' })).json().error.code).toBe(
      'work_item_attribute.name_taken',
    );
    const value = await w.call(w.admin, 'POST', `${base}/Billable/values`, { name: 'Maybe', position: 1 });
    expect(value.json().data.values.map((v: { name: string }) => v.name)).toEqual(['Yes', 'Maybe', 'No']);
  });

  test('a Contributor reads but cannot manage; an Observer reads', async () => {
    expect((await w.call(w.contributor, 'POST', base, { name: 'Phase' })).statusCode).toBe(403);
    expect((await w.call(w.observer, 'GET', base)).json().data).toHaveLength(1);
    expect((await w.call(w.outsider, 'GET', base)).statusCode).toBe(404);
  });
});

describe('on work items', () => {
  test('logged by name, listed in the entry, snapshotted in history', async () => {
    const res = await log({ records: [{ work_date: '2026-09-21', duration: '1h' }], attributes: { billable: 'yes' } });
    expect(res.statusCode).toBe(201);
    const [item] = res.json().data;
    expect(item.attributes).toEqual([{ attribute: 'Billable', value: { name: 'Yes', short_label: 'Y' } }]);
    const history = (await w.call(w.contributor, 'GET', `/v1/issues/${issueKey}/activity?kind=time_logged`)).json()
      .data;
    expect(history.at(-1).new_value).toMatchObject({ attributes: { Billable: 'Yes' } });

    const changed = await w.call(w.contributor, 'PATCH', `/v1/issues/${issueKey}/work-items/${item.id}`, {
      attributes: { Billable: 'No' },
    });
    expect(changed.json().data.attributes[0].value.name).toBe('No');
    const cleared = await w.call(w.contributor, 'PATCH', `/v1/issues/${issueKey}/work-items/${item.id}`, {
      attributes: { Billable: null },
    });
    expect(cleared.json().data.attributes).toEqual([]);
  });

  test('unknown attributes and values list the choices', async () => {
    const attr = await log({ records: [{ work_date: '2026-09-21', duration: 30 }], attributes: { Phase: 'One' } });
    expect(attr.json().error).toMatchObject({ code: 'work_item_attribute.unknown', valid_values: ['Billable'] });
    const value = await log({
      records: [{ work_date: '2026-09-21', duration: 30 }],
      attributes: { Billable: 'Often' },
    });
    expect(value.json().error).toMatchObject({
      code: 'work_item_attribute.unknown_value',
      valid_values: ['Yes', 'Maybe', 'No'],
    });
  });

  test('deleting a value in use needs move_to; deleting the attribute drops it everywhere', async () => {
    const [item] = (
      await log({ records: [{ work_date: '2026-09-22', duration: '2h' }], attributes: { Billable: 'Maybe' } })
    ).json().data;
    const inUse = await w.call(w.admin, 'DELETE', `${base}/Billable/values/Maybe`);
    expect(inUse.json().error).toMatchObject({ code: 'work_item_attribute.value_in_use', valid_values: ['Yes', 'No'] });
    await w.call(w.admin, 'DELETE', `${base}/Billable/values/Maybe?move_to=Yes`);
    const moved = (await w.call(w.contributor, 'GET', `/v1/issues/${issueKey}/work-items/${item.id}`)).json().data;
    expect(moved.attributes[0].value.name).toBe('Yes');

    const removed = await w.call(w.admin, 'DELETE', `${base}/Billable`);
    expect(removed.json().data.name).toBe('Billable');
    const after = (await w.call(w.contributor, 'GET', `/v1/issues/${issueKey}/work-items/${item.id}`)).json().data;
    expect(after.attributes).toEqual([]);
    expect((await w.call(w.admin, 'GET', base)).json().data).toEqual([]);
  });
});

describe('names under concurrency', () => {
  test('concurrent attributes and values of one name answer the friendly code', async () => {
    const attributes = await Promise.all(['Phase', 'phase'].map(name => w.call(w.admin, 'POST', base, { name })));
    expect(attributes.filter(r => r.statusCode === 201)).toHaveLength(1);
    expect(attributes.find(r => r.statusCode !== 201)!.json().error.code).toBe('work_item_attribute.name_taken');

    const values = await Promise.all(
      ['Design', 'design', 'DESIGN'].map(name => w.call(w.admin, 'POST', `${base}/Phase/values`, { name })),
    );
    expect(values.filter(r => r.statusCode === 201)).toHaveLength(1);
    for (const r of values.filter(r => r.statusCode !== 201)) {
      expect(r.json().error.code).toBe('work_item_attribute.value_name_taken');
    }
  });

  test('values sent with a new attribute that the database folds together answer work_item_attribute.value_name_taken', async () => {
    const res = await w.call(w.admin, 'POST', base, {
      name: 'City',
      values: [{ name: 'istanbul' }, { name: 'İstanbul' }],
    });
    if (await databaseFoldsDottedCapitalI(w)) {
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toMatchObject({ code: 'work_item_attribute.value_name_taken', field: 'values' });
    } else {
      expect(res.statusCode).toBe(201);
    }
  });
});

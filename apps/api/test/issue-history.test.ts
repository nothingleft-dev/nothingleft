import { describe, expect, test } from 'bun:test';
import { tenantContext, type IssueActivityRepository, type IssueActivityRow } from '@nothingleft/db';
import { recordFieldChanges, type FieldChange } from '@services/issue-history';

const ctx = tenantContext(1, 1);
const ALEX = 1;
const SAM = 2;
const MINUTE = 60_000;
const start = new Date('2026-09-24T10:00:00Z');
const at = (minutes: number) => new Date(start.getTime() + minutes * MINUTE);

/** A hand-written store with the repository's semantics — docs/backend-guide.md#testing. */
function history() {
  const rows: IssueActivityRow[] = [];
  let nextId = 1;
  const repo = {
    async record(_c: unknown, input: Partial<IssueActivityRow>) {
      const row = {
        id: nextId++,
        org_id: 1,
        field: null,
        old_value: null,
        new_value: null,
        ...input,
      } as IssueActivityRow;
      rows.push(row);
      return row;
    },
    async latestFieldChange(_c: unknown, _issue: number, field: string) {
      return rows.filter(r => r.kind === 'field_changed' && r.field === field).at(-1);
    },
    async hasCommentAfter(_c: unknown, _issue: number, id: number) {
      return rows.some(r => r.kind === 'commented' && r.id > id);
    },
    async rewrite(_c: unknown, id: number, value: unknown, when: Date) {
      const row = rows.find(r => r.id === id)!;
      Object.assign(row, { new_value: value, updated_at: when });
      return row;
    },
    async erase(_c: unknown, id: number) {
      rows.splice(
        rows.findIndex(r => r.id === id),
        1,
      );
    },
  } as unknown as IssueActivityRepository;

  const change = (actorId: number, minutes: number, fields: FieldChange[]) =>
    recordFieldChanges(repo, { ctx, issueId: 1, actorId, changeGroupId: `g-${minutes}`, at: at(minutes) }, fields);
  const assignee = (from: string[], to: string[]): FieldChange[] => [
    { field: 'assignees', old_value: from, new_value: to },
  ];
  return { rows, change, assignee, repo };
}

describe('coalescing', () => {
  test('A → B → C by one actor inside the window is one row, A → C', async () => {
    const h = history();
    await h.change(ALEX, 0, h.assignee(['a'], ['b']));
    await h.change(ALEX, 1, h.assignee(['b'], ['c']));
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]).toMatchObject({ old_value: ['a'], new_value: ['c'], change_group_id: 'g-0' });
    expect(h.rows[0]!.created_at).toEqual(at(0));
    expect(h.rows[0]!.updated_at).toEqual(at(1));
  });

  test('A → B → A is net zero: the row is deleted', async () => {
    const h = history();
    await h.change(ALEX, 0, h.assignee(['a'], ['b']));
    await h.change(ALEX, 2, h.assignee(['b'], ['a']));
    expect(h.rows).toEqual([]);
  });

  test('the window is fixed from first touch: a change at 5 minutes starts a new row', async () => {
    const h = history();
    await h.change(ALEX, 0, h.assignee(['a'], ['b']));
    await h.change(ALEX, 4, h.assignee(['b'], ['c']));
    await h.change(ALEX, 5, h.assignee(['c'], ['d']));
    expect(h.rows.map(r => r.new_value)).toEqual([['c'], ['d']]);
  });

  test("hard stop: another actor's change to the same field in between", async () => {
    const h = history();
    await h.change(ALEX, 0, h.assignee(['a'], ['b']));
    await h.change(SAM, 1, h.assignee(['b'], ['d']));
    await h.change(ALEX, 2, h.assignee(['d'], ['e']));
    expect(h.rows).toHaveLength(3);
  });

  test('hard stop: a comment in between', async () => {
    const h = history();
    await h.change(ALEX, 0, h.assignee(['a'], ['b']));
    await h.repo.record(ctx, {
      issue_id: 1,
      actor_id: SAM,
      change_group_id: 'c',
      kind: 'commented',
      created_at: at(1),
      updated_at: at(1),
    });
    await h.change(ALEX, 2, h.assignee(['b'], ['c']));
    expect(h.rows.filter(r => r.kind === 'field_changed')).toHaveLength(2);
  });

  test('another actor changing a different field does not stop coalescing', async () => {
    const h = history();
    await h.change(ALEX, 0, [{ field: 'priority', old_value: { name: 'Normal' }, new_value: { name: 'Major' } }]);
    await h.change(SAM, 1, [{ field: 'status', old_value: { name: 'Open' }, new_value: { name: 'Fixed' } }]);
    await h.change(ALEX, 2, [{ field: 'priority', old_value: { name: 'Major' }, new_value: { name: 'Critical' } }]);
    expect(h.rows.map(r => [r.field, r.new_value])).toEqual([
      ['priority', { name: 'Critical' }],
      ['status', { name: 'Fixed' }],
    ]);
  });

  test('a description edit reverted to its text is never erased, only re-touched', async () => {
    const h = history();
    const description: FieldChange[] = [{ field: 'description', old_value: null, new_value: null }];
    await h.change(ALEX, 0, description);
    await h.change(ALEX, 1, description);
    expect(h.rows).toHaveLength(1);
    expect(h.rows[0]!.updated_at).toEqual(at(1));
  });

  test('null to a value and back to null is net zero', async () => {
    const h = history();
    await h.change(ALEX, 0, [{ field: 'estimate', old_value: null, new_value: 240 }]);
    await h.change(ALEX, 1, [{ field: 'estimate', old_value: 240, new_value: null }]);
    expect(h.rows).toEqual([]);
  });
});

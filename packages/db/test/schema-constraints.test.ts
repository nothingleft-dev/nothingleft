import { afterEach, describe, expect, test } from 'bun:test';
import { sql, type SQL } from 'drizzle-orm';
import { attachmentsRepository, type AttachmentInsert } from '../src/repositories/attachments.repository.ts';
import { customFieldsRepository } from '../src/repositories/custom-fields.repository.ts';
import { issuesRepository } from '../src/repositories/issues.repository.ts';
import { oneTimeTokensRepository } from '../src/repositories/one-time-tokens.repository.ts';
import { projectSchemaRepository } from '../src/repositories/project-schema.repository.ts';
import { workItemAttributesRepository } from '../src/repositories/work-item-attributes.repository.ts';
import { schema } from '../src/index.ts';
import type { Queryable } from '../src/client.ts';
import type { TenantContext } from '../src/tenant-context.ts';
import {
  inRolledBackTx,
  insertArticle,
  pgViolation,
  dropCommittedIssueWorld,
  seedCommittedIssueWorld,
  seedIssueWorld,
  sys,
  testDb,
  violationInSavepoint,
  type IssueWorld,
} from './fixtures.ts';

const FK = '23503';
const UNIQUE = '23505';
const CHECK = '23514';
const refusedBy = (code: string, constraint: string) => ({ code, constraint });
const unique = () => Math.random().toString(36).slice(2, 8);
const hash = (s: string) => Buffer.from(new Bun.CryptoHasher('sha256').update(s).digest());
const inADay = () => new Date(Date.now() + 86_400_000);

/** Each statement must be refused by exactly the named constraint; the name rides along so a failure says which. */
async function expectRefusals(tx: Queryable, cases: [constraint: string, code: string, statement: SQL][]) {
  for (const [constraint, code, statement] of cases) {
    expect({ constraint, refused: await violationInSavepoint(tx, sp => sp.execute(statement)) }).toEqual({
      constraint,
      refused: refusedBy(code, constraint),
    });
  }
}

async function boardIn(tx: Queryable, ctx: TenantContext, projectId: number, userId: number) {
  const [board] = await tx
    .insert(schema.boards)
    .values({
      org_id: ctx.orgId,
      project_id: projectId,
      name: `Board ${unique()}`,
      slug: `board-${unique()}`,
      created_by: userId,
    })
    .returning();
  const [column] = await tx
    .insert(schema.board_columns)
    .values({ org_id: ctx.orgId, board_id: board!.id, name: 'To do', position: 0 })
    .returning();
  return { board: board!, column: column! };
}

const draft = (userId: number): AttachmentInsert => ({
  public_id: crypto.randomUUID(),
  issue_id: null,
  filename: 'login-bug.png',
  mime_type: 'image/png',
  size_bytes: 1000,
  checksum: Buffer.alloc(32),
  storage_target: 'platform',
  bucket: 'nl-private',
  object_key: 'api/x',
  created_by: userId,
});

describe('association rows are bound to their project’s organisation', () => {
  test('custom_field_applies_to, board_swimlane_types and board_column_values refuse a foreign org_id', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, orgA, orgB, projectA, alice } = await seedIssueWorld(tx);
      const configs = projectSchemaRepository(tx);
      const field = await customFieldsRepository(tx).insert(ctxA, projectA, {
        name: 'Severity',
        slug: 'severity',
        type: 'select',
        config: {},
        position: 0,
        created_by: alice,
      });
      const [type] = await configs.list(ctxA, 'types', projectA);
      const [status] = await configs.list(ctxA, 'statuses', projectA);
      const { board, column } = await boardIn(tx, ctxA, projectA, alice);
      const appliesTo = { field_id: field.id, type_id: type!.id, project_id: projectA };
      const lane = { board_id: board.id, type_id: type!.id, project_id: projectA };
      const value = { column_id: column.id, board_id: board.id, project_id: projectA, status_id: status!.id };

      expect(
        await violationInSavepoint(tx, sp =>
          sp.insert(schema.custom_field_applies_to).values({ ...appliesTo, org_id: orgB }),
        ),
      ).toEqual(refusedBy(FK, 'custom_field_applies_to_project_org_fk'));
      expect(
        await violationInSavepoint(tx, sp => sp.insert(schema.board_swimlane_types).values({ ...lane, org_id: orgB })),
      ).toEqual(refusedBy(FK, 'board_swimlane_types_project_org_fk'));
      expect(
        await violationInSavepoint(tx, sp => sp.insert(schema.board_column_values).values({ ...value, org_id: orgB })),
      ).toEqual(refusedBy(FK, 'board_column_values_project_org_fk'));

      await tx.insert(schema.custom_field_applies_to).values({ ...appliesTo, org_id: orgA });
      await tx.insert(schema.board_swimlane_types).values({ ...lane, org_id: orgA });
      await tx.insert(schema.board_column_values).values({ ...value, org_id: orgA });
    });
  });
});

describe('names are unique in their scope, whatever the case', () => {
  let committed: IssueWorld | undefined;
  afterEach(async () => {
    if (committed) await dropCommittedIssueWorld(committed);
    committed = undefined;
  });

  test('each configuration table refuses a name that differs only in case', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, projectA } = await seedIssueWorld(tx);
      const cases = [
        ['statuses', 'workflow_statuses', { category: 'started', color: 'gray-2', is_archived: false }],
        ['priorities', 'priorities', { color: 'gray-2' }],
        ['types', 'issue_types', { color: 'gray-2', icon: null }],
        ['work_types', 'work_types', { is_archived: false }],
      ] as const;
      for (const [table, sqlName, extra] of cases) {
        const row = { short_label: 'R', position: 50, is_default: false, ...extra };
        await projectSchemaRepository(tx).insert(ctxA, table, projectA, { name: 'Review', ...row } as never);
        expect(
          await violationInSavepoint(tx, sp =>
            projectSchemaRepository(sp).insert(ctxA, table, projectA, { name: 'REVIEW', ...row } as never),
          ),
        ).toEqual(refusedBy(UNIQUE, `${sqlName}_project_lower_name_unique`));
      }
    });
  });

  test('custom fields and their options, attributes and their values, sprints and boards', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, orgA, projectA, alice } = await seedIssueWorld(tx);
      const fields = customFieldsRepository(tx);
      const attributes = workItemAttributesRepository(tx);
      const field = await fields.insert(ctxA, projectA, {
        name: 'Severity',
        slug: 'severity',
        type: 'select',
        config: {},
        position: 0,
        created_by: alice,
      });
      await fields.insertOptions(ctxA, field.id, [{ name: 'High', color: 'gray-2', position: 0 }]);
      const attribute = await attributes.insert(ctxA, projectA, { name: 'Billable', position: 0 });
      await attributes.insertValues(ctxA, attribute.id, [{ name: 'Yes', short_label: 'Y', position: 0 }]);
      await tx
        .insert(schema.sprints)
        .values({ org_id: orgA, project_id: projectA, name: 'Hotfix', slug: 'hotfix', created_by: alice });
      await tx
        .insert(schema.boards)
        .values({ org_id: orgA, project_id: projectA, name: 'Ops', slug: `ops-${unique()}`, created_by: alice });

      const cases: [string, (sp: Queryable) => Promise<unknown>][] = [
        [
          'custom_fields_project_lower_name_unique',
          sp =>
            customFieldsRepository(sp).insert(ctxA, projectA, {
              name: 'SEVERITY',
              slug: 'severity-2',
              type: 'text',
              config: {},
              position: 1,
              created_by: alice,
            }),
        ],
        [
          'custom_field_options_field_lower_name_unique',
          sp =>
            customFieldsRepository(sp).insertOptions(ctxA, field.id, [{ name: 'high', color: 'gray-2', position: 1 }]),
        ],
        [
          'work_item_attributes_project_lower_name_unique',
          sp => workItemAttributesRepository(sp).insert(ctxA, projectA, { name: 'BILLABLE', position: 1 }),
        ],
        [
          'work_item_attribute_values_attribute_lower_name_unique',
          sp =>
            workItemAttributesRepository(sp).insertValues(ctxA, attribute.id, [
              { name: 'yes', short_label: 'Y', position: 1 },
            ]),
        ],
        [
          'sprints_project_lower_name_unique',
          sp =>
            sp
              .insert(schema.sprints)
              .values({ org_id: orgA, project_id: projectA, name: 'HOTFIX', slug: 'hotfix-2', created_by: alice }),
        ],
        [
          'boards_project_lower_name_unique',
          sp =>
            sp
              .insert(schema.boards)
              .values({ org_id: orgA, project_id: projectA, name: 'ops', slug: `ops-${unique()}`, created_by: alice }),
        ],
      ];
      for (const [constraint, write] of cases) {
        expect({ constraint, refused: await violationInSavepoint(tx, write) }).toEqual({
          constraint,
          refused: refusedBy(UNIQUE, constraint),
        });
      }
    });
  });

  test('two transactions creating one name in different case: one commits, the other is refused', async () => {
    committed = await seedCommittedIssueWorld();
    const { ctxA, projectA } = committed;
    const create = (name: string) =>
      testDb().db.transaction(async tx => {
        await projectSchemaRepository(tx).insert(ctxA, 'work_types', projectA, {
          name,
          short_label: 'R',
          position: 9,
          is_default: false,
          is_archived: false,
        });
        await tx.execute(sql`select pg_sleep(0.2)`);
      });
    const results = await Promise.allSettled([create('Review'), create('review')]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const refused = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(pgViolation(refused?.reason)).toEqual(refusedBy(UNIQUE, 'work_types_project_lower_name_unique'));
  });
});

describe('at most one default per project, never an archived one', () => {
  test('a second default and an archived default are refused; clearing then setting is not', async () => {
    await inRolledBackTx(async tx => {
      const { projectA } = await seedIssueWorld(tx);
      const others = [
        ['workflow_statuses', 'Closed'],
        ['priorities', 'Minor'],
        ['issue_types', 'Task'],
        ['work_types', 'Testing'],
      ] as const;
      for (const [table, other] of others) {
        const t = sql.identifier(table);
        await expectRefusals(tx, [
          [
            `${table}_one_default_per_project`,
            UNIQUE,
            sql`update ${t} set is_default = true where project_id = ${projectA} and name = ${other}`,
          ],
        ]);
        await tx.execute(sql`update ${t} set is_default = false where project_id = ${projectA}`);
        await tx.execute(sql`update ${t} set is_default = true where project_id = ${projectA} and name = ${other}`);
      }
      for (const table of ['workflow_statuses', 'work_types'] as const) {
        await expectRefusals(tx, [
          [
            `${table}_default_not_archived`,
            CHECK,
            sql`update ${sql.identifier(table)} set is_archived = true where project_id = ${projectA} and is_default`,
          ],
        ]);
      }
    });
  });
});

describe('one open ownership transfer per organisation', () => {
  test('a second unused transfer is refused; a consumed one no longer counts', async () => {
    await inRolledBackTx(async tx => {
      const tokens = oneTimeTokensRepository(tx);
      const { alice, bob, orgA } = await seedIssueWorld(tx);
      const transfer = () => ({
        user_id: bob,
        purpose: 'ownership_transfer',
        token_hash: hash(unique()),
        org_id: orgA,
        created_by: alice,
        expires_at: inADay(),
      });
      const first = await tokens.create(sys, transfer());
      expect(await violationInSavepoint(tx, sp => oneTimeTokensRepository(sp).create(sys, transfer()))).toEqual(
        refusedBy(UNIQUE, 'one_time_tokens_one_open_transfer_per_org'),
      );
      await tokens.consume(sys, first.id);
      await tokens.create(sys, transfer());
    });
  });
});

describe('one mention per source and user', () => {
  test('a duplicate row is refused; replacing a source’s mentions, duplicates and all, still works', async () => {
    await inRolledBackTx(async tx => {
      const issues = issuesRepository(tx);
      const { ctxA, orgA, alice, issueA } = await seedIssueWorld(tx);
      const source = { type: 'issue' as const, id: issueA.id, issueId: issueA.id };
      await issues.replaceMentions(ctxA, source, [alice, alice]);
      expect(await issues.listMentionedUserIds(ctxA, source)).toEqual([alice]);
      expect(
        await violationInSavepoint(tx, sp =>
          sp.insert(schema.mentions).values({
            org_id: orgA,
            source_type: 'issue',
            source_id: issueA.id,
            mentioned_user_id: alice,
            issue_id: issueA.id,
          }),
        ),
      ).toEqual(refusedBy(UNIQUE, 'mentions_source_user_unique'));
      await issues.replaceMentions(ctxA, source, [alice]);
      expect(await issues.listMentionedUserIds(ctxA, source)).toEqual([alice]);
    });
  });
});

describe('rows agree with themselves', () => {
  test('saved views, one-time tokens, boards and project time fields', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, orgA, projectA, alice, bob } = await seedIssueWorld(tx);
      const field = await customFieldsRepository(tx).insert(ctxA, projectA, {
        name: 'Effort',
        slug: 'effort',
        type: 'duration',
        config: {},
        position: 0,
        created_by: alice,
      });
      const view = (projectId: number | null) =>
        sql`insert into saved_views (org_id, owner_id, project_id, name, query, query_ast, sort, columns, visibility, position)
            values (${orgA}, ${alice}, ${projectId}, 'Mine', '', '{}'::jsonb, '[]'::jsonb, '{}'::text[], 'project', 0)`;
      const board = (by: string, field: string | null) =>
        sql`insert into boards (org_id, project_id, name, slug, swimlane_by, swimlane_field, created_by)
            values (${orgA}, ${projectA}, ${`Lanes ${unique()}`}, ${`lanes-${unique()}`}, ${by}, ${field}, ${alice})`;
      await expectRefusals(tx, [
        ['saved_views_project_visibility_check', CHECK, view(null)],
        [
          'one_time_tokens_transfer_fields_check',
          CHECK,
          sql`insert into one_time_tokens (user_id, purpose, token_hash, expires_at)
              values (${bob}, 'ownership_transfer', ${hash(unique())}, now() + interval '1 day')`,
        ],
        [
          'one_time_tokens_email_change_check',
          CHECK,
          sql`insert into one_time_tokens (user_id, purpose, token_hash, expires_at)
              values (${alice}, 'email_change', ${hash(unique())}, now() + interval '1 day')`,
        ],
        ['boards_swimlane_field_mode_check', CHECK, board('values', null)],
        ['boards_swimlane_field_mode_check', CHECK, board('none', 'assignee')],
        ['boards_swimlane_field_mode_check', CHECK, board('issues', 'type')],
        [
          'projects_time_fields_distinct_check',
          CHECK,
          sql`update projects set estimation_field_id = ${field.id}, spent_time_field_id = ${field.id} where id = ${projectA}`,
        ],
      ]);
      await tx.execute(view(projectA));
      await tx.execute(board('values', 'assignee'));
      await tx.execute(board('issues', null));
    });
  });

  test('an attachment’s parents fit together, and a draft names none', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, orgA, alice, issueA, projectA } = await seedIssueWorld(tx);
      const article = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Guide' });
      const [comment] = await tx
        .insert(schema.comments)
        .values({ org_id: orgA, issue_id: issueA.id, author_id: alice, body_md: 'Seen' })
        .returning();
      const [item] = await tx
        .insert(schema.work_items)
        .values({
          org_id: orgA,
          project_id: projectA,
          issue_id: issueA.id,
          author_id: alice,
          created_by: alice,
          work_date: '2026-10-01',
          duration_minutes: 30,
          description_md: '',
        })
        .returning();
      const file = await attachmentsRepository(tx).insert(ctxA, draft(alice));
      const shape = 'attachments_parent_shape_check';
      await expectRefusals(tx, [
        [
          shape,
          CHECK,
          sql`update attachments set issue_id = ${issueA.id}, article_id = ${article.id} where id = ${file.id}`,
        ],
        [shape, CHECK, sql`update attachments set work_item_id = ${item!.id} where id = ${file.id}`],
        [shape, CHECK, sql`update attachments set comment_id = ${comment!.id} where id = ${file.id}`],
      ]);
      await tx.execute(
        sql`update attachments set issue_id = ${issueA.id}, comment_id = ${comment!.id} where id = ${file.id}`,
      );
      await tx.execute(sql`update attachments set comment_id = null, work_item_id = ${item!.id} where id = ${file.id}`);
    });
  });
});

describe('numbers and dates stay in range', () => {
  test('each CHECK refuses the first value outside it and accepts its boundary', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, orgA, projectA, alice, issueA } = await seedIssueWorld(tx);
      const { column } = await boardIn(tx, ctxA, projectA, alice);
      const [sprint] = await tx
        .insert(schema.sprints)
        .values({ org_id: orgA, project_id: projectA, name: 'S1', slug: 's1', created_by: alice })
        .returning();
      await tx.insert(schema.sprint_snapshots).values({
        sprint_id: sprint!.id,
        org_id: orgA,
        snapshot_date: '2026-10-01',
        total_points: 5,
        completed_points: 3,
        total_issues: 2,
        completed_issues: 1,
        remaining_estimate_minutes: 60,
        total_estimate_minutes: 120,
      });
      const [item] = await tx
        .insert(schema.work_items)
        .values({
          org_id: orgA,
          project_id: projectA,
          issue_id: issueA.id,
          author_id: alice,
          created_by: alice,
          work_date: '2026-10-01',
          duration_minutes: 30,
          description_md: '',
        })
        .returning();
      const file = await attachmentsRepository(tx).insert(ctxA, draft(alice));
      const article = await insertArticle(tx, ctxA, { project_id: projectA, created_by: alice, title: 'Guide' });
      const issue = sql`where id = ${issueA.id}`;
      const snap = sql`where sprint_id = ${sprint!.id}`;

      await expectRefusals(tx, [
        ['issues_estimate_minutes_check', CHECK, sql`update issues set estimate_minutes = -1 ${issue}`],
        ['issues_spent_minutes_check', CHECK, sql`update issues set spent_minutes = -1 ${issue}`],
        ['issues_story_points_check', CHECK, sql`update issues set story_points = 1000 ${issue}`],
        ['issues_story_points_check', CHECK, sql`update issues set story_points = -1 ${issue}`],
        ['issues_vote_count_check', CHECK, sql`update issues set vote_count = -1 ${issue}`],
        ['issues_comment_count_check', CHECK, sql`update issues set comment_count = -1 ${issue}`],
        ['issues_parent_id_check', CHECK, sql`update issues set parent_id = id ${issue}`],
        [
          'issues_start_date_check',
          CHECK,
          sql`update issues set start_date = '2026-10-02', due_date = '2026-10-01' ${issue}`,
        ],
        [
          'work_items_duration_minutes_check',
          CHECK,
          sql`update work_items set duration_minutes = 0 where id = ${item!.id}`,
        ],
        [
          'organizations_workday_minutes_check',
          CHECK,
          sql`update organizations set workday_minutes = 0 where id = ${orgA}`,
        ],
        [
          'organizations_workday_minutes_check',
          CHECK,
          sql`update organizations set workday_minutes = 1441 where id = ${orgA}`,
        ],
        [
          'organizations_workweek_days_check',
          CHECK,
          sql`update organizations set workweek_days = 0 where id = ${orgA}`,
        ],
        [
          'organizations_workweek_days_check',
          CHECK,
          sql`update organizations set workweek_days = 8 where id = ${orgA}`,
        ],
        [
          'organizations_storage_used_bytes_check',
          CHECK,
          sql`update organizations set storage_used_bytes = -1 where id = ${orgA}`,
        ],
        ['projects_issue_counter_check', CHECK, sql`update projects set issue_counter = -1 where id = ${projectA}`],
        ['board_columns_wip_min_check', CHECK, sql`update board_columns set wip_min = 0 where id = ${column.id}`],
        ['board_columns_wip_max_check', CHECK, sql`update board_columns set wip_max = 1000 where id = ${column.id}`],
        [
          'board_columns_wip_order_check',
          CHECK,
          sql`update board_columns set wip_min = 5, wip_max = 3 where id = ${column.id}`,
        ],
        [
          'sprints_start_date_check',
          CHECK,
          sql`update sprints set start_date = '2026-10-15', end_date = '2026-10-01' where id = ${sprint!.id}`,
        ],
        [
          'sprint_snapshots_completed_points_check',
          CHECK,
          sql`update sprint_snapshots set completed_points = 6 ${snap}`,
        ],
        [
          'sprint_snapshots_completed_issues_check',
          CHECK,
          sql`update sprint_snapshots set completed_issues = 3 ${snap}`,
        ],
        [
          'sprint_snapshots_remaining_estimate_minutes_check',
          CHECK,
          sql`update sprint_snapshots set remaining_estimate_minutes = -1 ${snap}`,
        ],
        [
          'sprint_snapshots_total_estimate_minutes_check',
          CHECK,
          sql`update sprint_snapshots set total_estimate_minutes = -1 ${snap}`,
        ],
        [
          'issue_links_from_issue_id_check',
          CHECK,
          sql`insert into issue_links (org_id, from_issue_id, to_issue_id, type, created_by)
              values (${orgA}, ${issueA.id}, ${issueA.id}, 'relates', ${alice})`,
        ],
        ['attachments_size_bytes_check', CHECK, sql`update attachments set size_bytes = -1 where id = ${file.id}`],
        ['attachments_width_check', CHECK, sql`update attachments set width = 0 where id = ${file.id}`],
        ['attachments_height_check', CHECK, sql`update attachments set height = 0 where id = ${file.id}`],
        ['articles_parent_id_check', CHECK, sql`update articles set parent_id = id where id = ${article.id}`],
      ]);

      for (const statement of [
        sql`update issues set estimate_minutes = 0, spent_minutes = 0, story_points = 999,
            start_date = '2026-10-01', due_date = '2026-10-01' ${issue}`,
        sql`update issues set story_points = 0 ${issue}`,
        sql`update work_items set duration_minutes = 1 where id = ${item!.id}`,
        sql`update organizations set workday_minutes = 1440, workweek_days = 7 where id = ${orgA}`,
        sql`update organizations set workday_minutes = 1, workweek_days = 1, storage_used_bytes = 0 where id = ${orgA}`,
        sql`update board_columns set wip_min = 1, wip_max = 999 where id = ${column.id}`,
        sql`update board_columns set wip_min = 7, wip_max = 7 where id = ${column.id}`,
        sql`update sprints set start_date = '2026-10-01', end_date = '2026-10-01' where id = ${sprint!.id}`,
        sql`update sprint_snapshots set completed_points = 5, completed_issues = 2, total_estimate_minutes = null ${snap}`,
        sql`update attachments set size_bytes = 0, width = 1, height = 1 where id = ${file.id}`,
      ]) {
        await tx.execute(statement);
      }
    });
  });

  test('a snapshot row with a negative count, or more completed than total, is refused', async () => {
    await inRolledBackTx(async tx => {
      const { orgA, projectA, alice } = await seedIssueWorld(tx);
      const [sprint] = await tx
        .insert(schema.sprints)
        .values({ org_id: orgA, project_id: projectA, name: 'S1', slug: 's1', created_by: alice })
        .returning();
      const row = (
        day: number,
        over: Partial<Record<'total_points' | 'completed_points' | 'total_issues' | 'completed_issues', number>>,
      ) =>
        sql`insert into sprint_snapshots (sprint_id, org_id, snapshot_date, total_points, completed_points,
              total_issues, completed_issues, remaining_estimate_minutes, total_estimate_minutes)
            values (${sprint!.id}, ${orgA}, ${`2026-10-${String(day).padStart(2, '0')}`},
              ${over.total_points ?? 5}, ${over.completed_points ?? 3},
              ${over.total_issues ?? 2}, ${over.completed_issues ?? 1}, 60, 120)`;
      await expectRefusals(tx, [
        ['sprint_snapshots_completed_points_check', CHECK, row(1, { completed_points: -1 })],
        ['sprint_snapshots_completed_issues_check', CHECK, row(2, { completed_issues: -1 })],
      ]);
      // A negative total also breaks completed <= total, and PostgreSQL reports CHECKs in name order,
      // so the shadowing constraint is dropped inside the savepoint to see the total's own refusal.
      for (const [constraint, shadow, over] of [
        [
          'sprint_snapshots_total_points_check',
          'sprint_snapshots_completed_points_check',
          { total_points: -1, completed_points: 0 },
        ],
        [
          'sprint_snapshots_total_issues_check',
          'sprint_snapshots_completed_issues_check',
          { total_issues: -1, completed_issues: 0 },
        ],
      ] as const) {
        const refused = await violationInSavepoint(tx, async sp => {
          await sp.execute(sql`alter table sprint_snapshots drop constraint ${sql.identifier(shadow)}`);
          await sp.execute(row(3, over));
        });
        expect({ constraint, refused }).toEqual({ constraint, refused: refusedBy(CHECK, constraint) });
      }
      await tx.execute(row(4, { total_points: 0, completed_points: 0, total_issues: 0, completed_issues: 0 }));
    });
  });
});

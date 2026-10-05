import { ACTIVITY_COALESCE_WINDOW_MS, type IssueActivityKind } from '@nothingleft/types';
import type { IssueActivityRepository, TenantContext } from '@nothingleft/db';
import { recordIssueTouched } from '@services/notify-outbox';

export interface FieldChange {
  field: string;
  old_value: unknown;
  new_value: unknown;
  /** The snapshot carries no value (a markdown field), so it cannot prove a net-zero edit. */
  valueless?: boolean;
}

export interface ChangeContext {
  ctx: TenantContext;
  issueId: number;
  actorId: number;
  changeGroupId: string;
  at: Date;
}

// Fields whose snapshot carries no value cannot prove a net-zero edit, so they never erase.
const VALUELESS_FIELDS = new Set(['description']);

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Coalescing, at write time — docs/data-model.md#coalescing--collapse-to-net-effect.
 * The caller holds the issue row lock, so the history read here is settled.
 */
export async function recordFieldChanges(
  activity: IssueActivityRepository,
  change: ChangeContext,
  fields: FieldChange[],
): Promise<void> {
  const { ctx, issueId, actorId, changeGroupId, at } = change;
  if (fields.length > 0) recordIssueTouched(ctx.orgId, issueId, at);
  for (const f of fields) {
    const latest = await activity.latestFieldChange(ctx, issueId, f.field);
    const coalescable =
      latest !== undefined &&
      latest.actor_id === actorId &&
      at.getTime() - latest.created_at.getTime() < ACTIVITY_COALESCE_WINDOW_MS &&
      !(await activity.hasCommentAfter(ctx, issueId, latest.id));

    if (!coalescable) {
      await activity.record(ctx, {
        issue_id: issueId,
        actor_id: actorId,
        change_group_id: changeGroupId,
        kind: 'field_changed',
        field: f.field,
        old_value: f.old_value,
        new_value: f.new_value,
        created_at: at,
        updated_at: at,
      });
    } else if (!f.valueless && !VALUELESS_FIELDS.has(f.field) && sameValue(latest.old_value, f.new_value)) {
      await activity.erase(ctx, latest.id);
    } else {
      await activity.rewrite(ctx, latest.id, f.new_value, at);
    }
  }
}

/** Every row that is not a field change: these never coalesce, and a `commented` row is hard stop 1. */
export async function recordIssueEvent(
  activity: IssueActivityRepository,
  change: ChangeContext,
  kind: Exclude<IssueActivityKind, 'field_changed'>,
  values: { old_value?: unknown; new_value?: unknown } = {},
): Promise<void> {
  recordIssueTouched(change.ctx.orgId, change.issueId, change.at);
  await activity.record(change.ctx, {
    issue_id: change.issueId,
    actor_id: change.actorId,
    change_group_id: change.changeGroupId,
    kind,
    old_value: values.old_value ?? null,
    new_value: values.new_value ?? null,
    created_at: change.at,
    updated_at: change.at,
  });
}

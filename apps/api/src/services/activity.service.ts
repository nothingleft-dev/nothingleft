import type { OrgActivity, OrgActivityKind, Pagination, Principal } from '@nothingleft/types';
import type { OrganizationsRepository, OrgActivityRepository, OrgActivityWithActor } from '@nothingleft/db';
import { csvCell } from '@lib/csv';
import { AppError } from '@lib/errors';
import { ACTIVITY_EXPORT_MAX_ROWS, ACTIVITY_EXPORT_PAGE_SIZE } from '@config/constants';
import type { AccessService, OrgAccess } from '@services/access';

export interface ActivityDeps {
  activity: OrgActivityRepository;
  organizations: OrganizationsRepository;
  access: AccessService;
}

export interface ActivityQuery {
  /** `@username`; removed members still resolve, because the audit trail is the point. */
  actor?: string | undefined;
  kinds?: OrgActivityKind[] | undefined;
  /** Calendar dates in UTC: `from` inclusive, `to` inclusive of the whole day. */
  from?: string | undefined;
  to?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}

const CSV_COLUMNS = [
  'id',
  'created_at',
  'kind',
  'actor',
  'target_type',
  'target_id',
  'old_value',
  'new_value',
  'ip',
] as const;

const encodeCursor = (beforeId: number) => Buffer.from(JSON.stringify({ before: beforeId })).toString('base64url');

function decodeCursor(cursor: string): number {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { before?: unknown };
    if (typeof parsed.before === 'number' && Number.isInteger(parsed.before) && parsed.before > 0) return parsed.before;
  } catch {
    // fall through to the catalogue error
  }
  throw new AppError('activity.invalid_cursor', 400, {}, 'cursor');
}

export function activityService({ activity, organizations, access }: ActivityDeps) {
  const toDto = (row: OrgActivityWithActor): OrgActivity => ({
    id: row.activity.id,
    kind: row.activity.kind as OrgActivityKind,
    actor: row.actor
      ? {
          username: row.actor_membership?.username ?? null,
          name: row.actor.name,
          avatar_url: access.avatarUrl(row.actor),
          former_member: row.actor_membership === null || row.actor_membership.removed_at !== null,
          deactivated: row.actor.deactivated_at !== null || row.actor.deleted_at !== null,
        }
      : null,
    target_type: row.activity.target_type,
    target_id: row.activity.target_id,
    old_value: row.activity.old_value ?? null,
    new_value: row.activity.new_value ?? null,
    ip: row.activity.ip,
    created_at: row.activity.created_at.toISOString(),
  });

  async function filterFor(org: OrgAccess, query: Omit<ActivityQuery, 'cursor' | 'limit'>) {
    let actorId: number | undefined;
    if (query.actor) {
      const actor = await organizations.findMemberByUsername(org.ctx, query.actor.replace(/^@/, ''), {
        includeRemoved: true,
      });
      if (!actor) throw new AppError('member.not_found', 404, { username: query.actor }, 'actor');
      actorId = actor.user.id;
    }
    const from = query.from ? new Date(`${query.from}T00:00:00Z`) : undefined;
    const to = query.to ? new Date(Date.parse(`${query.to}T00:00:00Z`) + 86_400_000) : undefined;
    return { actorId, kinds: query.kinds, from, to };
  }

  async function auditable(principal: Principal, slug: string): Promise<OrgAccess> {
    const org = await access.org(principal, slug);
    access.require(principal, 'org.audit.read', org.scope);
    return org;
  }

  return {
    async list(
      principal: Principal,
      slug: string,
      query: ActivityQuery,
    ): Promise<{ data: OrgActivity[]; pagination: Pagination }> {
      const org = await auditable(principal, slug);
      const filter = await filterFor(org, query);
      const beforeId = query.cursor ? decodeCursor(query.cursor) : undefined;
      const [rows, total] = await Promise.all([
        activity.list(org.ctx, { ...filter, beforeId, limit: query.limit + 1 }),
        activity.count(org.ctx, filter),
      ]);
      const page = rows.slice(0, query.limit);
      const has_more = rows.length > query.limit;
      return {
        data: page.map(toDto),
        pagination: {
          total,
          limit: query.limit,
          offset: 0,
          next_cursor: has_more ? encodeCursor(page.at(-1)!.activity.id) : null,
          has_more,
        },
      };
    },

    /** Newest first, capped; asking for it is itself recorded. */
    async exportCsv(
      principal: Principal,
      slug: string,
      query: Omit<ActivityQuery, 'cursor' | 'limit'>,
      ip: string | null,
    ): Promise<{ filename: string; csv: string }> {
      const org = await auditable(principal, slug);
      access.require(principal, 'org.export', org.scope);
      const filter = await filterFor(org, query);

      await activity.record(org.ctx, {
        actor_id: principal.userId,
        kind: 'export_requested',
        target_type: 'organization',
        target_id: String(org.organization.id),
        new_value: { export: 'org_activity', ...query },
        ip,
      });

      const lines = [CSV_COLUMNS.join(',')];
      let beforeId: number | undefined;
      while (lines.length - 1 < ACTIVITY_EXPORT_MAX_ROWS) {
        const rows = await activity.list(org.ctx, { ...filter, beforeId, limit: ACTIVITY_EXPORT_PAGE_SIZE });
        for (const row of rows) {
          const dto = toDto(row);
          const actor = dto.actor ? (dto.actor.username ? `@${dto.actor.username}` : dto.actor.name) : '';
          lines.push(
            [
              dto.id,
              dto.created_at,
              dto.kind,
              actor,
              dto.target_type,
              dto.target_id,
              dto.old_value,
              dto.new_value,
              dto.ip,
            ]
              .map(csvCell)
              .join(','),
          );
        }
        if (rows.length < ACTIVITY_EXPORT_PAGE_SIZE) break;
        beforeId = rows.at(-1)!.activity.id;
      }

      const date = new Date().toISOString().slice(0, 10);
      return { filename: `${org.organization.slug}-activity-${date}.csv`, csv: `${lines.join('\r\n')}\r\n` };
    },
  };
}

export type ActivityService = ReturnType<typeof activityService>;

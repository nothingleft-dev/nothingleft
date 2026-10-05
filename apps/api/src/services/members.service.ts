import {
  SAVED_VIEW_NAME_MAX,
  type Member,
  type MemberRef,
  type OrgRole,
  type Pagination,
  type Principal,
  type RemovalPreview,
  type RemoveMember,
  type UpdateMember,
} from '@nothingleft/types';
import {
  systemContext,
  type CommentsRepository,
  type IssuesRepository,
  type MemberWithUser,
  type OrganizationsRepository,
  type PersonalAccessTokensRepository,
  type ProjectsRepository,
  type SavedViewsRepository,
  type TenantContext,
  type WorkItemsRepository,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { parseUsername } from '@nothingleft/format';
import { AppError } from '@lib/errors';
import { bestEffort, type Mailer } from '@lib/email';
import type { AccessService, OrgAccess } from '@services/access';
import { recordFieldChanges } from '@services/issue-history';
import type { SessionsService } from '@services/sessions.service';
import type { InTenantTransaction } from '@services/transaction';

export interface MembersDeps {
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  tokens: PersonalAccessTokensRepository;
  issues: IssuesRepository;
  comments: CommentsRepository;
  workItems: WorkItemsRepository;
  savedViews: SavedViewsRepository;
  access: AccessService;
  sessions: SessionsService;
  inTransaction: InTenantTransaction;
  mailer: Mailer;
  analytics: Analytics;
  appBaseUrl: string;
}

export interface MemberListQuery {
  q?: string | undefined;
  limit: number;
  offset: number;
}

const byUsername = (a: string, b: string) => a.localeCompare(b);

export function membersService(deps: MembersDeps) {
  const {
    organizations,
    projects,
    tokens,
    issues,
    comments,
    workItems,
    savedViews,
    access,
    sessions,
    inTransaction,
    mailer,
    analytics,
    appBaseUrl,
  } = deps;
  const notify = bestEffort(mailer, error => analytics.captureException(error));
  const sys = systemContext('a removed member keeps user-level credentials that span organisations');

  async function inviterNames(org: OrgAccess, rows: MemberWithUser[]): Promise<Map<number, string>> {
    const ids = [...new Set(rows.map(r => r.membership.invited_by).filter((id): id is number => id !== null))];
    const found = await Promise.all(
      ids.map(id => organizations.findMemberByUserId(org.ctx, id, { includeRemoved: true })),
    );
    return new Map(found.filter(f => f !== undefined).map(f => [f.user.id, f.membership.username]));
  }

  function toDto(org: OrgAccess, row: MemberWithUser, inviters: Map<number, string>): Member {
    const seesEmail = org.scope.isOwner || org.scope.orgRole === 'org_admin' || row.user.id === org.membership.user_id;
    return {
      ...access.memberRef(row.user, row.membership),
      email: seesEmail ? row.user.email : null,
      email_verified: row.user.email_verified_at !== null,
      org_role: row.membership.role as OrgRole,
      is_owner: org.organization.owner_user_id === row.user.id,
      joined_at: row.membership.joined_at.toISOString(),
      invited_by: row.membership.invited_by === null ? null : (inviters.get(row.membership.invited_by) ?? null),
    };
  }

  async function one(org: OrgAccess, row: MemberWithUser): Promise<Member> {
    return toDto(org, row, await inviterNames(org, [row]));
  }

  async function actorName(org: OrgAccess): Promise<string> {
    const self = await organizations.findMemberByUserId(org.ctx, org.membership.user_id);
    return self?.user.name ?? org.membership.username;
  }

  async function target(org: OrgAccess, username: string): Promise<MemberWithUser> {
    const row = await organizations.findMemberByUsername(org.ctx, username.replace(/^@/, ''));
    if (!row) throw new AppError('member.not_found', 404, { username }, 'username');
    return row;
  }

  async function removable(principal: Principal, slug: string, username: string) {
    const org = await access.org(principal, slug);
    access.require(principal, 'org.members.remove', org.scope);
    const row = await target(org, username);
    if (row.user.id === org.organization.owner_user_id) throw new AppError('member.owner_not_removable', 400);
    return { org, row };
  }

  async function reassignCandidates(ctx: TenantContext, removedId: number, projectIds: number[]) {
    const distinct = [...new Set(projectIds)];
    if (distinct.length === 0) return [];
    const lists = await Promise.all(distinct.map(id => projects.listAssignable(ctx, id)));
    const [first, ...rest] = lists;
    return first!
      .filter(m => m.user.id !== removedId && rest.every(list => list.some(r => r.user.id === m.user.id)))
      .sort((a, b) => a.user.name.localeCompare(b.user.name));
  }

  async function handover(
    org: OrgAccess,
    removed: MemberWithUser,
    username: string | undefined,
    field: 'reassign_to' | 'transfer_views_to',
  ): Promise<MemberWithUser | null> {
    if (username === undefined) return null;
    const row = await organizations.findMemberByUsername(org.ctx, username.replace(/^@/, ''));
    if (!row || row.user.id === removed.user.id) {
      throw new AppError('member.handover_invalid', 400, { username: `@${username.replace(/^@/, '')}` }, field);
    }
    return row;
  }

  function nextFreeName(name: string, taken: Set<string>): string {
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const suffix = ` ${n}`;
      const candidate = name.slice(0, SAVED_VIEW_NAME_MAX - suffix.length) + suffix;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  return {
    async list(
      principal: Principal,
      slug: string,
      query: MemberListQuery,
    ): Promise<{ data: Member[]; pagination: Pagination }> {
      const org = await access.org(principal, slug);
      access.require(principal, 'org.members.read', org.scope);
      const { rows, total } = await organizations.listMembers(org.ctx, {
        search: query.q,
        limit: query.limit,
        offset: query.offset,
      });
      const inviters = await inviterNames(org, rows);
      return {
        data: rows.map(r => toDto(org, r, inviters)),
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          next_cursor: null,
          has_more: query.offset + rows.length < total,
        },
      };
    },

    async get(principal: Principal, slug: string, username: string): Promise<Member> {
      const org = await access.org(principal, slug);
      access.require(principal, 'org.members.read', org.scope);
      return one(org, await target(org, username));
    },

    async update(
      principal: Principal,
      slug: string,
      username: string,
      input: UpdateMember,
      ip: string | null,
    ): Promise<Member> {
      const org = await access.org(principal, slug);
      const row = await target(org, username);
      const isSelf = row.user.id === principal.userId;

      let nextUsername: string | undefined;
      if (input.username !== undefined) {
        if (!isSelf) throw new AppError('member.username_not_own', 403, {}, 'username');
        const parsed = parseUsername(input.username);
        if (!parsed) throw new AppError('member.username_invalid', 400, {}, 'username');
        if (parsed !== row.membership.username) {
          const holder = await organizations.findMemberByUsername(org.ctx, parsed, { includeRemoved: true });
          if (holder && holder.user.id !== row.user.id) {
            throw new AppError('member.username_taken', 409, { username: parsed }, 'username');
          }
          nextUsername = parsed;
        }
      }

      let nextRole: OrgRole | undefined;
      if (input.org_role !== undefined && input.org_role !== row.membership.role) {
        access.require(principal, 'org.members.role_change', org.scope);
        if (row.user.id === org.organization.owner_user_id) {
          throw new AppError('member.owner_role_fixed', 400, {}, 'org_role');
        }
        nextRole = input.org_role;
      }
      if (nextUsername === undefined && nextRole === undefined) return one(org, row);

      const updated = await inTransaction(async repos => {
        const saved = await repos.organizations.updateMember(org.ctx, row.user.id, {
          ...(nextUsername !== undefined ? { username: nextUsername } : {}),
          ...(nextRole !== undefined ? { role: nextRole } : {}),
        });
        if (!saved) throw new AppError('member.not_found', 404, { username }, 'username');
        const base = { actor_id: principal.userId, target_type: 'member', target_id: String(row.user.id), ip };
        if (nextUsername !== undefined) {
          await repos.activity.record(org.ctx, {
            ...base,
            kind: 'username_changed',
            old_value: { username: row.membership.username },
            new_value: { username: nextUsername },
          });
        }
        if (nextRole !== undefined) {
          await repos.activity.record(org.ctx, {
            ...base,
            kind: 'role_changed',
            old_value: { username: saved.username, org_role: row.membership.role },
            new_value: { username: saved.username, org_role: nextRole },
          });
        }
        return saved;
      });

      if (nextRole === 'org_admin') {
        await notify.send({
          to: row.user.email,
          subject: 'email.role_raised.subject',
          body: 'email.role_raised.body',
          params: {
            name: row.user.name,
            actor: await actorName(org),
            org: org.organization.name,
            url: `${appBaseUrl}/organization`,
          },
        });
      }
      return one(org, { user: row.user, membership: updated });
    },

    async removalPreview(principal: Principal, slug: string, username: string): Promise<RemovalPreview> {
      const { org, row } = await removable(principal, slug, username);
      const userId = row.user.id;
      const [assigned, open, created, commentCount, minutes, views, sessionCount, projectIds] = await Promise.all([
        issues.countAssignedTo(org.ctx, userId),
        issues.listOpenAssignedTo(org.ctx, userId),
        issues.countCreatedBy(org.ctx, userId),
        comments.countByAuthor(org.ctx, userId),
        workItems.sumMinutesByAuthor(org.ctx, userId),
        savedViews.listOwnedBy(org.ctx, userId),
        sessions.countLive(userId),
        projects.listIds(org.ctx),
      ]);
      const candidates = await reassignCandidates(
        org.ctx,
        userId,
        open.map(i => i.project_id),
      );
      return {
        member: access.memberRef(row.user, row.membership),
        open_assigned: assigned.open,
        resolved_assigned: assigned.resolved,
        created,
        comments: commentCount,
        time_logged_minutes: minutes,
        saved_views: views.length,
        sessions: sessionCount,
        access_tokens: await tokens.countReaching(sys, userId, projectIds),
        reassign_candidates: candidates.map((c): MemberRef => access.memberRef(c.user, c.membership)),
      };
    },

    /**
     * Open issues move or lose them, their views move or go, and then the soft delete.
     * Credentials confined to this organisation go too - user-lifecycle.md.
     */
    async remove(
      principal: Principal,
      slug: string,
      username: string,
      input: RemoveMember,
      ip: string | null,
    ): Promise<Member> {
      const { org, row } = await removable(principal, slug, username);
      const userId = row.user.id;
      const reassignee = await handover(org, row, input.reassign_to, 'reassign_to');
      const viewsTo = await handover(org, row, input.transfer_views_to, 'transfer_views_to');
      if (reassignee) {
        const open = await issues.listOpenAssignedTo(org.ctx, userId);
        const allowed = await reassignCandidates(
          org.ctx,
          userId,
          open.map(i => i.project_id),
        );
        if (open.length > 0 && !allowed.some(c => c.user.id === reassignee.user.id)) {
          throw new AppError(
            'member.reassign_not_assignable',
            400,
            { username: `@${reassignee.membership.username}` },
            'reassign_to',
          );
        }
      }
      const projectIds = await projects.listIds(org.ctx);
      const at = new Date();
      const changeGroupId = Bun.randomUUIDv7();

      const { removed, counts } = await inTransaction(async repos => {
        let reassigned = 0;
        let unassigned = 0;
        for (const { id } of await repos.issues.listOpenAssignedTo(org.ctx, userId)) {
          if (!(await repos.issues.lockById(org.ctx, id))) continue;
          const existing = await repos.issues.listAssignees(org.ctx, [id]);
          const names = new Map(existing.map(a => [a.user_id, a.membership?.username ?? '']));
          const before = [...names.values()].sort(byUsername);
          names.delete(userId);
          await repos.issues.removeAssignees(org.ctx, id, [userId]);
          const adds = reassignee !== null && !names.has(reassignee.user.id);
          if (adds) {
            names.set(reassignee.user.id, reassignee.membership.username);
            await repos.issues.addAssignees(org.ctx, id, [reassignee.user.id]);
            await repos.issues.watch(org.ctx, id, [reassignee.user.id], 'auto');
          }
          if (reassignee) reassigned++;
          else unassigned++;
          await repos.issues.update(org.ctx, id, { updated_by: principal.userId, updated_at: at });
          await recordFieldChanges(
            repos.issueActivity,
            { ctx: org.ctx, issueId: id, actorId: principal.userId, changeGroupId, at },
            [{ field: 'assignees', old_value: before, new_value: [...names.values()].sort(byUsername) }],
          );
        }

        const owned = await repos.savedViews.listOwnedBy(org.ctx, userId);
        let viewsTransferred = 0;
        let viewsDeleted = 0;
        if (viewsTo) {
          const taken = new Set(
            (await repos.savedViews.listVisible(org.ctx, viewsTo.user.id, projectIds))
              .filter(v => v.owner_id !== userId)
              .map(v => v.name.toLowerCase()),
          );
          for (const view of owned) {
            const name = nextFreeName(view.name, taken);
            taken.add(name.toLowerCase());
            await repos.savedViews.transfer(org.ctx, view.id, viewsTo.user.id, name);
            viewsTransferred++;
          }
        } else {
          viewsDeleted = await repos.savedViews.removeOwnedBy(org.ctx, userId);
        }

        const saved = await repos.organizations.removeMember(org.ctx, userId);
        if (!saved) throw new AppError('member.not_found', 404, { username }, 'username');
        const dropped = await repos.projects.removeAllMembershipsOf(org.ctx, userId);
        await repos.activity.record(org.ctx, {
          actor_id: principal.userId,
          kind: 'member_removed',
          target_type: 'member',
          target_id: String(userId),
          old_value: { username: saved.username, org_role: saved.role, projects: dropped.length },
          ip,
        });
        return {
          removed: saved,
          counts: { reassigned, unassigned, views_transferred: viewsTransferred, views_deleted: viewsDeleted },
        };
      });

      await sessions.forgetOrganization(userId, org.organization.id);
      await tokens.revokeRestrictedTo(sys, userId, projectIds);
      await notify.send({
        to: row.user.email,
        subject: 'email.member_removed.subject',
        body: 'email.member_removed.body',
        params: { name: row.user.name, actor: await actorName(org), org: org.organization.name },
      });
      analytics.capture('member_removed', counts, { userId: principal.userId, orgId: org.organization.id });
      return one(org, { user: row.user, membership: removed });
    },
  };
}

export type MembersService = ReturnType<typeof membersService>;

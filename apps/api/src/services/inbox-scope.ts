import {
  systemContext,
  tenantContext,
  type InboxOrg,
  type TenantContext,
  type InboxScope,
  type OrganizationsRepository,
  type ProjectsRepository,
} from '@nothingleft/db';
import type { OrgRole, Principal, ProjectRole } from '@nothingleft/types';
import { draftReach } from '@services/article-visibility';

export interface InboxScopeDeps {
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
}

export interface ScopedOrg {
  orgId: number;
  slug: string;
  name: string;
}

/** The projects someone can open in one organisation and whose drafts there they may read. */
export async function inboxOrg(
  projects: ProjectsRepository,
  principal: Principal,
  ctx: TenantContext,
  member: { orgRole: OrgRole; isOwner: boolean },
): Promise<InboxOrg> {
  const tokenProjectIds = principal.via === 'pat' ? principal.projectIds : null;
  const everyProject = member.isOwner || member.orgRole === 'org_admin';
  const readable = (await projects.listReadable(ctx, principal.userId, { everyProject })).filter(
    r => tokenProjectIds === null || tokenProjectIds.includes(r.project.id),
  );
  const reach = readable.map(r => ({
    id: r.project.id,
    ...draftReach(principal, {
      ...member,
      projectRole: (r.role as ProjectRole | null) ?? null,
      projectId: r.project.id,
    }),
  }));
  return {
    ctx,
    projectIds: reach.map(p => p.id),
    ownDraftProjectIds: reach.filter(p => p.ownDrafts).map(p => p.id),
    adminProjectIds: reach.filter(p => p.admin).map(p => p.id),
  };
}

/**
 * The organisations someone still belongs to, the projects they can open in each and whose
 * drafts there they may read, all read now: a notification is shown only while its issue or
 * article could be opened (docs/notifications.md § Notification centre). A token's project
 * list narrows it.
 */
export async function inboxScope(
  deps: InboxScopeDeps,
  principal: Principal,
): Promise<{ scope: InboxScope; orgs: ScopedOrg[] }> {
  const { userId } = principal;
  const memberships = await deps.organizations.listForUser(
    systemContext('a person’s notifications span every organisation they belong to'),
    userId,
  );
  const orgs = await Promise.all(
    memberships.map(async ({ organization, membership }) => {
      const ctx = tenantContext(organization.id, userId);
      const inbox = await inboxOrg(deps.projects, principal, ctx, {
        orgRole: membership.role as OrgRole,
        isOwner: organization.owner_user_id === userId,
      });
      return { inbox, slug: organization.slug, name: organization.name };
    }),
  );
  return {
    scope: { userId, orgs: orgs.map(o => o.inbox) },
    orgs: orgs.map(o => ({ orgId: o.inbox.ctx.orgId, slug: o.slug, name: o.name })),
  };
}

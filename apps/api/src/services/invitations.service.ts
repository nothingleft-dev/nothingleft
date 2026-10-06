import {
  EMAIL_INVITATION_TTL_SECONDS,
  type Acknowledgement,
  type AcceptedInvitation,
  type CreateEmailInvitations,
  type CreateInvitationLink,
  type Invitation,
  type InvitationKind,
  type InvitationPreview,
  type InvitationStatus,
  type InvitationUse,
  type OrgRole,
  type Principal,
  type ProjectRole,
} from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type InvitationRow,
  type InvitationsRepository,
  type OrganizationsRepository,
  type ProjectRow,
  type ProjectsRepository,
  type UserRow,
  type UsersRepository,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { t } from '@nothingleft/i18n';
import { usernameFromEmail } from '@nothingleft/format';
import { AppError } from '@lib/errors';
import { issueInvitationToken, sha256 } from '@lib/crypto';
import { bestEffort, type Mailer } from '@lib/email';
import { denial, type AccessService, type OrgAccess } from '@services/access';
import { can } from '@services/permissions';
import type { OrganizationsService } from '@services/organizations.service';
import type { SessionsService } from '@services/sessions.service';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';

export interface InvitationsDeps {
  invitations: InvitationsRepository;
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  users: UsersRepository;
  access: AccessService;
  orgs: OrganizationsService;
  sessions: SessionsService;
  inTransaction: InTenantTransaction;
  mailer: Mailer;
  analytics: Analytics;
  appBaseUrl: string;
}

/** Where an invitation is created from: the organisation's Invites tab, or a project's. */
export type InvitationScope = { slug: string } | { key: string; hints?: OrgHints };

interface Scoped {
  org: OrgAccess;
  project: ProjectRow | null;
}

const ACK: Acknowledgement = { ok: true };
const emailDomain = (email: string) => email.slice(email.lastIndexOf('@') + 1).toLowerCase();

export function statusOf(row: InvitationRow, now = Date.now()): InvitationStatus {
  if (row.revoked_at) return 'revoked';
  if (row.max_uses !== null && row.use_count >= row.max_uses) return row.kind === 'email' ? 'accepted' : 'exhausted';
  if (row.expires_at && row.expires_at.getTime() <= now) return 'expired';
  return 'active';
}

export function invitationsService(deps: InvitationsDeps) {
  const { invitations, organizations, projects, users, access, orgs, sessions, inTransaction } = deps;
  const { mailer, analytics, appBaseUrl } = deps;
  const notify = bestEffort(mailer, error => analytics.captureException(error));
  const sys = systemContext('an invitation token is presented before its holder belongs to the organisation');
  const inviteUrl = (token: string) => `${appBaseUrl}/invite/${token}`;

  async function toDto(org: OrgAccess, row: InvitationRow): Promise<Invitation> {
    const [creator, project] = await Promise.all([
      organizations.findMemberByUserId(org.ctx, row.created_by, { includeRemoved: true }),
      row.project_id === null ? undefined : projects.findById(org.ctx, row.project_id),
    ]);
    if (!creator) throw new Error(`invitation ${row.id} has no creator membership`);
    return {
      id: row.id,
      kind: row.kind as InvitationKind,
      status: statusOf(row),
      email: row.email,
      url: row.token ? inviteUrl(row.token) : null,
      project_key: project?.key ?? null,
      org_role: row.org_role as OrgRole,
      project_role: (row.project_role as ProjectRole | null) ?? null,
      max_uses: row.max_uses,
      use_count: row.use_count,
      expires_at: row.expires_at?.toISOString() ?? null,
      allowed_email_domain: row.allowed_email_domain,
      created_by: access.memberRef(creator.user, creator.membership),
      created_at: row.created_at.toISOString(),
      revoked_at: row.revoked_at?.toISOString() ?? null,
    };
  }

  async function scoped(principal: Principal, scope: InvitationScope): Promise<Scoped> {
    if ('slug' in scope) {
      const org = await access.org(principal, scope.slug);
      access.require(principal, 'org.invites.manage', org.scope);
      return { org, project: null };
    }
    const project = await access.project(principal, scope.key, scope.hints);
    access.require(principal, 'project.invites.manage', project.scope);
    return { org: project, project: project.project };
  }

  /** A Project Admin may bring people into the organisation, but only an Org Admin may make admins. */
  function roles(
    principal: Principal,
    target: Scoped,
    input: { org_role?: OrgRole | undefined; project_role?: ProjectRole | undefined },
  ) {
    const org_role = input.org_role ?? 'member';
    if (org_role === 'org_admin') access.require(principal, 'org.members.role_change', target.org.scope);
    if (!target.project && input.project_role !== undefined) {
      throw new AppError('invitation.project_role_needs_project', 400, {}, 'project_role');
    }
    const project_role = target.project ? (input.project_role ?? 'contributor') : null;
    return { org_role, project_role };
  }

  async function byId(principal: Principal, slug: string, id: number) {
    const org = await access.org(principal, slug);
    const row = await invitations.findById(org.ctx, id);
    if (!row) throw AppError.notFound();
    if (row.project_id === null) {
      if (!can(principal, 'org.invites.manage', org.scope)) {
        throw denial(principal, 'org.invites.manage', org.scope, AppError.notFound);
      }
      return { org, row };
    }
    const project = await access.projectById(principal, org, row.project_id).catch(() => null);
    if (!project) throw AppError.notFound();
    access.require(principal, 'project.invites.manage', project.scope);
    return { org, row };
  }

  async function lookup(token: string): Promise<InvitationRow> {
    const row = await invitations.findByTokenHash(sys, sha256(token));
    if (!row) throw new AppError('invitation.not_found', 404, {}, 'token');
    return row;
  }

  function assertLive(row: InvitationRow): void {
    const status = statusOf(row);
    if (status === 'revoked') throw new AppError('invitation.revoked', 410, {}, 'token');
    if (status === 'expired') throw new AppError('invitation.expired', 410, {}, 'token');
    if (status === 'exhausted' || status === 'accepted') throw new AppError('invitation.exhausted', 410, {}, 'token');
  }

  /** Already holding everything the invitation would grant. */
  async function alreadyHolds(target: Pick<InvitationRow, 'org_id' | 'project_id'>, userId: number): Promise<boolean> {
    const ctx = tenantContext(target.org_id, userId);
    const membership = await organizations.findMembership(ctx, userId);
    if (!membership) return false;
    if (target.project_id === null) return true;
    return (await projects.findMember(ctx, target.project_id, userId)) !== undefined;
  }

  async function assertEligible(row: InvitationRow, user: UserRow): Promise<void> {
    if (row.kind === 'email' && row.email?.toLowerCase() !== user.email.toLowerCase()) {
      throw new AppError('invitation.email_mismatch', 403, { email: row.email ?? '' }, 'token');
    }
    if (row.allowed_email_domain && emailDomain(user.email) !== row.allowed_email_domain) {
      throw new AppError('invitation.domain_not_allowed', 403, { domain: row.allowed_email_domain }, 'token');
    }
    if (!user.email_verified_at) {
      // An email invitation reached this address, so holding its token proves the address.
      if (row.kind === 'email') {
        await users.update(sys, user.id, { email_verified_at: new Date() });
        return;
      }
      throw new AppError('auth.email_unverified', 403);
    }
  }

  async function join(repos: TenantRepos, row: InvitationRow, user: UserRow, ip: string | null) {
    const ctx = tenantContext(row.org_id, user.id);
    const claimed = await repos.invitations.claimUse(ctx, row.id);
    if (!claimed) {
      assertLive((await repos.invitations.findById(ctx, row.id)) ?? row);
      throw new AppError('invitation.exhausted', 410, {}, 'token');
    }
    await repos.invitations.recordUse(ctx, { invitation_id: row.id, user_id: user.id, ip });

    const base = { actor_id: user.id, ip };
    let membership = await repos.organizations.findAnyMembership(ctx, user.id);
    if (!membership || membership.removed_at) {
      if (membership) {
        membership = await repos.organizations.restoreMember(ctx, user.id, {
          role: row.org_role,
          invited_by: row.created_by,
        });
      } else {
        const base = usernameFromEmail(user.email);
        const taken = new Set(await repos.organizations.listUsernamesWithPrefix(ctx, base));
        membership = await repos.organizations.addMember(ctx, {
          user_id: user.id,
          username: usernameFromEmail(user.email, taken),
          role: row.org_role,
          invited_by: row.created_by,
        });
      }
      await repos.activity.record(ctx, {
        ...base,
        kind: 'member_joined',
        target_type: 'member',
        target_id: String(user.id),
        new_value: { username: membership!.username, org_role: row.org_role, via: row.kind, invitation_id: row.id },
      });
    }

    let projectKey: string | null = null;
    if (row.project_id !== null) {
      const project = await repos.projects.findById(ctx, row.project_id);
      projectKey = project?.key ?? null;
      if (project && !(await repos.projects.findMember(ctx, project.id, user.id))) {
        await repos.projects.addMember(ctx, {
          project_id: project.id,
          user_id: user.id,
          role: row.project_role ?? 'contributor',
          created_by: row.created_by,
        });
        await repos.activity.record(ctx, {
          ...base,
          kind: 'member_joined',
          target_type: 'project_member',
          target_id: `${project.id}:${user.id}`,
          new_value: {
            project_key: project.key,
            username: membership!.username,
            project_role: row.project_role,
            via: row.kind,
            invitation_id: row.id,
          },
        });
      }
    }
    return { projectKey };
  }

  return {
    statusOf,

    async list(principal: Principal, scope: InvitationScope): Promise<Invitation[]> {
      const target = await scoped(principal, scope);
      const rows = await invitations.list(target.org.ctx, { projectId: target.project?.id ?? null });
      return Promise.all(rows.map(r => toDto(target.org, r)));
    },

    async createEmails(
      principal: Principal,
      scope: InvitationScope,
      input: CreateEmailInvitations,
      ip: string | null,
    ): Promise<Invitation[]> {
      const target = await scoped(principal, scope);
      if (!target.project) access.require(principal, 'org.members.invite', target.org.scope);
      const granted = roles(principal, target, input);
      const emails = [...new Map(input.emails.map(e => [e.toLowerCase(), e])).values()];

      for (const email of emails) {
        const existing = await users.findByEmail(sys, email);
        if (!existing) continue;
        const holds = await alreadyHolds(
          { org_id: target.org.organization.id, project_id: target.project?.id ?? null },
          existing.id,
        );
        if (holds) {
          if (target.project) {
            const member = await organizations.findMembership(target.org.ctx, existing.id);
            throw new AppError('member.already_in_project', 409, { username: member?.username ?? email }, 'emails');
          }
          throw new AppError('invitation.already_member', 409, { email }, 'emails');
        }
      }

      const inviter = await organizations.findMemberByUserId(target.org.ctx, principal.userId);
      const issued = emails.map(email => ({ email, ...issueInvitationToken() }));
      const rows = await inTransaction(async repos => {
        const created: InvitationRow[] = [];
        for (const { email, token_hash } of issued) {
          await repos.invitations.revokePendingEmail(target.org.ctx, email, target.project?.id ?? null);
          const row = await repos.invitations.create(target.org.ctx, {
            project_id: target.project?.id ?? null,
            kind: 'email',
            email,
            token_hash,
            ...granted,
            max_uses: 1,
            expires_at: new Date(Date.now() + EMAIL_INVITATION_TTL_SECONDS * 1000),
            created_by: principal.userId,
          });
          await repos.activity.record(target.org.ctx, {
            actor_id: principal.userId,
            kind: 'member_invited',
            target_type: 'invitation',
            target_id: String(row.id),
            new_value: { email, ...granted, project_key: target.project?.key ?? null },
            ip,
          });
          created.push(row);
        }
        return created;
      });

      const role = t(target.project ? `role.${granted.project_role!}` : `role.${granted.org_role}`);
      for (const { email, token } of issued) {
        await notify.send({
          to: email,
          subject: 'email.invitation.subject',
          body: target.project ? 'email.invitation_project.body' : 'email.invitation.body',
          params: {
            inviter: inviter?.user.name ?? '',
            org: target.org.organization.name,
            project: target.project?.name ?? '',
            role,
            email,
            url: inviteUrl(token),
          },
        });
      }
      analytics.capture(
        'invitations_sent',
        { count: rows.length, project_scoped: target.project !== null },
        { userId: principal.userId, orgId: target.org.organization.id },
      );
      return Promise.all(rows.map(r => toDto(target.org, r)));
    },

    async createLink(
      principal: Principal,
      scope: InvitationScope,
      input: CreateInvitationLink,
      ip: string | null,
    ): Promise<Invitation> {
      const target = await scoped(principal, scope);
      const granted = roles(principal, target, input);
      const { token, token_hash } = issueInvitationToken();
      const row = await inTransaction(async repos => {
        const row = await repos.invitations.create(target.org.ctx, {
          project_id: target.project?.id ?? null,
          kind: 'link',
          token,
          token_hash,
          ...granted,
          max_uses: input.max_uses ?? null,
          expires_at: input.expires_at ? new Date(input.expires_at) : null,
          allowed_email_domain: input.allowed_email_domain ?? null,
          created_by: principal.userId,
        });
        await repos.activity.record(target.org.ctx, {
          actor_id: principal.userId,
          kind: 'invite_created',
          target_type: 'invitation',
          target_id: String(row.id),
          new_value: {
            ...granted,
            project_key: target.project?.key ?? null,
            max_uses: row.max_uses,
            expires_at: row.expires_at?.toISOString() ?? null,
            allowed_email_domain: row.allowed_email_domain,
          },
          ip,
        });
        return row;
      });
      analytics.capture(
        'invite_link_created',
        {
          project_scoped: target.project !== null,
          limited: row.max_uses !== null || row.expires_at !== null || row.allowed_email_domain !== null,
        },
        { userId: principal.userId, orgId: target.org.organization.id },
      );
      return toDto(target.org, row);
    },

    async get(principal: Principal, slug: string, id: number): Promise<Invitation> {
      const { org, row } = await byId(principal, slug, id);
      return toDto(org, row);
    },

    async listUses(principal: Principal, slug: string, id: number): Promise<InvitationUse[]> {
      const { org } = await byId(principal, slug, id);
      const rows = await invitations.listUses(org.ctx, id);
      return rows.map(r => ({
        ...access.memberRef(r.user, r.membership),
        used_at: r.use.used_at.toISOString(),
      }));
    },

    async rotate(principal: Principal, slug: string, id: number, ip: string | null): Promise<Invitation> {
      const { org, row } = await byId(principal, slug, id);
      if (row.kind !== 'link') throw new AppError('invitation.not_a_link', 400);
      if (row.revoked_at) throw new AppError('invitation.revoked', 410);
      const next = issueInvitationToken();
      const rotated = await inTransaction(async repos => {
        const saved = await repos.invitations.rotate(org.ctx, id, { token: next.token, token_hash: next.token_hash });
        if (!saved) throw new AppError('invitation.revoked', 410);
        await repos.activity.record(org.ctx, {
          actor_id: principal.userId,
          kind: 'invite_rotated',
          target_type: 'invitation',
          target_id: String(id),
          ip,
        });
        return saved;
      });
      return toDto(org, rotated);
    },

    async revoke(principal: Principal, slug: string, id: number, ip: string | null): Promise<Invitation> {
      const { org, row } = await byId(principal, slug, id);
      if (row.revoked_at) return toDto(org, row);
      const revoked = await inTransaction(async repos => {
        const saved = await repos.invitations.revoke(org.ctx, id);
        if (!saved) throw AppError.notFound();
        await repos.activity.record(org.ctx, {
          actor_id: principal.userId,
          kind: 'invite_revoked',
          target_type: 'invitation',
          target_id: String(id),
          old_value: { kind: row.kind, email: row.email },
          ip,
        });
        return saved;
      });
      return toDto(org, revoked);
    },

    /** Path A step 1: what is being joined, before anything is asked of the visitor. */
    async preview(principal: Principal | null, token: string): Promise<InvitationPreview> {
      const row = await lookup(token);
      const already_member = principal ? await alreadyHolds(row, principal.userId) : null;
      if (!already_member) assertLive(row);

      const ctx = tenantContext(row.org_id, principal?.userId ?? null);
      const [organization, project, inviter] = await Promise.all([
        organizations.findById(ctx),
        row.project_id === null ? undefined : projects.findById(ctx, row.project_id),
        users.findById(sys, row.created_by),
      ]);
      if (!organization) throw new AppError('invitation.not_found', 404, {}, 'token');
      return {
        kind: row.kind as InvitationKind,
        organization: {
          slug: organization.slug,
          name: organization.name,
          avatar_url: access.marks.organization(organization.name),
        },
        project: project ? { key: project.key, name: project.name } : null,
        invited_by: { name: inviter?.name ?? '', avatar_url: inviter ? access.avatarUrl(inviter) : null },
        org_role: row.org_role as OrgRole,
        project_role: (row.project_role as ProjectRole | null) ?? null,
        email: row.email,
        allowed_email_domain: row.allowed_email_domain,
        expires_at: row.expires_at?.toISOString() ?? null,
        already_member,
      };
    },

    async accept(principal: Principal, token: string, ip: string | null): Promise<AcceptedInvitation> {
      const row = await lookup(token);
      const user = await users.findById(sys, principal.userId);
      if (!user) throw AppError.unauthorized();

      let already_member = await alreadyHolds(row, user.id);
      let projectKey: string | null = null;
      if (already_member) {
        if (row.project_id !== null) {
          projectKey = (await projects.findById(tenantContext(row.org_id, user.id), row.project_id))?.key ?? null;
        }
      } else {
        assertLive(row);
        await assertEligible(row, user);
        ({ projectKey } = await inTransaction(repos => join(repos, row, user, ip)));
        already_member = false;
        analytics.capture(
          'invitation_accepted',
          {
            kind: row.kind as InvitationKind,
            project_scoped: row.project_id !== null,
            already_member: false,
            seconds_to_accept: Math.max(0, (Date.now() - row.created_at.getTime()) / 1000),
          },
          { userId: user.id, orgId: row.org_id },
        );
      }

      await sessions.enterOrganization(principal, row.org_id);
      const org = await access.orgById(principal, row.org_id);
      return { organization: await orgs.toDto(org), project_key: projectKey, already_member };
    },

    /**
     * Path B's Decline. A share link is left untouched — others may still use it — but an
     * email invitation addressed to the caller is withdrawn so it cannot be accepted later.
     */
    async decline(principal: Principal, token: string, ip: string | null): Promise<Acknowledgement> {
      const row = await lookup(token);
      if (row.kind !== 'email' || statusOf(row) !== 'active') return ACK;
      const user = await users.findById(sys, principal.userId);
      if (!user || user.email.toLowerCase() !== row.email?.toLowerCase()) return ACK;

      const ctx = tenantContext(row.org_id, user.id);
      await inTransaction(async repos => {
        if (!(await repos.invitations.revoke(ctx, row.id))) return;
        await repos.activity.record(ctx, {
          actor_id: user.id,
          kind: 'invite_revoked',
          target_type: 'invitation',
          target_id: String(row.id),
          old_value: { kind: row.kind, email: row.email },
          new_value: { reason: 'declined' },
          ip,
        });
      });
      return ACK;
    },

    /** For sign-up: whether this token is an email invitation to exactly this address. */
    async provesEmail(token: string, email: string): Promise<boolean> {
      const row = await invitations.findByTokenHash(sys, sha256(token));
      return (
        !!row && row.kind === 'email' && statusOf(row) === 'active' && row.email?.toLowerCase() === email.toLowerCase()
      );
    },
  };
}

export type InvitationsService = ReturnType<typeof invitationsService>;

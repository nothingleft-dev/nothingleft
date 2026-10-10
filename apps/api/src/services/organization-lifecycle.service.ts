import {
  ONE_TIME_TOKEN_TTL_SECONDS,
  ORG_DELETION_GRACE_DAYS,
  type Acknowledgement,
  type InitiateOwnershipTransfer,
  type Organization,
  type OwnershipTransfer,
  type Principal,
  type StepUp,
} from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type AttachmentsRepository,
  type ExportJobsRepository,
  type ImportJobsRepository,
  type MemberWithUser,
  type OneTimeTokenRow,
  type OneTimeTokensRepository,
  type OrganizationRow,
  type OrganizationsRepository,
  type PersonalAccessTokensRepository,
  type ProjectsRepository,
  type SessionsRepository,
  type TenantContext,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { formatCalendarDate, parseUsername } from '@nothingleft/format';
import { dateInZone } from '@nothingleft/query';
import type { MessageKey } from '@nothingleft/i18n';
import { ORG_DELETE_BATCH } from '@config/constants';
import { AppError } from '@lib/errors';
import { issueOneTimeToken, sha256 } from '@lib/crypto';
import { bestEffort, type Mailer } from '@lib/email';
import type { AccessService, OrgAccess } from '@services/access';
import type { ObjectStores } from '@services/object-stores';
import type { AuthService } from '@services/auth.service';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';
import { requireSession, type TwoFactorService } from '@services/two-factor.service';

export interface OrganizationLifecycleDeps {
  access: AccessService;
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  oneTimeTokens: OneTimeTokensRepository;
  sessions: SessionsRepository;
  tokens: PersonalAccessTokensRepository;
  attachments: AttachmentsRepository;
  importJobs: ImportJobsRepository;
  exportJobs: ExportJobsRepository;
  inTransaction: InTenantTransaction;
  toDto: (org: OrgAccess) => Promise<Organization>;
  twoFactor: TwoFactorService;
  auth: AuthService;
  stores: ObjectStores;
  mailer: Mailer;
  analytics: Analytics;
  appBaseUrl: string;
}

const DAY_MS = 86_400_000;
const GRACE_MS = ORG_DELETION_GRACE_DAYS * DAY_MS;

export function organizationLifecycleService(deps: OrganizationLifecycleDeps) {
  const { access, organizations, projects, oneTimeTokens, sessions, tokens, attachments, inTransaction } = deps;
  const { toDto, twoFactor, auth, stores, mailer, analytics, appBaseUrl } = deps;
  const notify = bestEffort(mailer, error => analytics.captureException(error));
  const sys = systemContext('organisation deletion and ownership transfer run across accounts');
  const dangerUrl = `${appBaseUrl}/organization?tab=danger`;

  const deletesAt = (org: OrganizationRow) => new Date(org.deletion_scheduled_at!.getTime() + GRACE_MS);

  /** The deadline as a calendar date where the reader lives. */
  const deadlineFor = (org: OrganizationRow, timezone: string) =>
    formatCalendarDate(dateInZone(deletesAt(org), timezone));

  async function mailAdmins(
    ctx: TenantContext,
    org: OrganizationRow,
    subject: MessageKey,
    body: MessageKey,
    extra: Record<string, string> = {},
    recipients?: MemberWithUser[],
  ): Promise<void> {
    for (const admin of recipients ?? (await organizations.listAdmins(ctx))) {
      await notify.send({
        to: admin.user.email,
        subject,
        body,
        params: {
          name: admin.user.name,
          org: org.name,
          ...(org.deletion_scheduled_at ? { date: deadlineFor(org, admin.user.timezone) } : {}),
          url: dangerUrl,
          ...extra,
        },
      });
    }
  }

  async function actorName(org: OrgAccess): Promise<string> {
    const self = await organizations.findMemberByUserId(org.ctx, org.membership.user_id);
    return self?.user.name ?? org.membership.username;
  }

  /** Session only, then the Owner-only cell: a token can never reach these (mcp.md § Deliberately UI-only). */
  async function ownerAccess(principal: Principal, slug: string, capability: 'org.delete' | 'org.transfer_ownership') {
    requireSession(principal);
    const org = await access.org(principal, slug);
    access.require(principal, capability, org.scope);
    return org;
  }

  async function transferDto(org: OrganizationRow, row: OneTimeTokenRow): Promise<OwnershipTransfer> {
    const ctx = tenantContext(org.id);
    const [from, to] = await Promise.all([
      organizations.findMemberByUserId(ctx, row.created_by!, { includeRemoved: true }),
      organizations.findMemberByUserId(ctx, row.user_id, { includeRemoved: true }),
    ]);
    if (!from || !to) throw new AppError('ownership_transfer.invalid', 400, {}, 'token');
    return {
      organization: { slug: org.slug, name: org.name, avatar_url: access.marks.organization(org.name) },
      from: access.memberRef(from.user, from.membership),
      to: access.memberRef(to.user, to.membership),
      created_at: row.created_at.toISOString(),
      expires_at: row.expires_at.toISOString(),
    };
  }

  /** A live transfer for the signed-in account, in an organisation its offerer still owns. */
  async function openTransfer(principal: Principal, token: string) {
    const session = requireSession(principal);
    const row = await oneTimeTokens.findUnused(sys, 'ownership_transfer', sha256(token));
    if (!row || row.org_id === null || row.created_by === null) {
      throw new AppError('ownership_transfer.invalid', 400, {}, 'token');
    }
    if (row.expires_at.getTime() <= Date.now()) throw new AppError('ownership_transfer.expired', 400, {}, 'token');
    if (row.user_id !== session.userId) throw new AppError('ownership_transfer.wrong_account', 403, {}, 'token');
    const ctx = tenantContext(row.org_id, session.userId);
    const org = await organizations.findById(ctx);
    if (!org || org.owner_user_id !== row.created_by) {
      throw new AppError('ownership_transfer.invalid', 400, {}, 'token');
    }
    const target = await organizations.findMemberByUserId(ctx, session.userId);
    if (!target) throw new AppError('ownership_transfer.invalid', 400, {}, 'token');
    return { row, org, ctx, target };
  }

  /** Transfer writes queue on the organisation row, so each one sees the Owner the previous one left. */
  async function lockAsOwner(repos: TenantRepos, ctx: TenantContext, userId: number): Promise<void> {
    const locked = await repos.organizations.lockById(ctx);
    if (!locked || locked.owner_user_id !== userId) throw AppError.forbidden();
  }

  return {
    async scheduleDeletion(
      principal: Principal,
      slug: string,
      input: StepUp,
      ip: string | null,
    ): Promise<Organization> {
      const org = await ownerAccess(principal, slug, 'org.delete');
      if (org.organization.deletion_scheduled_at) {
        throw new AppError('organization.deletion_already_scheduled', 409, { slug });
      }
      await twoFactor.stepUp(principal, input);

      const at = new Date();
      const updated = await inTransaction(async repos => {
        const row = await repos.organizations.scheduleDeletion(org.ctx, at);
        if (!row) throw new AppError('organization.deletion_already_scheduled', 409, { slug });
        // A pending transfer would hand someone an organisation that is about to go.
        await repos.oneTimeTokens.deleteTransfers(org.ctx);
        await repos.activity.record(org.ctx, {
          actor_id: principal.userId,
          kind: 'deletion_scheduled',
          target_type: 'organization',
          target_id: String(org.organization.id),
          new_value: { slug: row.slug, deletes_at: deletesAt(row).toISOString() },
          ip,
        });
        return row;
      });

      await mailAdmins(org.ctx, updated, 'email.org_deletion_scheduled.subject', 'email.org_deletion_scheduled.body', {
        actor: await actorName(org),
      });
      analytics.capture(
        'org_deletion_scheduled',
        { members: await organizations.countActiveMembers(org.ctx) },
        { userId: principal.userId, orgId: org.organization.id },
      );
      return toDto({ ...org, organization: updated });
    },

    async cancelDeletion(principal: Principal, slug: string, ip: string | null): Promise<Organization> {
      const org = await ownerAccess(principal, slug, 'org.delete');
      const scheduled = org.organization.deletion_scheduled_at;
      if (!scheduled) throw new AppError('organization.deletion_not_scheduled', 409, { slug });

      const updated = await inTransaction(async repos => {
        const row = await repos.organizations.cancelDeletion(org.ctx);
        if (!row) throw new AppError('organization.deletion_not_scheduled', 409, { slug });
        await repos.activity.record(org.ctx, {
          actor_id: principal.userId,
          kind: 'deletion_cancelled',
          target_type: 'organization',
          target_id: String(org.organization.id),
          old_value: { slug: row.slug, deletes_at: deletesAt(org.organization).toISOString() },
          ip,
        });
        return row;
      });

      await mailAdmins(org.ctx, updated, 'email.org_deletion_cancelled.subject', 'email.org_deletion_cancelled.body', {
        actor: await actorName(org),
      });
      const daysLeft = Math.max(0, Math.ceil((scheduled.getTime() + GRACE_MS - Date.now()) / DAY_MS));
      analytics.capture(
        'org_deletion_cancelled',
        { days_left: daysLeft },
        { userId: principal.userId, orgId: org.organization.id },
      );
      return toDto({ ...org, organization: updated });
    },

    /** Hourly: one reminder per request, once the deadline is within a day. */
    async remindDeletions(now = new Date()): Promise<number> {
      const due = await organizations.listDeletionReminderDue(sys, new Date(now.getTime() - GRACE_MS + DAY_MS));
      let sent = 0;
      for (const org of due) {
        const ctx = tenantContext(org.id);
        if (!(await organizations.markDeletionReminded(ctx, now))) continue;
        await mailAdmins(ctx, org, 'email.org_deletion_reminder.subject', 'email.org_deletion_reminder.body');
        sent++;
      }
      return sent;
    },

    /**
     * Hourly: every organisation past its grace period. The stamp comes first, so nobody can
     * reach it (or upload into it) while its files go; then each platform object before its
     * row; then everything else it owns. A customer's own bucket is never touched. A failure
     * leaves members behind, and the next run resumes there.
     */
    async deleteDue(now = new Date()): Promise<number> {
      const cutoff = new Date(now.getTime() - GRACE_MS);
      let deleted = 0;
      for (const due of await organizations.listDeletionDue(sys, cutoff)) {
        const ctx = tenantContext(due.id);
        try {
          const recipients = await organizations.listAdmins(ctx);
          if (!due.deleted_at) {
            const projectIds = await projects.listIds(ctx);
            const stamped = await inTransaction(async repos => {
              if (!(await repos.organizations.markDeleted(ctx, cutoff, now))) return false;
              await repos.oneTimeTokens.deleteTransfers(ctx);
              return true;
            });
            if (!stamped) continue;
            const cleared = await sessions.clearCurrentOrg(ctx);
            await auth.invalidateMany(cleared.map(r => r.id));
            await tokens.revokeConfinedTo(sys, projectIds);
          }

          let objects = 0;
          for (;;) {
            const batch = await attachments.listForOrg(ctx, ORG_DELETE_BATCH);
            if (batch.length === 0) break;
            const platform = batch.filter(row => row.storage_target === 'platform');
            await stores.deleteObjects(ctx, platform);
            objects += platform.length;
            await attachments.hardDelete(
              ctx,
              batch.map(row => row.id),
            );
          }
          const transferKeys = [...(await deps.importJobs.objectKeys(ctx)), ...(await deps.exportJobs.objectKeys(ctx))];
          await stores.deleteObjects(
            ctx,
            transferKeys.map(object_key => ({ storage_target: 'platform', storage_location_id: null, object_key })),
          );
          objects += transferKeys.length;
          const counts = await inTransaction(repos => repos.organizationPurge.purgeContents(ctx));

          await mailAdmins(ctx, due, 'email.org_deleted.subject', 'email.org_deleted.body', {}, recipients);
          analytics.capture('org_deleted', { ...counts, objects_deleted: objects }, { orgId: due.id });
          deleted++;
        } catch (error) {
          // One organisation's storage outage must not hold back every other deletion.
          analytics.captureException(error, { org_id: due.id });
        }
      }
      return deleted;
    },

    async getTransfer(principal: Principal, slug: string): Promise<OwnershipTransfer | null> {
      const org = await ownerAccess(principal, slug, 'org.transfer_ownership');
      const row = await oneTimeTokens.findLiveTransfer(org.ctx);
      return row ? transferDto(org.organization, row) : null;
    },

    async initiateTransfer(
      principal: Principal,
      slug: string,
      input: InitiateOwnershipTransfer,
    ): Promise<OwnershipTransfer> {
      const org = await ownerAccess(principal, slug, 'org.transfer_ownership');
      if (org.organization.deletion_scheduled_at) throw new AppError('organization.deletion_scheduled', 409, { slug });
      const username = parseUsername(input.username) ?? input.username;
      const target = await organizations.findMemberByUsername(org.ctx, username);
      if (!target) throw new AppError('member.not_found', 404, { username: `@${username}` }, 'username');
      if (target.user.id === org.organization.owner_user_id) {
        throw new AppError('ownership_transfer.already_owner', 400, {}, 'username');
      }
      if (target.user.deactivated_at || target.user.deleted_at || !target.user.email_verified_at) {
        throw new AppError('ownership_transfer.ineligible', 400, { username: `@${username}` }, 'username');
      }
      await twoFactor.stepUp(principal, input);

      const { token, token_hash } = issueOneTimeToken();
      const { row, replaced } = await inTransaction(async repos => {
        await lockAsOwner(repos, org.ctx, principal.userId);
        const dropped = await repos.oneTimeTokens.deleteTransfers(org.ctx);
        const created = await repos.oneTimeTokens.create(sys, {
          user_id: target.user.id,
          purpose: 'ownership_transfer',
          token_hash,
          org_id: org.organization.id,
          created_by: principal.userId,
          expires_at: new Date(Date.now() + ONE_TIME_TOKEN_TTL_SECONDS.ownership_transfer * 1000),
        });
        return { row: created, replaced: dropped.length > 0 };
      });

      const owner = await organizations.findMemberByUserId(org.ctx, principal.userId);
      const ownerName = owner?.user.name ?? org.membership.username;
      await notify.send({
        to: target.user.email,
        subject: 'email.ownership_offered.subject',
        body: 'email.ownership_offered.body',
        params: {
          name: target.user.name,
          owner: ownerName,
          org: org.organization.name,
          url: `${appBaseUrl}/transfer/${token}`,
        },
      });
      if (owner) {
        await notify.send({
          to: owner.user.email,
          subject: 'email.ownership_offer_sent.subject',
          body: 'email.ownership_offer_sent.body',
          params: { name: owner.user.name, target: target.user.name, org: org.organization.name, url: dangerUrl },
        });
      }
      analytics.capture(
        'ownership_transfer_started',
        { replaced },
        { userId: principal.userId, orgId: org.organization.id },
      );
      return transferDto(org.organization, row);
    },

    async cancelTransfer(principal: Principal, slug: string): Promise<Acknowledgement> {
      const org = await ownerAccess(principal, slug, 'org.transfer_ownership');
      const row = await inTransaction(async repos => {
        await lockAsOwner(repos, org.ctx, principal.userId);
        const [dropped] = await repos.oneTimeTokens.deleteTransfers(org.ctx);
        return dropped;
      });
      if (!row) throw new AppError('ownership_transfer.not_found', 404, { slug });
      const target = await organizations.findMemberByUserId(org.ctx, row.user_id, { includeRemoved: true });
      if (target) {
        await notify.send({
          to: target.user.email,
          subject: 'email.ownership_offer_cancelled.subject',
          body: 'email.ownership_offer_cancelled.body',
          params: { name: target.user.name, owner: await actorName(org), org: org.organization.name },
        });
      }
      return { ok: true };
    },

    async previewTransfer(principal: Principal, token: string): Promise<OwnershipTransfer> {
      const { row, org } = await openTransfer(principal, token);
      return transferDto(org, row);
    },

    async acceptTransfer(principal: Principal, token: string, ip: string | null): Promise<Organization> {
      const { row, org, ctx, target } = await openTransfer(principal, token);
      const from = await organizations.findMemberByUserId(ctx, row.created_by!, { includeRemoved: true });

      await inTransaction(async repos => {
        const locked = await repos.organizations.lockById(ctx);
        if (!locked || locked.owner_user_id !== row.created_by) {
          throw new AppError('ownership_transfer.invalid', 400, {}, 'token');
        }
        if (!(await repos.oneTimeTokens.consume(sys, row.id))) {
          throw new AppError('ownership_transfer.invalid', 400, {}, 'token');
        }
        await repos.organizations.setOwner(ctx, target.user.id);
        // The Owner is not a role value; the new one holds org_admin like every Owner, and the old one keeps it.
        if (target.membership.role !== 'org_admin') {
          await repos.organizations.updateMember(ctx, target.user.id, { role: 'org_admin' });
        }
        await repos.activity.record(ctx, {
          actor_id: target.user.id,
          kind: 'ownership_transferred',
          target_type: 'organization',
          target_id: String(org.id),
          old_value: { owner: from?.membership.username ?? null },
          new_value: { owner: target.membership.username },
          ip,
        });
      });

      for (const [person, subject, body, other] of [
        [target, 'email.ownership_received.subject', 'email.ownership_received.body', from?.user.name ?? ''],
        [from, 'email.ownership_handed_over.subject', 'email.ownership_handed_over.body', target.user.name],
      ] as const) {
        if (!person) continue;
        await notify.send({
          to: person.user.email,
          subject,
          body,
          params: { name: person.user.name, other, org: org.name, url: `${appBaseUrl}/organization` },
        });
      }
      analytics.capture(
        'ownership_transferred',
        { seconds_to_accept: Math.max(0, (Date.now() - row.created_at.getTime()) / 1000) },
        { userId: target.user.id, orgId: org.id },
      );
      return toDto(await access.org(principal, org.slug));
    },

    async declineTransfer(principal: Principal, token: string): Promise<Acknowledgement> {
      const { row, org, ctx, target } = await openTransfer(principal, token);
      await oneTimeTokens.deleteTransfers(ctx);
      const from = await organizations.findMemberByUserId(ctx, row.created_by!, { includeRemoved: true });
      if (from) {
        await notify.send({
          to: from.user.email,
          subject: 'email.ownership_offer_declined.subject',
          body: 'email.ownership_offer_declined.body',
          params: { name: from.user.name, target: target.user.name, org: org.name, url: dangerUrl },
        });
      }
      return { ok: true };
    },
  };
}

export type OrganizationLifecycleService = ReturnType<typeof organizationLifecycleService>;

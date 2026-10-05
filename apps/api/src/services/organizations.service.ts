import { ORG_DELETION_GRACE_DAYS } from '@nothingleft/types';
import type {
  CreateOrganization,
  Organization,
  OrgPlan,
  OrgRole,
  Principal,
  UpdateOrganization,
} from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type OrganizationRow,
  type OrganizationsRepository,
  type OrgMemberRow,
  type OrgStorageConfigsRepository,
  type UsersRepository,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { generateOrganizationSlug, parseOrganizationSlug, usernameFromEmail } from '@nothingleft/format';
import { AppError } from '@lib/errors';
import { organizationMarkUrl } from '@lib/avatar';
import type { AccessService, OrgAccess } from '@services/access';
import { bringYourOwnState } from '@services/object-stores';
import type { SessionsService } from '@services/sessions.service';
import type { InTenantTransaction } from '@services/transaction';

export interface OrganizationsDeps {
  organizations: OrganizationsRepository;
  users: UsersRepository;
  storageConfigs: OrgStorageConfigsRepository;
  access: AccessService;
  sessions: SessionsService;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
}

type OrganizationSettings = Pick<
  OrganizationRow,
  'name' | 'slug' | 'workday_minutes' | 'workweek_days' | 'week_starts_on'
>;

export function organizationsService(deps: OrganizationsDeps) {
  const { organizations, users, access, sessions, inTransaction, analytics } = deps;
  const sys = systemContext('organisation slugs and account verification are global');

  async function toDto(organization: OrganizationRow, membership: OrgMemberRow): Promise<Organization> {
    const ctx = tenantContext(organization.id, membership.user_id);
    const [owner, used, storageConfig] = await Promise.all([
      organizations.findMemberByUserId(ctx, organization.owner_user_id, { includeRemoved: true }),
      organizations.countActiveMembers(ctx),
      deps.storageConfigs.find(ctx),
    ]);
    if (!owner) throw new Error(`organisation ${organization.id} has no owner membership`);
    return {
      slug: organization.slug,
      name: organization.name,
      avatar_url: organizationMarkUrl(organization.name),
      plan: organization.plan as OrgPlan,
      owner: access.memberRef(owner.user, owner.membership),
      workday_minutes: organization.workday_minutes,
      workweek_days: organization.workweek_days,
      week_starts_on: organization.week_starts_on,
      seats: access.seats(organization.plan as OrgPlan, used),
      storage: access.storageUsage(organization, bringYourOwnState(storageConfig)),
      membership: {
        username: membership.username,
        org_role: membership.role as OrgRole,
        is_owner: organization.owner_user_id === membership.user_id,
      },
      deletion: organization.deletion_scheduled_at
        ? {
            scheduled_at: organization.deletion_scheduled_at.toISOString(),
            deletes_at: new Date(
              organization.deletion_scheduled_at.getTime() + ORG_DELETION_GRACE_DAYS * 86_400_000,
            ).toISOString(),
          }
        : null,
      created_at: organization.created_at.toISOString(),
      updated_at: organization.updated_at.toISOString(),
    };
  }

  async function resolveSlug(input: { name: string; slug?: string | undefined }): Promise<string> {
    if (input.slug !== undefined) {
      const slug = parseOrganizationSlug(input.slug);
      if (!slug) throw new AppError('organization.slug_invalid', 400, {}, 'slug');
      if (await organizations.slugTaken(sys, slug))
        throw new AppError('organization.slug_taken', 409, { slug }, 'slug');
      return slug;
    }
    const base = generateOrganizationSlug(input.name);
    if (!base) throw new AppError('organization.slug_required', 400, {}, 'slug');
    const taken = new Set(await organizations.listSlugsWithPrefix(sys, base));
    return generateOrganizationSlug(input.name, taken) ?? base;
  }

  return {
    toDto: (org: OrgAccess) => toDto(org.organization, org.membership),

    async assertVerified(userId: number): Promise<void> {
      const user = await users.findById(sys, userId);
      if (!user?.email_verified_at) throw new AppError('auth.email_unverified', 403);
    },

    async create(principal: Principal, input: CreateOrganization, ip: string | null): Promise<Organization> {
      await this.assertVerified(principal.userId);
      const user = await users.findById(sys, principal.userId);
      if (!user) throw AppError.unauthorized();
      const slug = await resolveSlug(input);

      const { organization, membership } = await inTransaction(async repos => {
        const organization = await repos.organizations.create(sys, {
          name: input.name,
          slug,
          owner_user_id: user.id,
        });
        const ctx = tenantContext(organization.id, user.id);
        const membership = await repos.organizations.addMember(ctx, {
          user_id: user.id,
          username: usernameFromEmail(user.email),
          role: 'org_admin',
        });
        await repos.activity.record(ctx, {
          actor_id: user.id,
          kind: 'member_joined',
          target_type: 'member',
          target_id: String(user.id),
          new_value: { username: membership.username, org_role: 'org_admin', via: 'created_organization' },
          ip,
        });
        return { organization, membership };
      });

      await sessions.enterOrganization(principal, organization.id);
      analytics.capture('organization_created', {}, { userId: user.id, orgId: organization.id });
      return toDto(organization, membership);
    },

    async list(principal: Principal): Promise<Organization[]> {
      const rows = await organizations.listForUser(sys, principal.userId);
      return Promise.all(rows.map(r => toDto(r.organization, r.membership)));
    },

    async get(principal: Principal, slug: string): Promise<Organization> {
      const org = await access.org(principal, slug);
      return toDto(org.organization, org.membership);
    },

    async update(
      principal: Principal,
      slug: string,
      input: UpdateOrganization,
      ip: string | null,
    ): Promise<Organization> {
      const org = await access.org(principal, slug);
      access.require(principal, 'org.update', org.scope);

      const patch: Partial<OrganizationSettings> = {};
      if (input.slug !== undefined) {
        const next = parseOrganizationSlug(input.slug);
        if (!next) throw new AppError('organization.slug_invalid', 400, {}, 'slug');
        if (next !== org.organization.slug) {
          if (await organizations.slugTaken(sys, next)) {
            throw new AppError('organization.slug_taken', 409, { slug: next }, 'slug');
          }
          patch.slug = next;
        }
      }
      if (input.name !== undefined && input.name !== org.organization.name) patch.name = input.name;
      for (const field of ['workday_minutes', 'workweek_days', 'week_starts_on'] as const) {
        const value = input[field];
        if (value !== undefined && value !== org.organization[field]) patch[field] = value;
      }
      if (Object.keys(patch).length === 0) return toDto(org.organization, org.membership);

      const updated = await inTransaction(async repos => {
        const row = await repos.organizations.update(org.ctx, patch);
        if (!row) throw new AppError('organization.not_found', 404, { slug }, 'slug');
        const before = Object.fromEntries(Object.keys(patch).map(k => [k, org.organization[k as keyof typeof patch]]));
        await repos.activity.record(org.ctx, {
          actor_id: principal.userId,
          kind: 'org_settings_changed',
          target_type: 'organization',
          target_id: String(org.organization.id),
          old_value: before,
          new_value: patch,
          ip,
        });
        return row;
      });
      return toDto(updated, org.membership);
    },
  };
}

export type OrganizationsService = ReturnType<typeof organizationsService>;

import {
  planLimits,
  STORAGE_CRITICAL_PERCENT,
  STORAGE_WARNING_PERCENT,
  type ByoStatus,
  type StorageLevel,
  type StorageUsage,
  type MemberRef,
  type OrgPlan,
  type OrgRole,
  type Principal,
  type ProjectRole,
  type Seats,
} from '@nothingleft/types';
import {
  tenantContext,
  type OrganizationRow,
  type OrganizationsRepository,
  type OrgMemberRow,
  type ProjectMemberRow,
  type ProjectRow,
  type ProjectsRepository,
  type TenantContext,
  type UserRow,
} from '@nothingleft/db';
import type { AvatarMarks } from '@lib/avatar';
import { AppError } from '@lib/errors';
import type { Storage } from '@lib/storage';
import { can, missingScope, type Capability, type Scope } from '@services/permissions';
import type { OrgHints, TenancyService } from '@services/tenancy.service';

export interface OrgAccess {
  ctx: TenantContext;
  organization: OrganizationRow;
  membership: OrgMemberRow;
  scope: Scope;
}

export interface ProjectAccess extends OrgAccess {
  project: ProjectRow;
  /** The effective role: an org admin or the owner reads as project_admin. */
  role: ProjectRole;
}

export interface AccessDeps {
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  tenancy: TenancyService;
  storage: Storage;
  marks: AvatarMarks;
  freeSeatLimit?: number | undefined;
  freeStorageBytes?: number | undefined;
  /** Told of every organisation a request resolves, so its writes can invalidate that organisation's reports. */
  touched?: (orgId: number) => void;
  /** Told of every project a request may read, so an idempotent replay can re-check it. */
  touchedProject?: (orgId: number, projectId: number) => void;
}

/**
 * Turns a principal plus a slug or project key into a tenant context and a permission
 * scope. Anything the caller cannot read answers 404, never 403 (permissions.md rule 4).
 */
export function storageLevel(used: number, limit: number): StorageLevel {
  const percent = (used / limit) * 100;
  if (percent >= 100) return 'full';
  if (percent >= STORAGE_CRITICAL_PERCENT) return 'critical';
  if (percent >= STORAGE_WARNING_PERCENT) return 'warning';
  return 'ok';
}

/**
 * The error for a failed check: `token.scope_missing` when only the token's scopes stood in
 * the way - its owner may do this, so naming the scope discloses nothing - else `otherwise`.
 */
export function denial(
  principal: Principal,
  capability: Capability,
  scope: Scope,
  otherwise: () => AppError,
): AppError {
  const lacking = missingScope(principal, capability, scope);
  return lacking ? AppError.scopeMissing(lacking) : otherwise();
}

export function accessService({
  organizations,
  projects,
  tenancy,
  storage,
  marks,
  freeSeatLimit,
  freeStorageBytes,
  touched,
  touchedProject,
}: AccessDeps) {
  async function orgScopeFor(organization: OrganizationRow, userId: number): Promise<OrgAccess | null> {
    const ctx = tenantContext(organization.id, userId);
    const membership = await organizations.findMembership(ctx, userId);
    if (!membership) return null;
    touched?.(organization.id);
    return {
      ctx,
      organization,
      membership,
      scope: {
        orgRole: membership.role as OrgRole,
        isOwner: organization.owner_user_id === userId,
        projectRole: null,
      },
    };
  }

  function assertReadable(principal: Principal, access: OrgAccess | null, slug: string): OrgAccess {
    if (!access || !can(principal, 'org.read', access.scope)) {
      throw access
        ? denial(
            principal,
            'org.read',
            access.scope,
            () => new AppError('organization.not_found', 404, { slug }, 'slug'),
          )
        : new AppError('organization.not_found', 404, { slug }, 'slug');
    }
    return access;
  }

  const projectNotFound = (key: string) => new AppError('project.not_found', 404, { key }, 'key');

  async function projectAccessFor(
    principal: Principal,
    org: OrgAccess,
    project: ProjectRow | undefined,
    key: string,
  ): Promise<ProjectAccess> {
    if (!project) throw projectNotFound(key);
    return decideProject(
      principal,
      org,
      project,
      await projects.findMember(org.ctx, project.id, principal.userId),
      key,
    );
  }

  function decideProject(
    principal: Principal,
    org: OrgAccess,
    project: ProjectRow,
    explicit: ProjectMemberRow | undefined,
    key: string,
  ): ProjectAccess {
    const notFound = () => projectNotFound(key);
    const scope: Scope = {
      ...org.scope,
      projectRole: (explicit?.role as ProjectRole | undefined) ?? null,
      projectId: project.id,
    };
    if (!can(principal, 'project.read', scope)) throw denial(principal, 'project.read', scope, notFound);
    touchedProject?.(org.organization.id, project.id);
    const elevated = scope.isOwner || scope.orgRole === 'org_admin';
    return { ...org, scope, project, role: elevated ? 'project_admin' : (scope.projectRole as ProjectRole) };
  }

  const storageLimit = (plan: OrgPlan): number =>
    planLimits(plan, freeStorageBytes === undefined ? {} : { storage_bytes: freeStorageBytes }).storage_bytes;

  const avatarUrl = (user: Pick<UserRow, 'name' | 'avatar_url' | 'avatar_object_key'>): string =>
    user.avatar_object_key ? storage.publicUrl(user.avatar_object_key) : (user.avatar_url ?? marks.person(user.name));

  return {
    avatarUrl,
    marks,

    /** A null membership is someone who left no row in this organisation; they render as former too. */
    memberRef(
      user: Pick<UserRow, 'name' | 'avatar_url' | 'avatar_object_key' | 'deactivated_at' | 'deleted_at'>,
      membership: Pick<OrgMemberRow, 'username' | 'removed_at'> | null,
    ): MemberRef {
      return {
        username: membership?.username ?? '',
        name: user.name,
        avatar_url: avatarUrl(user),
        former_member: membership === null || membership.removed_at !== null,
        deactivated: user.deactivated_at !== null || user.deleted_at !== null,
      };
    },

    storageLimit,

    /** With a verified bucket of their own, nothing counts against the quota, so the level never rises. */
    storageUsage(
      organization: Pick<OrganizationRow, 'plan' | 'storage_used_bytes'>,
      bringYourOwn: ByoStatus | null,
    ): StorageUsage {
      const limit = storageLimit(organization.plan as OrgPlan);
      const used = organization.storage_used_bytes;
      return {
        used_bytes: used,
        limit_bytes: limit,
        level: bringYourOwn === 'verified' ? 'ok' : storageLevel(used, limit),
        configured: storage.private !== null || bringYourOwn === 'verified',
        bring_your_own: bringYourOwn,
      };
    },

    seats(plan: OrgPlan, used: number): Seats {
      const free = planLimits(plan, freeSeatLimit === undefined ? {} : { seats: freeSeatLimit }).seats;
      return { used, free, over: free === null ? 0 : Math.max(0, used - free) };
    },

    async org(principal: Principal, slug: string): Promise<OrgAccess> {
      const organization = await organizations.findBySlug(
        { kind: 'system', reason: 'an organisation is addressed by its global slug' },
        slug,
      );
      const access = organization ? await orgScopeFor(organization, principal.userId) : null;
      return assertReadable(principal, access, slug);
    },

    async orgById(principal: Principal, orgId: number): Promise<OrgAccess> {
      const organization = await organizations.findById(tenantContext(orgId, principal.userId));
      const access = organization ? await orgScopeFor(organization, principal.userId) : null;
      return assertReadable(principal, access, organization?.slug ?? '');
    },

    /** The organisation a project-shaped request acts in - docs/auth-and-tenancy.md#current-organisation. */
    async current(principal: Principal, hints: OrgHints = {}): Promise<OrgAccess> {
      const ctx = await tenancy.resolve(principal, hints);
      return this.orgById(principal, ctx.orgId);
    },

    async project(principal: Principal, key: string, hints: OrgHints = {}): Promise<ProjectAccess> {
      const org = await this.current(principal, { ...hints, projectKey: key });
      return projectAccessFor(principal, org, await projects.findByKey(org.ctx, key), key);
    },

    /** Several keys in the organisation the first resolves to; each key, in order, fails as `project` then `require` would. */
    async projects(
      principal: Principal,
      keys: readonly string[],
      hints: OrgHints = {},
      capability?: Capability,
    ): Promise<ProjectAccess[]> {
      if (keys.length === 0) return [];
      const org = await this.current(principal, { ...hints, projectKey: keys[0] });
      const rows = new Map((await projects.findByKeys(org.ctx, keys)).map(p => [p.key, p]));
      const members = await projects.findMembers(
        org.ctx,
        [...rows.values()].map(p => p.id),
        principal.userId,
      );
      const memberOf = new Map(members.map(m => [m.project_id, m]));
      return keys.map(key => {
        const project = rows.get(key);
        if (!project) throw projectNotFound(key);
        const one = decideProject(principal, org, project, memberOf.get(project.id), key);
        if (capability) this.require(principal, capability, one.scope);
        return one;
      });
    },

    async projectById(principal: Principal, org: OrgAccess, projectId: number): Promise<ProjectAccess> {
      const project = await projects.findById(org.ctx, projectId);
      return projectAccessFor(principal, org, project, project?.key ?? '');
    },

    /** For a resource the caller can already read: a denial here is an honest 403. */
    require(principal: Principal, capability: Capability, scope: Scope): void {
      if (!can(principal, capability, scope)) throw denial(principal, capability, scope, AppError.forbidden);
    },
  };
}

export type AccessService = ReturnType<typeof accessService>;

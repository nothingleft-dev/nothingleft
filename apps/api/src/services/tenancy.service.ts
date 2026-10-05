import type { Principal } from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type OrganizationsRepository,
  type ProjectsRepository,
  type SessionsRepository,
  type TenantContext,
} from '@nothingleft/db';
import { AppError } from '@lib/errors';

export interface OrgHints {
  /** `X-Organization: <slug>`, or the MCP tool's optional `org` argument. */
  slug?: string | undefined;
  /** A project key carried by the request, e.g. `PP-123` reduced to `PP`. */
  projectKey?: string | undefined;
}

export interface TenancyDeps {
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  sessions: SessionsRepository;
}

/**
 * Implements docs/auth-and-tenancy.md#current-organisation. A session carries its
 * organisation on the row; a PAT is user-level, so the organisation is resolved per
 * request and answers with candidate slugs when it cannot be.
 */
export function tenancyService({ organizations, projects, sessions }: TenancyDeps) {
  const ctx = systemContext('organisation resolution runs before any organisation is known');

  async function assertMember(userId: number, orgId: number): Promise<void> {
    const membership = await organizations.findMembership(tenantContext(orgId, userId), userId);
    if (!membership) throw AppError.notFound();
  }

  return {
    async resolve(principal: Principal, hints: OrgHints = {}): Promise<TenantContext> {
      if (principal.via === 'session') {
        if (principal.currentOrgId === null) throw new AppError('organization_ambiguous', 400);
        return tenantContext(principal.currentOrgId, principal.userId);
      }

      const memberships = await organizations.listForUser(ctx, principal.userId);
      if (memberships.length === 0) throw AppError.notFound();

      if (hints.slug) {
        const match = memberships.find(m => m.organization.slug === hints.slug);
        if (!match) throw new AppError('organization.not_found', 404, { slug: hints.slug }, 'org');
        return tenantContext(match.organization.id, principal.userId);
      }

      if (memberships.length === 1) {
        const only = memberships[0]!;
        return tenantContext(only.organization.id, principal.userId);
      }

      if (hints.projectKey) {
        const owners = await projects.listAcrossUserOrgs(ctx, principal.userId, { keys: [hints.projectKey] });
        if (owners.length === 1) return tenantContext(owners[0]!.org_id, principal.userId);
      }

      throw new AppError(
        'organization_ambiguous',
        400,
        {},
        'org',
        memberships.map(m => m.organization.slug),
      );
    },

    /**
     * Where a new session starts — docs/onboarding.md#returning-user-landing: the sole
     * membership, else the one most recently worked in, else the oldest. Null with none.
     */
    async defaultOrganizationFor(userId: number): Promise<number | null> {
      const memberships = await organizations.listForUser(ctx, userId);
      if (memberships.length === 0) return null;
      const live = new Set(memberships.map(m => m.organization.id));
      if (live.size > 1) {
        const recent = (await sessions.listForUser(ctx, userId)).find(
          r => r.session.current_org_id !== null && live.has(r.session.current_org_id),
        );
        if (recent) return recent.session.current_org_id;
      }
      return memberships[0]!.organization.id;
    },

    async findBySlugForUser(userId: number, slug: string) {
      const organization = await organizations.findBySlug(ctx, slug);
      if (!organization) throw new AppError('organization.not_found', 404, { slug }, 'slug');
      await assertMember(userId, organization.id);
      return organization;
    },
  };
}

export type TenancyService = ReturnType<typeof tenancyService>;

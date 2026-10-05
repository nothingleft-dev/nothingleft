import type { Organization } from '@nothingleft/types';
import { ToolError } from './errors.ts';
import type { ToolContext } from './tool.ts';

/**
 * Org-shaped REST paths carry the slug, so the tool resolves it the way the API resolves a
 * PAT's organisation (auth-and-tenancy.md § Current organisation): named, else the sole one,
 * else ambiguous with the candidates listed.
 */
export async function resolveOrganization(ctx: ToolContext, slug: string | undefined): Promise<Organization> {
  const orgs = await ctx.organizations();
  const slugs = orgs.map(o => o.slug);
  if (slug) {
    const found = orgs.find(o => o.slug === slug.toLowerCase());
    if (!found) throw ToolError.local('organization.not_found', { slug }, { field: 'org', valid_values: slugs });
    return found;
  }
  if (orgs.length === 1) return orgs[0]!;
  if (orgs.length === 0) throw ToolError.local('not_found');
  throw ToolError.local('organization_ambiguous', {}, { field: 'org', valid_values: slugs });
}

export const orgRoleOf = (o: Organization) => (o.membership.is_owner ? 'owner' : o.membership.org_role);

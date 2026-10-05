import { describe, expect, test } from 'bun:test';
import type { OrganizationRow, OrgMemberRow, ProjectRow } from '@nothingleft/db';
import type { Principal } from '@nothingleft/types';
import { tenancyService, type TenancyDeps } from '@services/tenancy.service';
import { AppError } from '@lib/errors';

const org = (id: number, slug: string) => ({ id, slug, name: slug, deleted_at: null }) as OrganizationRow;
const project = (id: number, orgId: number, key: string) => ({ id, org_id: orgId, key }) as ProjectRow;

function service(orgs: OrganizationRow[], projects: ProjectRow[] = [], sessionOrgIds: (number | null)[] = []) {
  const deps: TenancyDeps = {
    organizations: {
      async listForUser() {
        return orgs.map(organization => ({ organization, membership: {} as OrgMemberRow }));
      },
      async findBySlug(_c: unknown, slug: string) {
        return orgs.find(o => o.slug === slug);
      },
      async findMembership(ctx: { orgId: number }) {
        return orgs.some(o => o.id === ctx.orgId) ? ({} as OrgMemberRow) : undefined;
      },
    } as unknown as TenancyDeps['organizations'],
    projects: {
      async listAcrossUserOrgs(_c: unknown, _u: number, by: { keys?: string[] }) {
        return projects.filter(p => by.keys?.includes(p.key));
      },
    } as unknown as TenancyDeps['projects'],
    // Most recently seen first, as the repository orders them.
    sessions: {
      async listForUser() {
        return sessionOrgIds.map(current_org_id => ({ session: { current_org_id }, organization_slug: null }));
      },
    } as unknown as TenancyDeps['sessions'],
  };
  return tenancyService(deps);
}

const session = (currentOrgId: number | null): Principal => ({
  via: 'session',
  userId: 1,
  sessionId: 1,
  currentOrgId,
});
const pat: Principal = { via: 'pat', userId: 1, tokenId: 1, scopes: ['issues:read'], projectIds: null };

describe('a session principal', () => {
  test('acts within sessions.current_org_id', async () => {
    const ctx = await service([org(7, 'sh')]).resolve(session(7));
    expect(ctx).toMatchObject({ kind: 'tenant', orgId: 7, userId: 1 });
  });

  test('with no current organisation cannot resolve one', async () => {
    expect(service([org(7, 'sh')]).resolve(session(null))).rejects.toThrow('Name the organisation');
  });
});

describe('a PAT principal resolves per request', () => {
  test('uses the X-Organization slug when sent', async () => {
    const ctx = await service([org(7, 'sh'), org(8, 'cc')]).resolve(pat, { slug: 'cc' });
    expect(ctx.orgId).toBe(8);
  });

  test('a slug outside the token owner’s memberships is 404', async () => {
    const attempt = service([org(7, 'sh')]).resolve(pat, { slug: 'elsewhere' });
    expect(attempt).rejects.toThrow('No organisation with slug elsewhere.');
  });

  test('falls through to the single membership', async () => {
    const ctx = await service([org(7, 'sh')]).resolve(pat);
    expect(ctx.orgId).toBe(7);
  });

  test('uses a project key that is unique across the memberships', async () => {
    const svc = service([org(7, 'sh'), org(8, 'cc')], [project(1, 8, 'PP')]);
    expect((await svc.resolve(pat, { projectKey: 'PP' })).orgId).toBe(8);
  });

  test('a key present in two organisations stays ambiguous', async () => {
    const svc = service([org(7, 'sh'), org(8, 'cc')], [project(1, 7, 'PP'), project(2, 8, 'PP')]);
    expect(svc.resolve(pat, { projectKey: 'PP' })).rejects.toThrow('Name the organisation');
  });

  test('ambiguity answers with the candidate slugs so a retry can succeed', async () => {
    const svc = service([org(7, 'sh'), org(8, 'cc')]);
    try {
      await svc.resolve(pat);
      throw new Error('expected a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error as AppError).toMatchObject({
        code: 'organization_ambiguous',
        status: 400,
        field: 'org',
        validValues: ['sh', 'cc'],
      });
    }
  });

  test('a token whose owner belongs to nothing is 404, never 403', async () => {
    const attempt = service([]).resolve(pat);
    expect(attempt).rejects.toThrow('The requested resource was not found.');
  });
});

describe('findBySlugForUser', () => {
  test('returns the organisation when the caller is a member', async () => {
    expect((await service([org(7, 'sh')]).findBySlugForUser(1, 'sh')).id).toBe(7);
  });

  test('an unknown slug is 404', async () => {
    expect(service([org(7, 'sh')]).findBySlugForUser(1, 'nope')).rejects.toThrow('No organisation with slug nope.');
  });
});

describe('defaultOrganizationFor', () => {
  test('null with no memberships, so a fresh account goes to the welcome flow', async () => {
    expect(await service([]).defaultOrganizationFor(1)).toBeNull();
  });

  test('the sole membership', async () => {
    expect(await service([org(3, 'solo')], [], [null]).defaultOrganizationFor(1)).toBe(3);
  });

  test('with several, the one most recently worked in that the user still belongs to', async () => {
    expect(await service([org(1, 'a'), org(2, 'b')], [], [null, 9, 2, 1]).defaultOrganizationFor(1)).toBe(2);
  });

  test('with several and no history, the oldest membership', async () => {
    expect(await service([org(1, 'a'), org(2, 'b')], [], [9]).defaultOrganizationFor(1)).toBe(1);
  });
});

import { describe, expect, test } from 'bun:test';
import type { PatScope, Principal } from '@nothingleft/types';
import {
  type OrganizationRow,
  type OrganizationsRepository,
  type OrgMemberRow,
  type ProjectMemberRow,
  type ProjectRow,
  type ProjectsRepository,
  type SessionsRepository,
  type TenantContext,
} from '@nothingleft/db';
import type { AvatarMarks } from '@lib/avatar';
import { AppError } from '@lib/errors';
import type { Storage } from '@lib/storage';
import { accessService, type AccessService, type ProjectAccess } from '@services/access';
import { tenancyService } from '@services/tenancy.service';

const orgs = [
  { id: 1, slug: 'acme', owner_user_id: 100 },
  { id: 2, slug: 'beta', owner_user_id: 200 },
] as OrganizationRow[];
const orgMembers = (
  [
    [1, 100, 'org_admin'],
    [1, 101, 'org_admin'],
    [1, 102, 'member'],
    [1, 103, 'member'],
    [1, 105, 'member'],
    [2, 200, 'org_admin'],
    [2, 105, 'member'],
  ] as const
).map(([org_id, user_id, role]) => ({ org_id, user_id, role, removed_at: null }) as OrgMemberRow);
const projectRows = (
  [
    [11, 1, 'AA'],
    [12, 1, 'BB'],
    [13, 1, 'CC'],
    [21, 2, 'AA'],
    [22, 2, 'DD'],
  ] as const
).map(([id, org_id, key]) => ({ id, org_id, key }) as ProjectRow);
const projectMembers = (
  [
    [1, 11, 102, 'contributor'],
    [1, 12, 102, 'observer'],
    [1, 11, 105, 'observer'],
    [2, 22, 105, 'contributor'],
  ] as const
).map(([org_id, project_id, user_id, role]) => ({ org_id, project_id, user_id, role }) as ProjectMemberRow);

function world() {
  const calls: string[] = [];
  const touched: number[] = [];
  const touchedProjects: [number, number][] = [];
  const membershipOf = (orgId: number, userId: number) =>
    orgMembers.find(m => m.org_id === orgId && m.user_id === userId);

  const organizations = {
    async findById(ctx: TenantContext) {
      return orgs.find(o => o.id === ctx.orgId);
    },
    async findMembership(ctx: TenantContext, userId: number) {
      return membershipOf(ctx.orgId, userId);
    },
    async listForUser(_ctx: unknown, userId: number) {
      return orgs.filter(o => membershipOf(o.id, userId)).map(organization => ({ organization }));
    },
  } as unknown as OrganizationsRepository;

  const projects = {
    async findByKey(ctx: TenantContext, key: string) {
      calls.push('findByKey');
      return projectRows.find(p => p.org_id === ctx.orgId && p.key === key);
    },
    async findByKeys(ctx: TenantContext, keys: readonly string[]) {
      calls.push('findByKeys');
      return projectRows.filter(p => p.org_id === ctx.orgId && keys.includes(p.key));
    },
    async findMember(ctx: TenantContext, projectId: number, userId: number) {
      calls.push('findMember');
      return projectMembers.find(m => m.org_id === ctx.orgId && m.project_id === projectId && m.user_id === userId);
    },
    async findMembers(ctx: TenantContext, projectIds: readonly number[], userId: number) {
      calls.push('findMembers');
      return projectMembers.filter(
        m => m.org_id === ctx.orgId && projectIds.includes(m.project_id) && m.user_id === userId,
      );
    },
    async listAcrossUserOrgs(_ctx: unknown, userId: number, by: { keys: string[] }) {
      return projectRows.filter(p => membershipOf(p.org_id, userId) && by.keys.includes(p.key));
    },
  } as unknown as ProjectsRepository;

  const access = accessService({
    organizations,
    projects,
    tenancy: tenancyService({ organizations, projects, sessions: {} as SessionsRepository }),
    storage: {} as Storage,
    marks: {} as AvatarMarks,
    touched: orgId => touched.push(orgId),
    touchedProject: (orgId, projectId) => touchedProjects.push([orgId, projectId]),
  });
  return { access, calls, touched, touchedProjects };
}

/** The reference: one `project` and `require` per key, later keys pinned to the first key's organisation. */
async function oneByOne(access: AccessService, principal: Principal, keys: string[]): Promise<ProjectAccess[]> {
  const found: ProjectAccess[] = [];
  for (const key of keys) {
    const one = await access.project(principal, key, found[0] ? { slug: found[0].organization.slug } : {});
    access.require(principal, 'issue.read', one.scope);
    if (found[0] && one.organization.id !== found[0].organization.id) {
      throw new AppError('project.not_found', 404, { key }, 'key');
    }
    found.push(one);
  }
  return found;
}

async function outcome(run: () => Promise<ProjectAccess[]>) {
  try {
    return {
      ok: (await run()).map(a => ({
        org: a.organization.id,
        project: a.project.id,
        role: a.role,
        scope: a.scope,
        member: a.membership.user_id,
        ctx: a.ctx,
      })),
    };
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
    return {
      error: {
        code: err.code,
        status: err.status,
        params: err.params,
        field: err.field,
        validValues: err.validValues,
        scope: err.scope,
      },
    };
  }
}

const session = (userId: number, currentOrgId: number | null = 1): Principal => ({
  via: 'session',
  userId,
  sessionId: 1,
  currentOrgId,
});
const pat = (userId: number, scopes: PatScope[], projectIds: number[] | null = null): Principal => ({
  via: 'pat',
  userId,
  tokenId: 1,
  scopes,
  projectIds,
});

const principals: [string, Principal][] = [
  ['owner', session(100)],
  ['org admin', session(101)],
  ['project member', session(102)],
  ['member of no project', session(103)],
  ['not in the organisation', session(104)],
  ['no current organisation', session(102, null)],
  ['token', pat(102, ['issues:read'])],
  ['token restricted to AA', pat(102, ['issues:read'], [11])],
  ['token without issues:read', pat(102, ['time:write'])],
  ['token of a two-organisation member', pat(105, ['issues:read'])],
  ['two-organisation token restricted to DD', pat(105, ['issues:read'], [22])],
];
const keyLists = [
  ['AA'],
  ['AA', 'BB'],
  ['BB', 'AA'],
  ['AA', 'CC'],
  ['CC', 'AA'],
  ['AA', 'ZZ'],
  ['ZZ', 'AA'],
  ['AA', 'BB', 'CC'],
  ['BB', 'CC', 'AA'],
  ['DD'],
  ['DD', 'AA'],
  ['AA', 'DD'],
];

describe('access.projects', () => {
  for (const [who, principal] of principals) {
    test(`decides every key as one project lookup at a time would: ${who}`, async () => {
      for (const keys of keyLists) {
        const before = world();
        const after = world();
        const expected = await outcome(() => oneByOne(before.access, principal, keys));
        const actual = await outcome(() => after.access.projects(principal, keys, {}, 'issue.read'));
        expect({ keys, ...actual }).toEqual({ keys, ...expected });
        expect(after.touchedProjects).toEqual(before.touchedProjects);
        expect(new Set(after.touched)).toEqual(new Set(before.touched));
      }
    });
  }

  test('a caller’s slug hint applies to every key', async () => {
    const principal = pat(105, ['issues:read']);
    for (const slug of ['acme', 'beta', 'gamma']) {
      for (const keys of keyLists) {
        const before = world();
        const after = world();
        const expected = await outcome(async () => {
          const found: ProjectAccess[] = [];
          for (const key of keys) {
            const one = await before.access.project(principal, key, { slug });
            before.access.require(principal, 'issue.read', one.scope);
            found.push(one);
          }
          return found;
        });
        const actual = await outcome(() => after.access.projects(principal, keys, { slug }, 'issue.read'));
        expect({ slug, keys, ...actual }).toEqual({ slug, keys, ...expected });
        expect(after.touchedProjects).toEqual(before.touchedProjects);
      }
    }
  });

  test('reads every project and its membership in one call each, however many keys', async () => {
    const { access, calls } = world();
    const found = await access.projects(session(101), ['AA', 'BB', 'CC'], {}, 'issue.read');
    expect(found.map(f => f.project.key)).toEqual(['AA', 'BB', 'CC']);
    expect(calls).toEqual(['findByKeys', 'findMembers']);
  });

  test('no keys resolve nothing', async () => {
    const { access, calls, touched } = world();
    expect(await access.projects(session(101), [])).toEqual([]);
    expect(calls).toEqual([]);
    expect(touched).toEqual([]);
  });
});

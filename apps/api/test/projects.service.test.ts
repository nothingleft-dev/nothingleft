import { describe, expect, test } from 'bun:test';
import { noopAnalytics } from '@nothingleft/analytics';
import type { PaletteHue, Principal } from '@nothingleft/types';
import {
  tenantContext,
  type CustomFieldRow,
  type CustomFieldsRepository,
  type OrganizationRow,
  type OrganizationsRepository,
  type OrgMemberRow,
  type ProjectRow,
  type ProjectsRepository,
  type UserRow,
} from '@nothingleft/db';
import type { AvatarMarks } from '@lib/avatar';
import type { Mailer } from '@lib/email';
import type { Storage } from '@lib/storage';
import { accessService, type OrgAccess } from '@services/access';
import { projectsService } from '@services/projects.service';
import type { TenancyService } from '@services/tenancy.service';
import type { InTenantTransaction } from '@services/transaction';

const ctx = tenantContext(1, 100);
const principal: Principal = { via: 'session', userId: 100, sessionId: 1, currentOrgId: 1 };
const org: OrgAccess = {
  ctx,
  organization: { id: 1, slug: 'acme', owner_user_id: 100 } as OrganizationRow,
  membership: { org_id: 1, user_id: 100, role: 'org_admin', removed_at: null } as OrgMemberRow,
  scope: { orgRole: 'org_admin', isOwner: true, projectRole: null },
};

const at = new Date('2026-10-13T08:00:00Z');
const project = (id: number, key: string, patch: Partial<ProjectRow> = {}) =>
  ({
    id,
    org_id: 1,
    key,
    name: key,
    slug: key.toLowerCase(),
    description_md: '',
    avatar_color: 'amber',
    avatar_initials: key,
    lead_user_id: null,
    is_archived: false,
    time_tracking_enabled: true,
    estimation_field_id: null,
    spent_time_field_id: null,
    issue_counter: 0,
    created_at: at,
    updated_at: at,
    ...patch,
  }) as ProjectRow;

const person = (id: number, username: string, removed: boolean) => ({
  membership: { org_id: 1, user_id: id, username, removed_at: removed ? at : null } as OrgMemberRow,
  user: {
    id,
    name: username,
    avatar_url: null,
    avatar_object_key: null,
    deactivated_at: null,
    deleted_at: null,
  } as UserRow,
});
const field = (id: number, projectId: number, slug: string) =>
  ({ id, project_id: projectId, slug, name: slug.toUpperCase() }) as CustomFieldRow;

function harness(rows: ProjectRow[]) {
  const leadCalls: { ids: number[]; includeRemoved: boolean | undefined }[] = [];
  const fieldCalls: number[][] = [];
  const people = [person(7, 'seven', false), person(8, 'eight', true)];
  const fields = [field(31, 1, 'estimate'), field(32, 1, 'other'), field(41, 3, 'logged'), field(42, 9, 'elsewhere')];

  const organizations = {
    async findMembersByUserIds(_ctx: unknown, ids: number[], options: { includeRemoved?: boolean } = {}) {
      leadCalls.push({ ids: [...ids].sort(), includeRemoved: options.includeRemoved });
      return people.filter(p => ids.includes(p.user.id));
    },
    async findMemberByUserId() {
      throw new Error('one lead lookup per project');
    },
  } as unknown as OrganizationsRepository;
  const customFields = {
    async listForProjects(_ctx: unknown, ids: readonly number[]) {
      fieldCalls.push([...ids].sort());
      return fields.filter(f => ids.includes(f.project_id));
    },
  } as unknown as CustomFieldsRepository;
  const projects = {
    async list() {
      return { rows: rows.map(p => ({ project: p, role: null })), total: rows.length };
    },
  } as unknown as ProjectsRepository;

  const marks = {
    person: (n: string) => `person:${n}`,
    project: (k: string, c: PaletteHue) => `project:${k}:${c}`,
  } as AvatarMarks;
  const access = {
    ...accessService({
      organizations,
      projects,
      tenancy: {} as TenancyService,
      storage: {} as Storage,
      marks,
    }),
    current: async () => org,
  };
  const service = projectsService({
    organizations,
    projects,
    customFields,
    access,
    inTransaction: (() => {
      throw new Error('a read opens no transaction');
    }) as InTenantTransaction,
    mailer: {} as Mailer,
    analytics: noopAnalytics,
    appBaseUrl: 'http://app.test',
  });
  return { service, leadCalls, fieldCalls };
}

describe('projectsService.list', () => {
  test('reads every lead and every time field of the page in one call each', async () => {
    const { service, leadCalls, fieldCalls } = harness([
      project(1, 'AA', { lead_user_id: 7, estimation_field_id: 31 }),
      project(2, 'BB', { lead_user_id: 7 }),
      project(3, 'CC', { lead_user_id: 8, spent_time_field_id: 41 }),
      project(4, 'DD', { estimation_field_id: 42 }),
      project(5, 'EE'),
    ]);
    const { data } = await service.list(principal, { limit: 50, offset: 0 });

    expect(leadCalls).toEqual([{ ids: [7, 8], includeRemoved: true }]);
    expect(fieldCalls).toEqual([[1, 3, 4]]);
    expect(data.map(p => [p.key, p.lead?.username ?? null, p.lead?.former_member ?? null])).toEqual([
      ['AA', 'seven', false],
      ['BB', 'seven', false],
      ['CC', 'eight', true],
      ['DD', null, null],
      ['EE', null, null],
    ]);
    expect(data.map(p => [p.estimation_field, p.spent_time_field])).toEqual([
      [{ slug: 'estimate', name: 'ESTIMATE' }, null],
      [null, null],
      [null, { slug: 'logged', name: 'LOGGED' }],
      [null, null],
      [null, null],
    ]);
  });

  test('a page with no leads and no time fields reads neither', async () => {
    const { service, leadCalls, fieldCalls } = harness([project(5, 'EE'), project(6, 'FF')]);
    expect((await service.list(principal, { limit: 50, offset: 0 })).data).toHaveLength(2);
    expect(leadCalls).toEqual([]);
    expect(fieldCalls).toEqual([]);
  });
});

import {
  PALETTE_HUES,
  type AddProjectMember,
  type CreateProject,
  type MemberRef,
  type OrgRole,
  type Pagination,
  type PaletteHue,
  type Principal,
  type Project,
  type ProjectMember,
  type ProjectRole,
  type UpdateProject,
} from '@nothingleft/types';
import type {
  CustomFieldRow,
  CustomFieldsRepository,
  OrganizationsRepository,
  ProjectMemberWithUser,
  ProjectRow,
  ProjectsRepository,
  UserRow,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { t } from '@nothingleft/i18n';
import { generateProjectKey, parseProjectKey, uniqueSlug } from '@nothingleft/format';
import { projectMarkUrl } from '@lib/avatar';
import { AppError } from '@lib/errors';
import { bestEffort, type Mailer } from '@lib/email';
import type { AccessService, OrgAccess, ProjectAccess } from '@services/access';
import { can, projectRolesWith } from '@services/permissions';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction } from '@services/transaction';
import { findField } from '@services/custom-field-values';

export interface ProjectsDeps {
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  customFields: CustomFieldsRepository;
  access: AccessService;
  inTransaction: InTenantTransaction;
  mailer: Mailer;
  analytics: Analytics;
  appBaseUrl: string;
}

export interface ProjectListQuery {
  archived?: boolean | undefined;
  limit: number;
  offset: number;
}

// Gray is the neutral resting state in the design system, so it is never a default identity colour.
const AVATAR_HUES = PALETTE_HUES.filter(h => h !== 'gray');

function defaultAvatarColor(key: string): PaletteHue {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_HUES[hash % AVATAR_HUES.length] as PaletteHue;
}

const avatarInitials = (key: string) => key.slice(0, 2);

type ProjectPatch = Partial<
  Pick<
    ProjectRow,
    | 'name'
    | 'key'
    | 'description_md'
    | 'avatar_color'
    | 'avatar_initials'
    | 'lead_user_id'
    | 'time_tracking_enabled'
    | 'estimation_field_id'
    | 'spent_time_field_id'
  >
>;

export function projectsService(deps: ProjectsDeps) {
  const { organizations, projects, customFields, access, inTransaction, mailer, analytics, appBaseUrl } = deps;

  async function timeFieldsOf(org: OrgAccess, project: ProjectRow) {
    const ids = [project.estimation_field_id, project.spent_time_field_id].filter((id): id is number => id !== null);
    if (ids.length === 0) return { estimation_field: null, spent_time_field: null };
    const fields = await customFields.listForProjects(org.ctx, [project.id]);
    const ref = (id: number | null) => {
      const field = id === null ? undefined : fields.find(f => f.id === id);
      return field ? { slug: field.slug, name: field.name } : null;
    };
    return { estimation_field: ref(project.estimation_field_id), spent_time_field: ref(project.spent_time_field_id) };
  }

  /** A duration field of the project by slug or name, for the Estimation or Spent time; null is the built-in. */
  async function timeField(
    project: ProjectAccess,
    value: string | null,
    role: 'estimation' | 'spent_time',
  ): Promise<CustomFieldRow | null> {
    if (value === null) return null;
    const fields = await customFields.listForProjects(project.ctx, [project.project.id]);
    const field = findField(fields, value);
    const durations = fields.filter(f => f.type === 'duration' && !f.is_archived);
    if (!field || !durations.includes(field)) {
      throw new AppError(
        'custom_field.time_field_invalid',
        400,
        { field: value, role: t(`custom_field.role.${role}`) },
        role === 'estimation' ? 'estimation_field' : 'spent_time_field',
        durations.map(f => f.slug),
      );
    }
    return field;
  }
  const notify = bestEffort(mailer, error => analytics.captureException(error));

  function knowledgeBaseAbilities(principal: Principal, org: OrgAccess, project: ProjectRow, role: ProjectRole) {
    const scope = { ...org.scope, projectRole: role, projectId: project.id };
    const open = !project.is_archived;
    return {
      can_create: open && can(principal, 'article.create', scope),
      can_move: open && can(principal, 'article.reorder', scope),
    };
  }

  async function toDto(principal: Principal, org: OrgAccess, project: ProjectRow, role: ProjectRole): Promise<Project> {
    const lead = project.lead_user_id
      ? await organizations.findMemberByUserId(org.ctx, project.lead_user_id, { includeRemoved: true })
      : undefined;
    return {
      key: project.key,
      name: project.name,
      slug: project.slug,
      description_md: project.description_md,
      avatar_color: project.avatar_color as PaletteHue,
      avatar_initials: project.avatar_initials,
      avatar_url: projectMarkUrl(project.key),
      lead: lead ? access.memberRef(lead.user, lead.membership) : null,
      is_archived: project.is_archived,
      time_tracking_enabled: project.time_tracking_enabled,
      ...(await timeFieldsOf(org, project)),
      key_editable: project.issue_counter === 0,
      my_role: role,
      knowledge_base: knowledgeBaseAbilities(principal, org, project, role),
      created_at: project.created_at.toISOString(),
      updated_at: project.updated_at.toISOString(),
    };
  }

  const memberDto = (row: ProjectMemberWithUser): ProjectMember => ({
    ...access.memberRef(row.user, row.membership),
    role: row.member.role as ProjectRole,
    org_role: row.membership.role as OrgRole,
    added_at: row.member.created_at.toISOString(),
  });

  async function taken(org: OrgAccess) {
    const rows = await projects.listKeysAndSlugs(org.ctx);
    return { keys: new Set(rows.map(r => r.key)), slugs: new Set(rows.map(r => r.slug)) };
  }

  async function suppliedKey(raw: string, name: string, keys: Set<string>): Promise<string> {
    const key = parseProjectKey(raw);
    if (!key) throw new AppError('project.key_invalid', 400, {}, 'key');
    if (keys.has(key)) {
      const suggestion = generateProjectKey(name, keys) ?? generateProjectKey(key, keys);
      throw new AppError('project.key_taken', 409, { key }, 'key', suggestion ? [suggestion] : undefined);
    }
    return key;
  }

  async function activeMember(org: OrgAccess, username: string) {
    const row = await organizations.findMemberByUsername(org.ctx, username.replace(/^@/, ''));
    if (!row) throw new AppError('member.not_found', 404, { username }, 'username');
    return row;
  }

  async function projectMember(project: ProjectAccess, username: string): Promise<ProjectMemberWithUser> {
    const org = await activeMember(project, username);
    const member = await projects.findMember(project.ctx, project.project.id, org.user.id);
    if (!member) throw new AppError('member.not_in_project', 404, { username: org.membership.username }, 'username');
    return { member, membership: org.membership, user: org.user };
  }

  async function mailProjectAdmin(project: ProjectAccess, user: UserRow, actorId: number) {
    const actor = await organizations.findMemberByUserId(project.ctx, actorId);
    await notify.send({
      to: user.email,
      subject: 'email.project_role_raised.subject',
      body: 'email.project_role_raised.body',
      params: {
        name: user.name,
        actor: actor?.user.name ?? '',
        project: project.project.name,
        org: project.organization.name,
        url: `${appBaseUrl}/projects/${project.project.key}`,
      },
    });
  }

  /** The audit log names people by username, never by internal id. */
  async function readable(org: ProjectAccess, source: ProjectPatch, changed: ProjectPatch) {
    const out: Record<string, unknown> = {};
    for (const field of Object.keys(changed) as (keyof ProjectPatch)[]) {
      if (field === 'estimation_field_id' || field === 'spent_time_field_id') {
        const id = source[field];
        const fields = id ? await customFields.listForProjects(org.ctx, [org.project.id]) : [];
        out[field === 'estimation_field_id' ? 'estimation_field' : 'spent_time_field'] =
          fields.find(f => f.id === id)?.slug ?? null;
        continue;
      }
      if (field !== 'lead_user_id') {
        out[field] = source[field];
        continue;
      }
      const id = source.lead_user_id;
      out['lead'] = id
        ? ((await organizations.findMemberByUserId(org.ctx, id, { includeRemoved: true }))?.membership.username ?? null)
        : null;
    }
    return out;
  }

  const projectMemberTarget = (projectId: number, userId: number) => `${projectId}:${userId}`;

  return {
    async list(
      principal: Principal,
      query: ProjectListQuery,
      hints: OrgHints = {},
    ): Promise<{ data: Project[]; pagination: Pagination }> {
      const org = await access.current(principal, hints);
      const elevated = org.scope.isOwner || org.scope.orgRole === 'org_admin';
      const { rows, total } = await projects.list(org.ctx, {
        memberUserId: elevated ? undefined : principal.userId,
        archived: query.archived,
        ids: principal.via === 'pat' && principal.projectIds !== null ? principal.projectIds : undefined,
        limit: query.limit,
        offset: query.offset,
      });
      const data = await Promise.all(
        rows.map(r => toDto(principal, org, r.project, elevated ? 'project_admin' : (r.role as ProjectRole))),
      );
      return {
        data,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          next_cursor: null,
          has_more: query.offset + rows.length < total,
        },
      };
    },

    async get(principal: Principal, key: string, hints: OrgHints = {}): Promise<Project> {
      const project = await access.project(principal, key, hints);
      return toDto(principal, project, project.project, project.role);
    },

    async create(
      principal: Principal,
      input: CreateProject,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<Project> {
      const org = await access.current(principal, hints);
      access.require(principal, 'project.create', org.scope);

      const existing = await taken(org);
      const key =
        input.key !== undefined
          ? await suppliedKey(input.key, input.name, existing.keys)
          : generateProjectKey(input.name, existing.keys);
      if (!key) throw new AppError('project.key_required', 400, {}, 'key');
      const slug = uniqueSlug(input.name, existing.slugs) || uniqueSlug(key, existing.slugs);

      const project = await inTransaction(async repos => {
        const row = await repos.projects.create(org.ctx, {
          key,
          name: input.name,
          slug,
          description_md: input.description_md ?? null,
          avatar_color: input.avatar_color ?? defaultAvatarColor(key),
          avatar_initials: avatarInitials(key),
          created_by: principal.userId,
        });
        await repos.schema.seed(org.ctx, row.id);
        const boardSlug = uniqueSlug(row.key, await repos.boards.slugsInOrg(org.ctx));
        await repos.boards.seed(org.ctx, row, principal.userId, boardSlug);
        // The creator is listed among the project's people even though an org admin needs no row.
        await repos.projects.addMember(org.ctx, {
          project_id: row.id,
          user_id: principal.userId,
          role: 'project_admin',
          created_by: principal.userId,
        });
        const base = { actor_id: principal.userId, ip };
        await repos.activity.record(org.ctx, {
          ...base,
          kind: 'project_created',
          target_type: 'project',
          target_id: String(row.id),
          new_value: { key: row.key, name: row.name },
        });
        await repos.activity.record(org.ctx, {
          ...base,
          kind: 'member_joined',
          target_type: 'project_member',
          target_id: projectMemberTarget(row.id, principal.userId),
          new_value: { project_key: row.key, username: org.membership.username, project_role: 'project_admin' },
        });
        return row;
      });

      analytics.capture(
        'project_created',
        { key_generated: input.key === undefined },
        { userId: principal.userId, orgId: org.organization.id },
      );
      return toDto(principal, org, project, 'project_admin');
    },

    async update(
      principal: Principal,
      key: string,
      input: UpdateProject,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<Project> {
      const project = await access.project(principal, key, hints);
      access.require(principal, 'project.update', project.scope);
      const current = project.project;
      const patch: ProjectPatch = {};

      if (input.name !== undefined && input.name !== current.name) patch.name = input.name;
      if (input.key !== undefined) {
        const parsed = parseProjectKey(input.key);
        if (!parsed) throw new AppError('project.key_invalid', 400, {}, 'key');
        if (parsed !== current.key) {
          if (current.issue_counter > 0) throw new AppError('project.key_locked', 409, { key: current.key }, 'key');
          const { keys } = await taken(project);
          patch.key = await suppliedKey(parsed, input.name ?? current.name, keys);
          if (avatarInitials(patch.key) !== current.avatar_initials) patch.avatar_initials = avatarInitials(patch.key);
        }
      }
      if (input.description_md !== undefined && input.description_md !== current.description_md) {
        patch.description_md = input.description_md;
      }
      if (input.avatar_color !== undefined && input.avatar_color !== current.avatar_color) {
        patch.avatar_color = input.avatar_color;
      }
      if (input.lead !== undefined) {
        let leadId: number | null = null;
        if (input.lead !== null) {
          const lead = await organizations.findMemberByUsername(project.ctx, input.lead.replace(/^@/, ''));
          if (!lead) throw new AppError('project.lead_not_member', 400, { username: input.lead }, 'lead');
          leadId = lead.user.id;
        }
        if (leadId !== current.lead_user_id) patch.lead_user_id = leadId;
      }
      if (input.time_tracking_enabled !== undefined && input.time_tracking_enabled !== current.time_tracking_enabled) {
        // The switch sits with the work types, which an archived project keeps as they are.
        if (current.is_archived) throw new AppError('project.archived', 409, { key: current.key });
        patch.time_tracking_enabled = input.time_tracking_enabled;
      }
      for (const [input_, column, role] of [
        [input.estimation_field, 'estimation_field_id', 'estimation'],
        [input.spent_time_field, 'spent_time_field_id', 'spent_time'],
      ] as const) {
        if (input_ === undefined) continue;
        const field = await timeField(project, input_, role);
        if ((field?.id ?? null) !== current[column]) patch[column] = field?.id ?? null;
      }
      const estimation =
        patch.estimation_field_id !== undefined ? patch.estimation_field_id : current.estimation_field_id;
      const spent = patch.spent_time_field_id !== undefined ? patch.spent_time_field_id : current.spent_time_field_id;
      if (estimation !== null && estimation === spent) {
        throw new AppError('custom_field.time_fields_same', 400, {}, 'spent_time_field');
      }
      if (Object.keys(patch).length === 0) return toDto(principal, project, current, project.role);

      const updated = await inTransaction(async repos => {
        const row = await repos.projects.update(project.ctx, current.id, patch);
        if (!row) throw new AppError('project.not_found', 404, { key }, 'key');
        await repos.activity.record(project.ctx, {
          actor_id: principal.userId,
          kind: 'project_updated',
          target_type: 'project',
          target_id: String(current.id),
          old_value: await readable(project, current, patch),
          new_value: await readable(project, patch, patch),
          ip,
        });
        return row;
      });
      if (patch.estimation_field_id !== undefined || patch.spent_time_field_id !== undefined) {
        analytics.capture(
          'time_fields_changed',
          {
            estimation: updated.estimation_field_id === null ? 'builtin' : 'custom',
            spent_time: updated.spent_time_field_id === null ? 'builtin' : 'custom',
          },
          { userId: principal.userId, orgId: project.organization.id },
        );
      }
      return toDto(principal, project, updated, project.role);
    },

    async setArchived(
      principal: Principal,
      key: string,
      archived: boolean,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<Project> {
      const project = await access.project(principal, key, hints);
      access.require(principal, 'project.archive', project.scope);
      if (project.project.is_archived === archived) return toDto(principal, project, project.project, project.role);

      const updated = await inTransaction(async repos => {
        const row = await repos.projects.update(project.ctx, project.project.id, { is_archived: archived });
        if (!row) throw new AppError('project.not_found', 404, { key }, 'key');
        await repos.activity.record(project.ctx, {
          actor_id: principal.userId,
          kind: archived ? 'project_archived' : 'project_unarchived',
          target_type: 'project',
          target_id: String(row.id),
          new_value: { key: row.key },
          ip,
        });
        return row;
      });
      return toDto(principal, project, updated, project.role);
    },

    async listAssignable(principal: Principal, key: string, hints: OrgHints = {}): Promise<MemberRef[]> {
      const project = await access.project(principal, key, hints);
      return (await projects.listAssignable(project.ctx, project.project.id)).map(r =>
        access.memberRef(r.user, r.membership),
      );
    },

    /** Who a Project Admin may log time for: anyone who could log their own time in the project. */
    async listWorkAuthors(principal: Principal, key: string, hints: OrgHints = {}): Promise<MemberRef[]> {
      const project = await access.project(principal, key, hints);
      const rows = await projects.listAssignable(project.ctx, project.project.id, {
        roles: projectRolesWith('work_item.log_own'),
      });
      return rows.map(r => access.memberRef(r.user, r.membership));
    },

    async listMembers(principal: Principal, key: string, hints: OrgHints = {}): Promise<ProjectMember[]> {
      const project = await access.project(principal, key, hints);
      return (await projects.listMembers(project.ctx, project.project.id)).map(memberDto);
    },

    async addMember(
      principal: Principal,
      key: string,
      input: AddProjectMember,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<ProjectMember> {
      const project = await access.project(principal, key, hints);
      access.require(principal, 'project.members.manage', project.scope);
      const target = await activeMember(project, input.username);
      if (await projects.findMember(project.ctx, project.project.id, target.user.id)) {
        throw new AppError('member.already_in_project', 409, { username: target.membership.username }, 'username');
      }

      const member = await inTransaction(async repos => {
        const row = await repos.projects.addMember(project.ctx, {
          project_id: project.project.id,
          user_id: target.user.id,
          role: input.role,
          created_by: principal.userId,
        });
        await repos.activity.record(project.ctx, {
          actor_id: principal.userId,
          kind: 'member_joined',
          target_type: 'project_member',
          target_id: projectMemberTarget(project.project.id, target.user.id),
          new_value: {
            project_key: project.project.key,
            username: target.membership.username,
            project_role: input.role,
          },
          ip,
        });
        return row;
      });

      if (input.role === 'project_admin') await mailProjectAdmin(project, target.user, principal.userId);
      return memberDto({ member, membership: target.membership, user: target.user });
    },

    async updateMember(
      principal: Principal,
      key: string,
      username: string,
      role: ProjectRole,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<ProjectMember> {
      const project = await access.project(principal, key, hints);
      access.require(principal, 'project.members.manage', project.scope);
      const target = await projectMember(project, username);
      if (target.member.role === role) return memberDto(target);

      const member = await inTransaction(async repos => {
        const row = await repos.projects.updateMemberRole(project.ctx, project.project.id, target.user.id, role);
        if (!row) throw new AppError('member.not_in_project', 404, { username }, 'username');
        await repos.activity.record(project.ctx, {
          actor_id: principal.userId,
          kind: 'role_changed',
          target_type: 'project_member',
          target_id: projectMemberTarget(project.project.id, target.user.id),
          old_value: {
            project_key: project.project.key,
            username: target.membership.username,
            project_role: target.member.role,
          },
          new_value: { project_key: project.project.key, username: target.membership.username, project_role: role },
          ip,
        });
        return row;
      });

      if (role === 'project_admin') await mailProjectAdmin(project, target.user, principal.userId);
      return memberDto({ ...target, member });
    },

    async removeMember(
      principal: Principal,
      key: string,
      username: string,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<ProjectMember> {
      const project = await access.project(principal, key, hints);
      access.require(principal, 'project.members.manage', project.scope);
      const target = await projectMember(project, username);

      await inTransaction(async repos => {
        const row = await repos.projects.removeMember(project.ctx, project.project.id, target.user.id);
        if (!row) throw new AppError('member.not_in_project', 404, { username }, 'username');
        await repos.activity.record(project.ctx, {
          actor_id: principal.userId,
          kind: 'member_removed',
          target_type: 'project_member',
          target_id: projectMemberTarget(project.project.id, target.user.id),
          old_value: {
            project_key: project.project.key,
            username: target.membership.username,
            project_role: target.member.role,
          },
          ip,
        });
      });
      return memberDto(target);
    },
  };
}

export type ProjectsService = ReturnType<typeof projectsService>;

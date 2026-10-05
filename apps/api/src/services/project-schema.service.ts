import {
  RESOLVED_STATUS_CATEGORIES,
  type IssueType,
  DEFAULT_LABEL_COLOR,
  type LabelColor,
  type Principal,
  type Priority,
  type ProjectSchemaTable,
  type StatusCategory,
  type WorkflowStatus,
  type WorkType,
} from '@nothingleft/types';
import type {
  IssueTypeRow,
  PriorityRow,
  ProjectSchemaRepository,
  SchemaRow,
  SchemaRows,
  WorkflowStatusRow,
  WorkTypeRow,
} from '@nothingleft/db';
import { AppError } from '@lib/errors';
import { withUniqueAs } from '@lib/pg-errors';
import type { AccessService, ProjectAccess } from '@services/access';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';

export interface ProjectSchemaDeps {
  schema: ProjectSchemaRepository;
  access: AccessService;
  inTransaction: InTenantTransaction;
}

export interface SchemaDtos {
  statuses: WorkflowStatus;
  priorities: Priority;
  types: IssueType;
  work_types: WorkType;
}

/** Everything a create or update may carry, across the four tables; the route narrows it. */
export interface SchemaValueInput {
  name?: string | undefined;
  category?: StatusCategory | undefined;
  color?: LabelColor | undefined;
  short_label?: string | undefined;
  icon?: string | null | undefined;
  position?: number | undefined;
  is_default?: true | undefined;
  is_archived?: boolean | undefined;
}

// The issue field a table feeds, for the activity rows a delete-with-move writes.
const ISSUE_FIELD: Record<Exclude<ProjectSchemaTable, 'work_types'>, string> = {
  statuses: 'status',
  priorities: 'priority',
  types: 'type',
};

const feedsIssues = (table: ProjectSchemaTable): table is Exclude<ProjectSchemaTable, 'work_types'> =>
  table !== 'work_types';

export function toSchemaDto<T extends ProjectSchemaTable>(table: T, row: SchemaRows[T]): SchemaDtos[T] {
  switch (table) {
    case 'statuses': {
      const r = row as WorkflowStatusRow;
      return {
        name: r.name,
        category: r.category as StatusCategory,
        color: r.color as LabelColor,
        short_label: r.short_label,
        position: r.position,
        is_default: r.is_default,
        is_archived: r.is_archived,
      } as SchemaDtos[T];
    }
    case 'priorities': {
      const r = row as PriorityRow;
      return {
        name: r.name,
        color: r.color as LabelColor,
        short_label: r.short_label,
        position: r.position,
        is_default: r.is_default,
      } as SchemaDtos[T];
    }
    case 'types': {
      const r = row as IssueTypeRow;
      return {
        name: r.name,
        icon: r.icon,
        color: r.color as LabelColor,
        short_label: r.short_label,
        position: r.position,
        is_default: r.is_default,
      } as SchemaDtos[T];
    }
    default: {
      const r = row as WorkTypeRow;
      return {
        name: r.name,
        short_label: r.short_label,
        position: r.position,
        is_default: r.is_default,
        is_archived: r.is_archived,
      } as SchemaDtos[T];
    }
  }
}

export const isResolvedCategory = (category: string) =>
  (RESOLVED_STATUS_CATEGORIES as readonly string[]).includes(category);

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

const NAME_KEY: Record<ProjectSchemaTable, string> = {
  statuses: 'workflow_statuses_project_lower_name_unique',
  priorities: 'priorities_project_lower_name_unique',
  types: 'issue_types_project_lower_name_unique',
  work_types: 'work_types_project_lower_name_unique',
};

export function projectSchemaService({ schema, access, inTransaction }: ProjectSchemaDeps) {
  async function writable(principal: Principal, key: string, hints: OrgHints): Promise<ProjectAccess> {
    const project = await access.project(principal, key, hints);
    access.require(principal, 'project.schema.manage', project.scope);
    if (project.project.is_archived) throw new AppError('project.archived', 409, { key: project.project.key });
    return project;
  }

  function find<T extends ProjectSchemaTable>(rows: SchemaRows[T][], name: string): SchemaRows[T] {
    const row = rows.find(r => sameName(r.name, name));
    if (!row) {
      throw new AppError(
        'config.not_found',
        404,
        { name },
        'name',
        rows.map(r => r.name),
      );
    }
    return row;
  }

  function assertNameFree(rows: SchemaRow[], name: string, except?: number) {
    if (rows.some(r => r.id !== except && sameName(r.name, name))) {
      throw new AppError('config.name_taken', 409, { name }, 'name');
    }
  }

  async function recordChange(
    repos: TenantRepos,
    project: ProjectAccess,
    actorId: number,
    table: ProjectSchemaTable,
    action: 'created' | 'updated' | 'deleted',
    before: object | null,
    after: object | null,
    ip: string | null,
  ) {
    await repos.activity.record(project.ctx, {
      actor_id: actorId,
      kind: 'schema_changed',
      target_type: 'project',
      target_id: String(project.project.id),
      old_value: before ? { project_key: project.project.key, table, action, ...before } : null,
      new_value: after ? { project_key: project.project.key, table, action, ...after } : null,
      ip,
    });
  }

  /** Renumbers the siblings 0…n-1 with `id` at `position`. */
  async function place(
    repos: TenantRepos,
    project: ProjectAccess,
    table: ProjectSchemaTable,
    id: number,
    position?: number,
  ) {
    if (position === undefined) return;
    const ids = (await repos.schema.list(project.ctx, table, project.project.id)).map(r => r.id).filter(i => i !== id);
    ids.splice(Math.min(position, ids.length), 0, id);
    await repos.schema.reorder(project.ctx, table, ids);
  }

  function fieldsFor(table: ProjectSchemaTable, input: SchemaValueInput) {
    const out: Record<string, unknown> = {};
    if (input.name !== undefined) out['name'] = input.name;
    if (input.short_label !== undefined) out['short_label'] = input.short_label.toUpperCase();
    if ((table === 'statuses' || table === 'work_types') && input.is_archived !== undefined) {
      out['is_archived'] = input.is_archived;
    }
    if (table === 'work_types') return out;
    if (input.color !== undefined) out['color'] = input.color;
    if (table === 'statuses' && input.category !== undefined) out['category'] = input.category;
    if (table === 'types' && input.icon !== undefined) out['icon'] = input.icon;
    return out;
  }

  return {
    async list<T extends ProjectSchemaTable>(
      principal: Principal,
      key: string,
      table: T,
      hints: OrgHints = {},
    ): Promise<SchemaDtos[T][]> {
      const project = await access.project(principal, key, hints);
      const rows = await schema.list(project.ctx, table, project.project.id);
      return rows.map(r => toSchemaDto(table, r));
    },

    async create<T extends ProjectSchemaTable>(
      principal: Principal,
      key: string,
      table: T,
      input: SchemaValueInput & { name: string },
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<SchemaDtos[T]> {
      const project = await writable(principal, key, hints);
      return inTransaction(async repos => {
        await repos.projects.lockById(project.ctx, project.project.id);
        const rows = await repos.schema.list(project.ctx, table, project.project.id);
        assertNameFree(rows, input.name);
        if (input.is_default) await repos.schema.clearDefault(project.ctx, table, project.project.id);
        const base = {
          name: input.name,
          position: rows.length,
          short_label: (input.short_label ?? input.name.charAt(0)).toUpperCase(),
          is_default: input.is_default === true,
          ...(table === 'work_types' ? {} : { color: input.color ?? DEFAULT_LABEL_COLOR }),
          ...(table === 'statuses' ? { category: input.category } : {}),
          ...(table === 'types' ? { icon: input.icon ?? null } : {}),
        };
        const row = await withUniqueAs(
          () => repos.schema.insert(project.ctx, table, project.project.id, base as never),
          [NAME_KEY[table]],
          () => new AppError('config.name_taken', 409, { name: input.name }, 'name'),
        );
        await place(repos, project, table, row.id, input.position);
        const [created] = await repos.schema.findByIds(project.ctx, table, [row.id]);
        const dto = toSchemaDto(table, created!);
        await recordChange(repos, project, principal.userId, table, 'created', null, dto, ip);
        return dto;
      });
    },

    async update<T extends ProjectSchemaTable>(
      principal: Principal,
      key: string,
      table: T,
      name: string,
      input: SchemaValueInput,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<SchemaDtos[T]> {
      const project = await writable(principal, key, hints);
      return inTransaction(async repos => {
        await repos.projects.lockById(project.ctx, project.project.id);
        const rows = await repos.schema.list(project.ctx, table, project.project.id);
        const current = find(rows, name);
        if (input.name !== undefined) assertNameFree(rows, input.name, current.id);
        const isDefault = 'is_default' in current && current.is_default;
        if (input.is_archived === true && isDefault) {
          throw new AppError('config.default_not_archivable', 409, { name: current.name }, 'is_archived');
        }
        if (input.is_default && !isDefault) {
          if ('is_archived' in current && current.is_archived && input.is_archived !== false) {
            throw new AppError('config.default_not_archivable', 409, { name: current.name }, 'is_default');
          }
          await repos.schema.clearDefault(project.ctx, table, project.project.id);
        }
        const patch = fieldsFor(table, input);
        if (input.is_default) patch['is_default'] = true;
        if (Object.keys(patch).length > 0) {
          await withUniqueAs(
            () => repos.schema.update(project.ctx, table, current.id, patch as never),
            [NAME_KEY[table]],
            () => new AppError('config.name_taken', 409, { name: input.name ?? current.name }, 'name'),
          );
        }
        await place(repos, project, table, current.id, input.position);

        const [updated] = await repos.schema.findByIds(project.ctx, table, [current.id]);
        const before = toSchemaDto(table, current);
        const after = toSchemaDto(table, updated!);
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          await recordChange(repos, project, principal.userId, table, 'updated', before, after, ip);
        }
        return after;
      });
    },

    async remove<T extends ProjectSchemaTable>(
      principal: Principal,
      key: string,
      table: T,
      name: string,
      moveTo: string | undefined,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<SchemaDtos[T]> {
      const project = await writable(principal, key, hints);
      return inTransaction(async repos => {
        await repos.projects.lockById(project.ctx, project.project.id);
        const rows = await repos.schema.list(project.ctx, table, project.project.id);
        const doomed = find(rows, name);
        if ('is_default' in doomed && doomed.is_default) {
          throw new AppError('config.default_not_deletable', 409, { name: doomed.name }, 'name');
        }
        if (rows.length === 1) throw new AppError('config.last_value', 409, { name: doomed.name }, 'name');

        const inUse = await repos.schema.countUsage(project.ctx, table, doomed.id);
        if (inUse > 0) {
          const targets = rows.filter(r => r.id !== doomed.id && !('is_archived' in r && r.is_archived));
          if (moveTo === undefined) {
            throw new AppError(
              'config.in_use',
              409,
              { name: doomed.name, count: inUse },
              'move_to',
              targets.map(r => r.name),
            );
          }
          const target = targets.find(r => sameName(r.name, moveTo));
          if (!target) {
            throw new AppError(
              'config.move_to_invalid',
              400,
              { name: moveTo },
              'move_to',
              targets.map(r => r.name),
            );
          }
          const moved = await repos.schema.reassign(project.ctx, table, doomed.id, target.id);
          if (feedsIssues(table)) await recordMoves(repos, project, principal.userId, table, doomed, target, moved);
        }

        await repos.schema.remove(project.ctx, table, doomed.id);
        await repos.schema.reorder(
          project.ctx,
          table,
          rows.filter(r => r.id !== doomed.id).map(r => r.id),
        );
        const dto = toSchemaDto(table, doomed);
        await recordChange(
          repos,
          project,
          principal.userId,
          table,
          'deleted',
          dto,
          moveTo ? { move_to: moveTo } : null,
          ip,
        );
        return dto;
      });
    },
  };

  // One never-coalesced history row per moved issue, and resolution follows the new status.
  async function recordMoves(
    repos: TenantRepos,
    project: ProjectAccess,
    actorId: number,
    table: Exclude<ProjectSchemaTable, 'work_types'>,
    from: SchemaRow,
    to: SchemaRow,
    issueIds: number[],
  ) {
    const changeGroupId = Bun.randomUUIDv7();
    const at = new Date();
    const resolutionFlips =
      table === 'statuses' &&
      isResolvedCategory((from as WorkflowStatusRow).category) !==
        isResolvedCategory((to as WorkflowStatusRow).category);
    for (const issueId of issueIds) {
      if (resolutionFlips) {
        await repos.issues.update(project.ctx, issueId, {
          resolved_at: isResolvedCategory((to as WorkflowStatusRow).category) ? at : null,
        });
      }
      await repos.issueActivity.record(project.ctx, {
        issue_id: issueId,
        actor_id: actorId,
        change_group_id: changeGroupId,
        kind: 'field_changed',
        field: ISSUE_FIELD[table],
        old_value: { name: from.name },
        new_value: { name: to.name },
        created_at: at,
        updated_at: at,
      });
    }
  }
}

export type ProjectSchemaService = ReturnType<typeof projectSchemaService>;

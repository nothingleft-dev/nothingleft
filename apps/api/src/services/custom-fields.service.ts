import {
  CUSTOM_FIELDS_MAX,
  CUSTOM_FIELD_OPTIONS_MAX,
  CUSTOM_FIELD_OPTION_TYPES,
  DEFAULT_LABEL_COLOR,
  viaOf,
  type CreateCustomField,
  type CreateCustomFieldOption,
  type CustomField,
  type CustomFieldConfig,
  type CustomFieldType,
  type CustomFieldValueInput,
  type LabelColor,
  type Principal,
  type UpdateCustomField,
  type UpdateCustomFieldOption,
} from '@nothingleft/types';
import type {
  CustomFieldOptionRow,
  CustomFieldRow,
  CustomFieldsRepository,
  ProjectSchemaRepository,
  ProjectsRepository,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { customFieldSlug, isCustomFieldSlug } from '@nothingleft/format';
import { t } from '@nothingleft/i18n';
import { RESERVED_ISSUE_ATTRIBUTES } from '@nothingleft/query';
import { AppError } from '@lib/errors';
import { withUniqueAs } from '@lib/pg-errors';
import type { AccessService, ProjectAccess } from '@services/access';
import {
  HISTORY_PREFIX,
  kindOf,
  loadCatalogue,
  planValue,
  snapshotOf,
  timeRoleOf,
  type FieldCatalogue,
  type ValueDeps,
} from '@services/custom-field-values';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';

export interface CustomFieldsDeps extends ValueDeps {
  access: AccessService;
  customFields: CustomFieldsRepository;
  schema: ProjectSchemaRepository;
  projects: ProjectsRepository;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const hasOptions = (type: string) => (CUSTOM_FIELD_OPTION_TYPES as readonly string[]).includes(type);

export function customFieldsService(deps: CustomFieldsDeps) {
  const { access, customFields, schema, inTransaction, analytics } = deps;

  async function readable(principal: Principal, key: string, hints: OrgHints): Promise<ProjectAccess> {
    const project = await access.project(principal, key, hints);
    access.require(principal, 'project.read', project.scope);
    return project;
  }

  async function writable(principal: Principal, key: string, hints: OrgHints): Promise<ProjectAccess> {
    const project = await access.project(principal, key, hints);
    access.require(principal, 'project.custom_fields.manage', project.scope);
    if (project.project.is_archived) throw new AppError('project.archived', 409, { key: project.project.key });
    return project;
  }

  const catalogueOf = (repo: CustomFieldsRepository, project: ProjectAccess) =>
    loadCatalogue(repo, project.ctx, [project.project.id]);

  async function toDtos(
    repo: CustomFieldsRepository,
    project: ProjectAccess,
    cat: FieldCatalogue,
    rows: CustomFieldRow[],
  ): Promise<CustomField[]> {
    const [types, counts] = await Promise.all([
      schema.list(project.ctx, 'types', project.project.id),
      repo.issueCounts(
        project.ctx,
        rows.map(f => f.id),
      ),
    ]);
    return rows.map(field => ({
      slug: field.slug,
      name: field.name,
      type: field.type as CustomFieldType,
      config: field.config as CustomFieldConfig,
      is_required: field.is_required,
      default_value: (field.default_value ?? null) as CustomFieldValueInput,
      empty_label: field.empty_label,
      applies_to: types.filter(ty => cat.appliesTo.get(field.id)?.has(ty.id)).map(ty => ty.name),
      options: (cat.options.get(field.id) ?? []).map(o => ({
        name: o.name,
        color: o.color as LabelColor,
        position: o.position,
        is_archived: o.is_archived,
      })),
      position: field.position,
      is_archived: field.is_archived,
      time_role: timeRoleOf(cat, field),
      issue_count: timeRoleOf(cat, field) === 'spent_time' ? 0 : (counts.get(field.id) ?? 0),
      created_at: field.created_at.toISOString(),
      updated_at: field.updated_at.toISOString(),
    }));
  }

  async function oneDto(repo: CustomFieldsRepository, project: ProjectAccess, fieldId: number): Promise<CustomField> {
    const cat = await catalogueOf(repo, project);
    return (
      await toDtos(
        repo,
        project,
        cat,
        cat.fields.filter(f => f.id === fieldId),
      )
    )[0]!;
  }

  function find(cat: FieldCatalogue, slugOrName: string): CustomFieldRow {
    const folded = slugOrName.toLowerCase();
    const field = cat.fields.find(f => f.slug === folded) ?? cat.fields.find(f => sameName(f.name, slugOrName));
    if (!field) {
      throw new AppError(
        'custom_field.not_found',
        404,
        { name: slugOrName },
        'slug',
        cat.fields.map(f => f.slug),
      );
    }
    return field;
  }

  function findOption(field: CustomFieldRow, options: CustomFieldOptionRow[], name: string): CustomFieldOptionRow {
    const option = options.find(o => sameName(o.name, name));
    if (!option) {
      throw new AppError(
        'custom_field.option_not_found',
        404,
        { field: field.name, name },
        'name',
        options.map(o => o.name),
      );
    }
    return option;
  }

  function checkConfig(type: string, config: CustomFieldConfig | undefined): CustomFieldConfig {
    if (!config) return {};
    const numeric = type === 'number' || type === 'integer';
    const invalid = (key: 'min_max' | 'not_numeric' | 'decimals') =>
      new AppError('custom_field.config_invalid', 400, { detail: t(`custom_field.config.${key}`) }, 'config');
    if ((config.min !== undefined || config.max !== undefined) && !numeric) throw invalid('not_numeric');
    if (config.decimals !== undefined && type !== 'number') throw invalid('decimals');
    if (config.min !== undefined && config.max !== undefined && config.min > config.max) throw invalid('min_max');
    return config;
  }

  async function typeIdsOf(project: ProjectAccess, names: readonly string[]): Promise<number[]> {
    const types = await schema.list(project.ctx, 'types', project.project.id);
    return names.map(name => {
      const type = types.find(ty => sameName(ty.name, name));
      if (!type) {
        throw new AppError(
          'issue.unknown_type',
          400,
          { type: name, project: project.project.key },
          'applies_to',
          types.map(ty => ty.name),
        );
      }
      return type.id;
    });
  }

  async function checkSlug(repos: TenantRepos, project: ProjectAccess, slug: string, type: string) {
    if (!isCustomFieldSlug(slug)) throw new AppError('custom_field.slug_invalid', 400, { slug }, 'slug');
    if (RESERVED_ISSUE_ATTRIBUTES.has(slug)) throw new AppError('custom_field.slug_reserved', 400, { slug }, 'slug');
    const sameSlug = await repos.customFields.findBySlugAcrossOrg(project.ctx, slug);
    if (sameSlug.some(f => f.project_id === project.project.id)) {
      throw new AppError('custom_field.slug_taken', 409, { slug }, 'slug');
    }
    const clash = sameSlug.find(f => kindOf(f) !== kindOf({ type }));
    if (clash) {
      const other = await repos.projects.findById(project.ctx, clash.project_id);
      throw new AppError(
        'custom_field.slug_conflict',
        409,
        { slug, kind: t(`custom_field.kind.${kindOf(clash)}`), project: other?.key ?? '' },
        'slug',
      );
    }
  }

  /** A default is stored in its input form, and must be a value the field would accept now. */
  async function checkDefault(project: ProjectAccess, field: CustomFieldRow, options: CustomFieldOptionRow[]) {
    if (field.default_value === null || field.default_value === undefined) return;
    try {
      await planValue(
        deps,
        {
          ctx: project.ctx,
          projectId: project.project.id,
          projectKey: project.project.key,
          calendar: {
            workdayMinutes: project.organization.workday_minutes,
            workweekDays: project.organization.workweek_days,
          },
        },
        field,
        options,
        field.default_value as CustomFieldValueInput,
      );
    } catch (err) {
      if (err instanceof AppError)
        throw new AppError(err.code, err.status, err.params, 'default_value', err.validValues);
      throw err;
    }
  }

  function assertOptionNames(field: CustomFieldRow, names: readonly string[], existing: CustomFieldOptionRow[] = []) {
    const seen = new Set(existing.map(o => o.name.toLowerCase()));
    for (const name of names) {
      if (seen.has(name.toLowerCase())) {
        throw new AppError('custom_field.option_name_taken', 409, { field: field.name, name }, 'options');
      }
      seen.add(name.toLowerCase());
    }
    if (seen.size > CUSTOM_FIELD_OPTIONS_MAX) {
      throw new AppError('custom_field.options_limit', 409, { max: CUSTOM_FIELD_OPTIONS_MAX }, 'options');
    }
  }

  async function record(
    repos: TenantRepos,
    project: ProjectAccess,
    principal: Principal,
    field: Pick<CustomFieldRow, 'id' | 'slug' | 'name'>,
    action: string,
    before: object | null,
    after: object | null,
    ip: string | null,
  ) {
    const base = { project_key: project.project.key, slug: field.slug, name: field.name, action };
    await repos.activity.record(project.ctx, {
      actor_id: principal.userId,
      kind: 'custom_field_changed',
      target_type: 'custom_field',
      target_id: String(field.id),
      old_value: before ? { ...base, ...before } : null,
      new_value: after ? { ...base, ...after } : null,
      ip,
    });
  }

  async function place(repos: TenantRepos, project: ProjectAccess, id: number, position?: number) {
    if (position === undefined) return;
    const ids = (await repos.customFields.listForProjects(project.ctx, [project.project.id]))
      .map(f => f.id)
      .filter(i => i !== id);
    ids.splice(Math.min(position, ids.length), 0, id);
    await repos.customFields.reorder(project.ctx, ids);
  }

  async function placeOption(
    repos: TenantRepos,
    project: ProjectAccess,
    fieldId: number,
    id: number,
    position?: number,
  ) {
    if (position === undefined) return;
    const ids = (await repos.customFields.listOptions(project.ctx, [fieldId])).map(o => o.id).filter(i => i !== id);
    ids.splice(Math.min(position, ids.length), 0, id);
    await repos.customFields.reorderOptions(project.ctx, ids);
  }

  async function checkLimit(repos: TenantRepos, project: ProjectAccess) {
    if ((await repos.customFields.countLive(project.ctx, project.project.id)) >= CUSTOM_FIELDS_MAX) {
      throw new AppError('custom_field.limit', 409, { max: CUSTOM_FIELDS_MAX }, 'name');
    }
  }

  /** An option removed with `move_to` rewrites each issue's value: one never-coalesced history row per issue. */
  async function recordMoves(
    repos: TenantRepos,
    project: ProjectAccess,
    principal: Principal,
    field: CustomFieldRow,
    options: CustomFieldOptionRow[],
    before: Map<number, { option_id: number | null }[]>,
  ) {
    const after = await repos.customFields.listValues(project.ctx, [...before.keys()]);
    const changeGroupId = Bun.randomUUIDv7();
    const at = new Date();
    for (const [issueId, held] of before) {
      await repos.issueActivity.record(project.ctx, {
        issue_id: issueId,
        actor_id: principal.userId,
        change_group_id: changeGroupId,
        kind: 'field_changed',
        field: `${HISTORY_PREFIX}${field.slug}`,
        old_value: snapshotOf(field, held, options, new Map()),
        new_value: snapshotOf(
          field,
          after.filter(v => v.issue_id === issueId && v.field_id === field.id),
          options,
          new Map(),
        ),
        created_at: at,
        updated_at: at,
      });
    }
  }

  return {
    async list(
      principal: Principal,
      key: string,
      query: { archived?: boolean | undefined } = {},
      hints: OrgHints = {},
    ): Promise<CustomField[]> {
      const project = await readable(principal, key, hints);
      const cat = await catalogueOf(customFields, project);
      const rows = query.archived === undefined ? cat.fields : cat.fields.filter(f => f.is_archived === query.archived);
      return toDtos(customFields, project, cat, rows);
    },

    async get(principal: Principal, key: string, slug: string, hints: OrgHints = {}): Promise<CustomField> {
      const project = await readable(principal, key, hints);
      const cat = await catalogueOf(customFields, project);
      return (await toDtos(customFields, project, cat, [find(cat, slug)]))[0]!;
    },

    async create(
      principal: Principal,
      key: string,
      input: CreateCustomField,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<CustomField> {
      const project = await writable(principal, key, hints);
      const config = checkConfig(input.type, input.config);
      if (input.options?.length && !hasOptions(input.type)) {
        throw new AppError('custom_field.options_not_supported', 400, {}, 'options');
      }
      if (input.is_required && input.type === 'checkbox') {
        throw new AppError('custom_field.checkbox_not_required', 400, {}, 'is_required');
      }
      const slug = input.slug?.toLowerCase() ?? customFieldSlug(input.name);
      if (!slug) throw new AppError('custom_field.slug_invalid', 400, { slug: input.name }, 'slug');
      const typeIds = input.applies_to ? await typeIdsOf(project, input.applies_to) : [];

      const created = await inTransaction(async repos => {
        await repos.customFields.lockSlug(project.ctx, slug);
        const existing = await repos.customFields.listForProjects(project.ctx, [project.project.id]);
        if (existing.some(f => sameName(f.name, input.name))) {
          throw new AppError('custom_field.name_taken', 409, { name: input.name }, 'name');
        }
        await checkLimit(repos, project);
        await checkSlug(repos, project, slug, input.type);
        const field = await withUniqueAs(
          () =>
            repos.customFields.insert(project.ctx, project.project.id, {
              name: input.name,
              slug,
              type: input.type,
              config,
              is_required: input.is_required === true,
              default_value: input.default_value ?? null,
              empty_label: input.empty_label ?? null,
              position: existing.length,
              created_by: principal.userId,
            }),
          ['custom_fields_project_lower_name_unique'],
          () => new AppError('custom_field.name_taken', 409, { name: input.name }, 'name'),
        );
        const names = (input.options ?? []).map(o => o.name);
        assertOptionNames(field, names);
        const options = await withUniqueAs(
          () =>
            repos.customFields.insertOptions(
              project.ctx,
              field.id,
              (input.options ?? []).map((o, position) => ({
                name: o.name,
                color: o.color ?? DEFAULT_LABEL_COLOR,
                position: o.position ?? position,
              })),
            ),
          ['custom_field_options_field_lower_name_unique'],
          () =>
            new AppError(
              'custom_field.option_name_taken',
              409,
              { field: field.name, name: names.at(-1) ?? '' },
              'options',
            ),
        );
        await checkDefault(project, field, options);
        await repos.customFields.replaceAppliesTo(project.ctx, project.project.id, field.id, typeIds);
        await place(repos, project, field.id, input.position);
        const dto = await oneDto(repos.customFields, project, field.id);
        await record(repos, project, principal, field, 'created', null, dto, ip);
        return dto;
      });

      analytics.capture(
        'custom_field_created',
        {
          via: viaOf(principal),
          field_type: input.type,
          is_required: created.is_required,
          has_default: created.default_value !== null,
          type_scoped: created.applies_to.length > 0,
          option_count: created.options.length,
        },
        { userId: principal.userId, orgId: project.organization.id },
      );
      return created;
    },

    async update(
      principal: Principal,
      key: string,
      slug: string,
      input: UpdateCustomField,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<CustomField> {
      const project = await writable(principal, key, hints);
      const typeIds = input.applies_to ? await typeIdsOf(project, input.applies_to) : undefined;

      const { dto, archived } = await inTransaction(async repos => {
        const cat = await catalogueOf(repos.customFields, project);
        const field = find(cat, slug);
        const before = (await toDtos(repos.customFields, project, cat, [field]))[0]!;
        if (input.name !== undefined && cat.fields.some(f => f.id !== field.id && sameName(f.name, input.name!))) {
          throw new AppError('custom_field.name_taken', 409, { name: input.name }, 'name');
        }
        if (input.is_required && field.type === 'checkbox') {
          throw new AppError('custom_field.checkbox_not_required', 400, {}, 'is_required');
        }
        const role = timeRoleOf(cat, field);
        if (input.is_archived === true && !field.is_archived && role) {
          throw new AppError(
            'custom_field.time_role',
            409,
            { field: field.name, role: t(`custom_field.role.${role}`) },
            'is_archived',
          );
        }
        if (input.is_archived === false && field.is_archived) await checkLimit(repos, project);
        const patch: Parameters<CustomFieldsRepository['update']>[2] = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.config !== undefined) patch.config = checkConfig(field.type, input.config);
        if (input.is_required !== undefined) patch.is_required = input.is_required;
        if (input.default_value !== undefined) patch.default_value = input.default_value;
        if (input.empty_label !== undefined) patch.empty_label = input.empty_label;
        if (input.is_archived !== undefined) patch.is_archived = input.is_archived;
        const updated = (await withUniqueAs(
          () => repos.customFields.update(project.ctx, field.id, { ...patch, updated_at: new Date() }),
          ['custom_fields_project_lower_name_unique'],
          () => new AppError('custom_field.name_taken', 409, { name: input.name ?? field.name }, 'name'),
        ))!;
        if (input.default_value !== undefined || input.config !== undefined) {
          await checkDefault(project, updated, cat.options.get(field.id) ?? []);
        }
        if (typeIds) await repos.customFields.replaceAppliesTo(project.ctx, project.project.id, field.id, typeIds);
        await place(repos, project, field.id, input.position);
        const after = await oneDto(repos.customFields, project, field.id);
        if (JSON.stringify({ ...before, updated_at: '' }) !== JSON.stringify({ ...after, updated_at: '' })) {
          await record(repos, project, principal, updated, 'updated', before, after, ip);
        }
        return { dto: after, archived: input.is_archived === true && !field.is_archived };
      });
      if (archived) {
        analytics.capture(
          'custom_field_archived',
          { via: viaOf(principal), field_type: dto.type },
          { userId: principal.userId, orgId: project.organization.id },
        );
      }
      return dto;
    },

    /** Destroys the field's values; a project that used it as Estimation or Spent time returns to the built-in. */
    async remove(
      principal: Principal,
      key: string,
      slug: string,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<CustomField> {
      const project = await writable(principal, key, hints);
      return inTransaction(async repos => {
        const cat = await catalogueOf(repos.customFields, project);
        const field = find(cat, slug);
        const dto = (await toDtos(repos.customFields, project, cat, [field]))[0]!;
        const role = timeRoleOf(cat, field);
        if (role) {
          await repos.customFields.setTimeRoles(
            project.ctx,
            project.project.id,
            role === 'estimation' ? { estimation_field_id: null } : { spent_time_field_id: null },
          );
        }
        const issues = await repos.customFields.countIssuesWithValue(project.ctx, field.id);
        await repos.customFields.remove(project.ctx, field.id);
        await repos.customFields.reorder(
          project.ctx,
          cat.fields.filter(f => f.id !== field.id).map(f => f.id),
        );
        await record(repos, project, principal, field, 'deleted', { ...dto, issues_with_value: issues }, null, ip);
        return { ...dto, time_role: null };
      });
    },

    async createOption(
      principal: Principal,
      key: string,
      slug: string,
      input: CreateCustomFieldOption,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<CustomField> {
      const project = await writable(principal, key, hints);
      return inTransaction(async repos => {
        const cat = await catalogueOf(repos.customFields, project);
        const field = find(cat, slug);
        if (!hasOptions(field.type)) throw new AppError('custom_field.options_not_supported', 400, {}, 'name');
        const existing = cat.options.get(field.id) ?? [];
        assertOptionNames(field, [input.name], existing);
        const [option] = await withUniqueAs(
          () =>
            repos.customFields.insertOptions(project.ctx, field.id, [
              { name: input.name, color: input.color ?? DEFAULT_LABEL_COLOR, position: existing.length },
            ]),
          ['custom_field_options_field_lower_name_unique'],
          () => new AppError('custom_field.option_name_taken', 409, { field: field.name, name: input.name }, 'name'),
        );
        await placeOption(repos, project, field.id, option!.id, input.position);
        await record(repos, project, principal, field, 'option_created', null, { option: input.name }, ip);
        return oneDto(repos.customFields, project, field.id);
      });
    },

    async updateOption(
      principal: Principal,
      key: string,
      slug: string,
      name: string,
      input: UpdateCustomFieldOption,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<CustomField> {
      const project = await writable(principal, key, hints);
      return inTransaction(async repos => {
        const cat = await catalogueOf(repos.customFields, project);
        const field = find(cat, slug);
        const options = cat.options.get(field.id) ?? [];
        const option = findOption(field, options, name);
        if (input.name !== undefined && options.some(o => o.id !== option.id && sameName(o.name, input.name!))) {
          throw new AppError('custom_field.option_name_taken', 409, { field: field.name, name: input.name }, 'name');
        }
        const patch: Parameters<CustomFieldsRepository['updateOption']>[2] = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.color !== undefined) patch.color = input.color;
        if (input.is_archived !== undefined) patch.is_archived = input.is_archived;
        if (Object.keys(patch).length > 0) {
          await withUniqueAs(
            () => repos.customFields.updateOption(project.ctx, option.id, patch),
            ['custom_field_options_field_lower_name_unique'],
            () =>
              new AppError(
                'custom_field.option_name_taken',
                409,
                { field: field.name, name: input.name ?? option.name },
                'name',
              ),
          );
        }
        await placeOption(repos, project, field.id, option.id, input.position);
        await record(
          repos,
          project,
          principal,
          field,
          'option_updated',
          { option: option.name, color: option.color, is_archived: option.is_archived },
          { option: input.name ?? option.name, ...patch },
          ip,
        );
        return oneDto(repos.customFields, project, field.id);
      });
    },

    async removeOption(
      principal: Principal,
      key: string,
      slug: string,
      name: string,
      moveTo: string | undefined,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<CustomField> {
      const project = await writable(principal, key, hints);
      return inTransaction(async repos => {
        const cat = await catalogueOf(repos.customFields, project);
        const field = find(cat, slug);
        const options = cat.options.get(field.id) ?? [];
        const doomed = findOption(field, options, name);
        const issueIds = await repos.customFields.issuesWithValue(project.ctx, field.id, doomed.id);
        if (issueIds.length > 0) {
          const targets = options.filter(o => o.id !== doomed.id && !o.is_archived);
          if (moveTo === undefined) {
            throw new AppError(
              'custom_field.option_in_use',
              409,
              { name: doomed.name, count: issueIds.length },
              'move_to',
              targets.map(o => o.name),
            );
          }
          const target = targets.find(o => sameName(o.name, moveTo));
          if (!target) {
            throw new AppError(
              'custom_field.option_move_invalid',
              400,
              { name: moveTo },
              'move_to',
              targets.map(o => o.name),
            );
          }
          const held = await repos.customFields.listValues(project.ctx, issueIds);
          const before = new Map(
            issueIds.map(id => [id, held.filter(v => v.issue_id === id && v.field_id === field.id)]),
          );
          await repos.customFields.moveOption(project.ctx, field.id, doomed.id, target.id);
          await recordMoves(repos, project, principal, field, options, before);
        }
        await repos.customFields.removeOption(project.ctx, doomed.id);
        await repos.customFields.reorderOptions(
          project.ctx,
          options.filter(o => o.id !== doomed.id).map(o => o.id),
        );
        await record(
          repos,
          project,
          principal,
          field,
          'option_deleted',
          { option: doomed.name },
          moveTo ? { move_to: moveTo } : null,
          ip,
        );
        return oneDto(repos.customFields, project, field.id);
      });
    },
  };
}

export type CustomFieldsService = ReturnType<typeof customFieldsService>;

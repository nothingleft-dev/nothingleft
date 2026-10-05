import {
  WORK_ITEM_ATTRIBUTES_MAX,
  WORK_ITEM_ATTRIBUTE_VALUES_MAX,
  viaOf,
  type CreateWorkItemAttribute,
  type CreateWorkItemAttributeValue,
  type Principal,
  type UpdateWorkItemAttribute,
  type UpdateWorkItemAttributeValue,
  type WorkItemAttribute,
} from '@nothingleft/types';
import type { WorkItemAttributeRow, WorkItemAttributeValueRow, WorkItemAttributesRepository } from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { AppError } from '@lib/errors';
import { withUniqueAs } from '@lib/pg-errors';
import type { AccessService, ProjectAccess } from '@services/access';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';

export interface WorkItemAttributesDeps {
  access: AccessService;
  workItemAttributes: WorkItemAttributesRepository;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
}

// The built-in attribute's name: a project's own attribute may not take it.
const WORK_TYPE = 'work type';

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Work type is the built-in attribute (the work-types routes); these are a project's own select attributes. */
export function workItemAttributesService({
  access,
  workItemAttributes,
  inTransaction,
  analytics,
}: WorkItemAttributesDeps) {
  async function writable(principal: Principal, key: string, hints: OrgHints): Promise<ProjectAccess> {
    const project = await access.project(principal, key, hints);
    access.require(principal, 'project.schema.manage', project.scope);
    if (project.project.is_archived) throw new AppError('project.archived', 409, { key: project.project.key });
    return project;
  }

  async function catalogue(repo: WorkItemAttributesRepository, project: ProjectAccess) {
    const attributes = await repo.listForProjects(project.ctx, [project.project.id]);
    const values = await repo.listValues(
      project.ctx,
      attributes.map(a => a.id),
    );
    return { attributes, values };
  }

  const toDto = (attribute: WorkItemAttributeRow, values: WorkItemAttributeValueRow[]): WorkItemAttribute => ({
    name: attribute.name,
    position: attribute.position,
    is_archived: attribute.is_archived,
    values: values
      .filter(v => v.attribute_id === attribute.id)
      .map(v => ({ name: v.name, short_label: v.short_label, position: v.position, is_archived: v.is_archived })),
  });

  async function one(repo: WorkItemAttributesRepository, project: ProjectAccess, id: number) {
    const { attributes, values } = await catalogue(repo, project);
    return toDto(
      attributes.find(a => a.id === id)!,
      values,
    );
  }

  function find(attributes: WorkItemAttributeRow[], name: string): WorkItemAttributeRow {
    const attribute = attributes.find(a => sameName(a.name, name));
    if (!attribute) {
      throw new AppError(
        'work_item_attribute.not_found',
        404,
        { name },
        'name',
        attributes.map(a => a.name),
      );
    }
    return attribute;
  }

  function findValue(attribute: WorkItemAttributeRow, values: WorkItemAttributeValueRow[], name: string) {
    const own = values.filter(v => v.attribute_id === attribute.id);
    const value = own.find(v => sameName(v.name, name));
    if (!value) {
      throw new AppError(
        'work_item_attribute.value_not_found',
        404,
        { attribute: attribute.name, name },
        'name',
        own.map(v => v.name),
      );
    }
    return value;
  }

  function assertAttributeName(attributes: WorkItemAttributeRow[], name: string, except?: number) {
    if (sameName(name, WORK_TYPE) || attributes.some(a => a.id !== except && sameName(a.name, name))) {
      throw new AppError('work_item_attribute.name_taken', 409, { name }, 'name');
    }
  }

  function assertValueNames(
    attribute: WorkItemAttributeRow,
    names: readonly string[],
    existing: WorkItemAttributeValueRow[],
  ) {
    const seen = new Set(existing.map(v => v.name.toLowerCase()));
    for (const name of names) {
      if (seen.has(name.toLowerCase())) {
        throw new AppError('work_item_attribute.value_name_taken', 409, { attribute: attribute.name, name }, 'name');
      }
      seen.add(name.toLowerCase());
    }
    if (seen.size > WORK_ITEM_ATTRIBUTE_VALUES_MAX) {
      throw new AppError('work_item_attribute.values_limit', 409, { max: WORK_ITEM_ATTRIBUTE_VALUES_MAX }, 'values');
    }
  }

  async function record(
    repos: TenantRepos,
    project: ProjectAccess,
    actorId: number,
    action: string,
    before: object | null,
    after: object | null,
    ip: string | null,
  ) {
    const base = { project_key: project.project.key, table: 'work_item_attributes', action };
    await repos.activity.record(project.ctx, {
      actor_id: actorId,
      kind: 'schema_changed',
      target_type: 'project',
      target_id: String(project.project.id),
      old_value: before ? { ...base, ...before } : null,
      new_value: after ? { ...base, ...after } : null,
      ip,
    });
  }

  function placed(ids: number[], id: number, position?: number): number[] | null {
    if (position === undefined) return null;
    const rest = ids.filter(i => i !== id);
    rest.splice(Math.min(position, rest.length), 0, id);
    return rest;
  }

  return {
    async list(principal: Principal, key: string, hints: OrgHints = {}): Promise<WorkItemAttribute[]> {
      const project = await access.project(principal, key, hints);
      access.require(principal, 'project.read', project.scope);
      const { attributes, values } = await catalogue(workItemAttributes, project);
      return attributes.map(a => toDto(a, values));
    },

    async create(
      principal: Principal,
      key: string,
      input: CreateWorkItemAttribute,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<WorkItemAttribute> {
      const project = await writable(principal, key, hints);
      const dto = await inTransaction(async repos => {
        const { attributes } = await catalogue(repos.workItemAttributes, project);
        assertAttributeName(attributes, input.name);
        if (attributes.length >= WORK_ITEM_ATTRIBUTES_MAX) {
          throw new AppError('work_item_attribute.limit', 409, { max: WORK_ITEM_ATTRIBUTES_MAX }, 'name');
        }
        const attribute = await withUniqueAs(
          () =>
            repos.workItemAttributes.insert(project.ctx, project.project.id, {
              name: input.name,
              position: attributes.length,
            }),
          ['work_item_attributes_project_lower_name_unique'],
          () => new AppError('work_item_attribute.name_taken', 409, { name: input.name }, 'name'),
        );
        const values = input.values ?? [];
        assertValueNames(
          attribute,
          values.map(v => v.name),
          [],
        );
        await withUniqueAs(
          () =>
            repos.workItemAttributes.insertValues(
              project.ctx,
              attribute.id,
              values.map((v, position) => ({
                name: v.name,
                short_label: (v.short_label ?? v.name.charAt(0)).toUpperCase(),
                position: v.position ?? position,
              })),
            ),
          ['work_item_attribute_values_attribute_lower_name_unique'],
          () =>
            new AppError(
              'work_item_attribute.value_name_taken',
              409,
              { attribute: attribute.name, name: values.at(-1)?.name ?? '' },
              'values',
            ),
        );
        const order = placed([...attributes.map(a => a.id), attribute.id], attribute.id, input.position);
        if (order) await repos.workItemAttributes.reorder(project.ctx, order);
        const created = await one(repos.workItemAttributes, project, attribute.id);
        await record(repos, project, principal.userId, 'created', null, created, ip);
        return created;
      });
      analytics.capture(
        'work_item_attribute_created',
        { via: viaOf(principal), value_count: dto.values.length },
        { userId: principal.userId, orgId: project.organization.id },
      );
      return dto;
    },

    async update(
      principal: Principal,
      key: string,
      name: string,
      input: UpdateWorkItemAttribute,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<WorkItemAttribute> {
      const project = await writable(principal, key, hints);
      return inTransaction(async repos => {
        const { attributes, values } = await catalogue(repos.workItemAttributes, project);
        const attribute = find(attributes, name);
        if (input.name !== undefined) assertAttributeName(attributes, input.name, attribute.id);
        const patch: Parameters<WorkItemAttributesRepository['update']>[2] = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.is_archived !== undefined) patch.is_archived = input.is_archived;
        await withUniqueAs(
          () => repos.workItemAttributes.update(project.ctx, attribute.id, { ...patch, updated_at: new Date() }),
          ['work_item_attributes_project_lower_name_unique'],
          () => new AppError('work_item_attribute.name_taken', 409, { name: input.name ?? attribute.name }, 'name'),
        );
        const order = placed(
          attributes.map(a => a.id),
          attribute.id,
          input.position,
        );
        if (order) await repos.workItemAttributes.reorder(project.ctx, order);
        const after = await one(repos.workItemAttributes, project, attribute.id);
        await record(repos, project, principal.userId, 'updated', toDto(attribute, values), after, ip);
        return after;
      });
    },

    /** Drops the attribute from every work item that had it; their history keeps what was logged. */
    async remove(principal: Principal, key: string, name: string, ip: string | null, hints: OrgHints = {}) {
      const project = await writable(principal, key, hints);
      return inTransaction(async repos => {
        const { attributes, values } = await catalogue(repos.workItemAttributes, project);
        const attribute = find(attributes, name);
        const dto = toDto(attribute, values);
        const used = await repos.workItemAttributes.countAttributeUsage(project.ctx, attribute.id);
        await repos.workItemAttributes.remove(project.ctx, attribute.id);
        await repos.workItemAttributes.reorder(
          project.ctx,
          attributes.filter(a => a.id !== attribute.id).map(a => a.id),
        );
        await record(repos, project, principal.userId, 'deleted', { ...dto, work_items_with_value: used }, null, ip);
        return dto;
      });
    },

    async createValue(
      principal: Principal,
      key: string,
      name: string,
      input: CreateWorkItemAttributeValue,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<WorkItemAttribute> {
      const project = await writable(principal, key, hints);
      return inTransaction(async repos => {
        const { attributes, values } = await catalogue(repos.workItemAttributes, project);
        const attribute = find(attributes, name);
        const own = values.filter(v => v.attribute_id === attribute.id);
        assertValueNames(attribute, [input.name], own);
        const [value] = await withUniqueAs(
          () =>
            repos.workItemAttributes.insertValues(project.ctx, attribute.id, [
              {
                name: input.name,
                short_label: (input.short_label ?? input.name.charAt(0)).toUpperCase(),
                position: own.length,
              },
            ]),
          ['work_item_attribute_values_attribute_lower_name_unique'],
          () =>
            new AppError(
              'work_item_attribute.value_name_taken',
              409,
              { attribute: attribute.name, name: input.name },
              'name',
            ),
        );
        const order = placed([...own.map(v => v.id), value!.id], value!.id, input.position);
        if (order) await repos.workItemAttributes.reorderValues(project.ctx, order);
        await record(
          repos,
          project,
          principal.userId,
          'value_created',
          null,
          { attribute: attribute.name, value: input.name },
          ip,
        );
        return one(repos.workItemAttributes, project, attribute.id);
      });
    },

    async updateValue(
      principal: Principal,
      key: string,
      name: string,
      valueName: string,
      input: UpdateWorkItemAttributeValue,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<WorkItemAttribute> {
      const project = await writable(principal, key, hints);
      return inTransaction(async repos => {
        const { attributes, values } = await catalogue(repos.workItemAttributes, project);
        const attribute = find(attributes, name);
        const value = findValue(attribute, values, valueName);
        const own = values.filter(v => v.attribute_id === attribute.id);
        if (input.name !== undefined && own.some(v => v.id !== value.id && sameName(v.name, input.name!))) {
          throw new AppError(
            'work_item_attribute.value_name_taken',
            409,
            { attribute: attribute.name, name: input.name },
            'name',
          );
        }
        const patch: Parameters<WorkItemAttributesRepository['updateValue']>[2] = {};
        if (input.name !== undefined) patch.name = input.name;
        if (input.short_label !== undefined) patch.short_label = input.short_label.toUpperCase();
        if (input.is_archived !== undefined) patch.is_archived = input.is_archived;
        if (Object.keys(patch).length > 0) {
          await withUniqueAs(
            () => repos.workItemAttributes.updateValue(project.ctx, value.id, patch),
            ['work_item_attribute_values_attribute_lower_name_unique'],
            () =>
              new AppError(
                'work_item_attribute.value_name_taken',
                409,
                { attribute: attribute.name, name: input.name ?? value.name },
                'name',
              ),
          );
        }
        const order = placed(
          own.map(v => v.id),
          value.id,
          input.position,
        );
        if (order) await repos.workItemAttributes.reorderValues(project.ctx, order);
        await record(
          repos,
          project,
          principal.userId,
          'value_updated',
          { attribute: attribute.name, value: value.name },
          { attribute: attribute.name, value: input.name ?? value.name, ...patch },
          ip,
        );
        return one(repos.workItemAttributes, project, attribute.id);
      });
    },

    async removeValue(
      principal: Principal,
      key: string,
      name: string,
      valueName: string,
      moveTo: string | undefined,
      ip: string | null,
      hints: OrgHints = {},
    ): Promise<WorkItemAttribute> {
      const project = await writable(principal, key, hints);
      return inTransaction(async repos => {
        const { attributes, values } = await catalogue(repos.workItemAttributes, project);
        const attribute = find(attributes, name);
        const doomed = findValue(attribute, values, valueName);
        const own = values.filter(v => v.attribute_id === attribute.id);
        const used = await repos.workItemAttributes.countValueUsage(project.ctx, doomed.id);
        if (used > 0) {
          const targets = own.filter(v => v.id !== doomed.id && !v.is_archived);
          if (moveTo === undefined) {
            throw new AppError(
              'work_item_attribute.value_in_use',
              409,
              { name: doomed.name, count: used },
              'move_to',
              targets.map(v => v.name),
            );
          }
          const target = targets.find(v => sameName(v.name, moveTo));
          if (!target) {
            throw new AppError(
              'work_item_attribute.value_move_invalid',
              400,
              { name: moveTo },
              'move_to',
              targets.map(v => v.name),
            );
          }
          await repos.workItemAttributes.moveValue(project.ctx, doomed.id, target.id);
        }
        await repos.workItemAttributes.removeValue(project.ctx, doomed.id);
        await repos.workItemAttributes.reorderValues(
          project.ctx,
          own.filter(v => v.id !== doomed.id).map(v => v.id),
        );
        await record(
          repos,
          project,
          principal.userId,
          'value_deleted',
          { attribute: attribute.name, value: doomed.name },
          moveTo ? { move_to: moveTo } : null,
          ip,
        );
        return one(repos.workItemAttributes, project, attribute.id);
      });
    },
  };
}

export type WorkItemAttributesService = ReturnType<typeof workItemAttributesService>;

import {
  CUSTOM_FIELD_KINDS,
  CUSTOM_FIELD_MARKDOWN_MAX_BYTES,
  CUSTOM_FIELD_MULTI_MAX,
  CUSTOM_FIELD_MULTI_TYPES,
  CUSTOM_FIELD_TEXT_MAX,
  CUSTOM_FIELD_URL_MAX,
  type CustomFieldConfig,
  type CustomFieldKind,
  type CustomFieldsInput,
  type CustomFieldTimeRole,
  type CustomFieldType,
  type CustomFieldValueInput,
  type IssueCustomFieldValue,
  type LabelColor,
  type MemberRef,
} from '@nothingleft/types';
import type {
  CustomFieldOptionRow,
  CustomFieldRow,
  CustomFieldScope,
  CustomFieldsRepository,
  FieldValueInsert,
  IssueFieldValueRow,
  OrganizationsRepository,
  ProjectsRepository,
  TenantContext,
} from '@nothingleft/db';
import { parseDuration, type WorkCalendar } from '@nothingleft/format';
import { t, type MessageKey } from '@nothingleft/i18n';
import { AppError } from '@lib/errors';
import type { FieldChange } from '@services/issue-history';

/** Every custom field of a set of projects, with what a read or a write needs beside it. */
export interface FieldCatalogue {
  fields: CustomFieldRow[];
  options: Map<number, CustomFieldOptionRow[]>;
  /** Type ids per field; a field with none applies to every type. */
  appliesTo: Map<number, Set<number>>;
  roles: Map<number, { estimation: number | null; spent: number | null }>;
}

export const HISTORY_PREFIX = 'custom:';

export const kindOf = (field: Pick<CustomFieldRow, 'type'>): CustomFieldKind =>
  CUSTOM_FIELD_KINDS[field.type as CustomFieldType];

const isMulti = (type: string) => (CUSTOM_FIELD_MULTI_TYPES as readonly string[]).includes(type);

export const emptyLabelOf = (field: Pick<CustomFieldRow, 'name' | 'empty_label'>) =>
  field.empty_label ?? t('custom_field.empty_label', { name: field.name });

export async function loadCatalogue(
  repo: CustomFieldsRepository,
  ctx: TenantContext,
  projectIds: readonly number[],
): Promise<FieldCatalogue> {
  const [fields, roles] = await Promise.all([repo.listForProjects(ctx, projectIds), repo.timeRoles(ctx, projectIds)]);
  const ids = fields.map(f => f.id);
  const [options, applies] = await Promise.all([repo.listOptions(ctx, ids), repo.listAppliesTo(ctx, ids)]);
  const byField = new Map<number, CustomFieldOptionRow[]>();
  for (const o of options) byField.set(o.field_id, [...(byField.get(o.field_id) ?? []), o]);
  const appliesTo = new Map<number, Set<number>>();
  for (const a of applies) appliesTo.set(a.field_id, (appliesTo.get(a.field_id) ?? new Set()).add(a.type_id));
  return {
    fields,
    options: byField,
    appliesTo,
    roles: new Map(roles.map(r => [r.project_id, { estimation: r.estimation_field_id, spent: r.spent_time_field_id }])),
  };
}

export const fieldsOfProject = (cat: FieldCatalogue, projectId: number) =>
  cat.fields.filter(f => f.project_id === projectId);

export function appliesTo(cat: FieldCatalogue, field: CustomFieldRow, typeId: number): boolean {
  const types = cat.appliesTo.get(field.id);
  return !types || types.size === 0 || types.has(typeId);
}

export function timeRoleOf(cat: FieldCatalogue, field: CustomFieldRow): CustomFieldTimeRole | null {
  const roles = cat.roles.get(field.project_id);
  if (roles?.estimation === field.id) return 'estimation';
  if (roles?.spent === field.id) return 'spent_time';
  return null;
}

/** A field by slug, else by name, both without regard to case. */
export function findField(fields: readonly CustomFieldRow[], key: string): CustomFieldRow | undefined {
  const folded = key.trim().toLowerCase();
  return fields.find(f => f.slug === folded) ?? fields.find(f => f.name.toLowerCase() === folded);
}

/** The compiler's view of the fields in scope: one entry per slug. */
export function searchFields(cat: FieldCatalogue): CustomFieldScope[] {
  const bySlug = new Map<string, CustomFieldScope & { spent: number[] }>();
  for (const field of cat.fields) {
    const entry = bySlug.get(field.slug) ?? {
      slug: field.slug,
      kind: kindOf(field),
      spentTimeProjectIds: [],
      spent: [],
    };
    if (cat.roles.get(field.project_id)?.spent === field.id) entry.spent.push(field.project_id);
    bySlug.set(field.slug, entry);
  }
  return [...bySlug.values()].map(({ spent, ...entry }) => ({ ...entry, spentTimeProjectIds: spent }));
}

export interface ValueDeps {
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
}

export interface ValueContext {
  ctx: TenantContext;
  projectId: number;
  projectKey: string;
  calendar: WorkCalendar;
}

export interface PlannedValue {
  field: CustomFieldRow;
  rows: FieldValueInsert[];
}

const paramField = (field: CustomFieldRow) => `custom_fields.${field.slug}`;

function invalid(
  field: CustomFieldRow,
  value: unknown,
  expected: MessageKey,
  params: Record<string, string | number> = {},
) {
  return new AppError(
    'custom_field.invalid_value',
    400,
    { field: field.name, value: String(value), expected: t(expected, params) },
    paramField(field),
  );
}

function checkRange(field: CustomFieldRow, value: number) {
  const config = field.config as CustomFieldConfig;
  if ((config.min !== undefined && value < config.min) || (config.max !== undefined && value > config.max)) {
    const range = [config.min ?? '…', config.max ?? '…'].join(' – ');
    throw new AppError('custom_field.out_of_range', 400, { field: field.name, value, range }, paramField(field));
  }
}

const decimalsOf = (value: number) => {
  const text = String(value);
  if (text.includes('e')) return Number.POSITIVE_INFINITY;
  return text.includes('.') ? text.split('.')[1]!.length : 0;
};

const asList = (input: CustomFieldValueInput): unknown[] =>
  input === null ? [] : Array.isArray(input) ? input : [input];

/**
 * A request's value for one field → the rows that store it. `current` keeps an archived option
 * that is already set choosable, as an archived status is.
 */
export async function planValue(
  deps: ValueDeps,
  vc: ValueContext,
  field: CustomFieldRow,
  options: readonly CustomFieldOptionRow[],
  input: CustomFieldValueInput,
  current: readonly IssueFieldValueRow[] = [],
): Promise<PlannedValue> {
  const type = field.type as CustomFieldType;
  const plan = (rows: FieldValueInsert[]): PlannedValue => ({ field, rows });
  if (input === null) return plan([]);
  if (Array.isArray(input) && !isMulti(type)) throw invalid(field, input.join(', '), 'custom_field.expected.one');

  switch (type) {
    case 'text':
    case 'url':
    case 'markdown': {
      if (typeof input !== 'string') throw invalid(field, input, `custom_field.expected.${type}`, limitsOf(type));
      if (input.trim() === '') return plan([]);
      if (type === 'text' && (input.length > CUSTOM_FIELD_TEXT_MAX || /[\r\n]/.test(input))) {
        throw invalid(field, input.slice(0, 40), 'custom_field.expected.text', limitsOf(type));
      }
      if (type === 'url' && (input.length > CUSTOM_FIELD_URL_MAX || !/^https?:\/\/\S+$/i.test(input.trim()))) {
        throw invalid(field, input.slice(0, 80), 'custom_field.expected.url', limitsOf(type));
      }
      if (type === 'markdown' && Buffer.byteLength(input, 'utf8') > CUSTOM_FIELD_MARKDOWN_MAX_BYTES) {
        throw invalid(
          field,
          `${Math.ceil(Buffer.byteLength(input, 'utf8') / 1024)} KB`,
          'custom_field.expected.markdown',
          limitsOf(type),
        );
      }
      return plan([{ value_text: type === 'url' ? input.trim() : input }]);
    }
    case 'number':
    case 'integer': {
      const value = typeof input === 'string' && input.trim() !== '' ? Number(input) : input;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw invalid(field, input, `custom_field.expected.${type}`);
      }
      if (type === 'integer' && !Number.isInteger(value)) throw invalid(field, input, 'custom_field.expected.integer');
      const decimals = (field.config as CustomFieldConfig).decimals;
      if (type === 'number' && decimals !== undefined && decimalsOf(value) > decimals) {
        throw invalid(field, input, 'custom_field.expected.decimals', { decimals });
      }
      checkRange(field, value);
      return plan([{ value_number: value }]);
    }
    case 'duration': {
      const minutes =
        typeof input === 'number'
          ? Number.isInteger(input) && input >= 0
            ? input
            : null
          : typeof input === 'string'
            ? parseDuration(input, vc.calendar)
            : null;
      if (minutes === null) throw invalid(field, input, 'custom_field.expected.duration');
      return plan([{ value_number: minutes }]);
    }
    case 'date': {
      if (typeof input !== 'string' || !isIsoDate(input)) throw invalid(field, input, 'custom_field.expected.date');
      return plan([{ value_date: input }]);
    }
    case 'datetime': {
      const at = typeof input === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(input) ? new Date(input) : null;
      if (!at || Number.isNaN(at.getTime())) throw invalid(field, input, 'custom_field.expected.datetime');
      return plan([{ value_timestamptz: at }]);
    }
    case 'checkbox': {
      const truthy = input === true || (typeof input === 'string' && ['true', 'yes'].includes(input.toLowerCase()));
      const falsy = input === false || (typeof input === 'string' && ['false', 'no'].includes(input.toLowerCase()));
      if (!truthy && !falsy) throw invalid(field, input, 'custom_field.expected.checkbox');
      return plan(truthy ? [{ value_bool: true }] : []);
    }
    case 'select':
    case 'multi_select': {
      const names = unique(asList(input).map(v => String(v).trim()));
      if (names.length > CUSTOM_FIELD_MULTI_MAX) {
        throw new AppError(
          'custom_field.too_many_values',
          400,
          { field: field.name, max: CUSTOM_FIELD_MULTI_MAX },
          paramField(field),
        );
      }
      const held = new Set(current.map(v => v.option_id));
      const choosable = options.filter(o => !o.is_archived || held.has(o.id));
      return plan(
        names.map(name => {
          const option = choosable.find(o => o.name.toLowerCase() === name.toLowerCase());
          if (!option) {
            throw new AppError(
              'custom_field.unknown_option',
              400,
              { field: field.name, option: name },
              paramField(field),
              choosable.map(o => o.name),
            );
          }
          return { option_id: option.id };
        }),
      );
    }
    case 'user':
    case 'multi_user': {
      const names = unique(asList(input).map(v => String(v).trim().replace(/^@/, '')));
      if (names.length > CUSTOM_FIELD_MULTI_MAX) {
        throw new AppError(
          'custom_field.too_many_values',
          400,
          { field: field.name, max: CUSTOM_FIELD_MULTI_MAX },
          paramField(field),
        );
      }
      const found = await deps.organizations.findMembersByUsernames(vc.ctx, names);
      const eligible = new Set(
        (await deps.projects.listAssignable(vc.ctx, vc.projectId, { userIds: found.map(f => f.user.id) })).map(
          r => r.user.id,
        ),
      );
      return plan(
        names.map(name => {
          const member = found.find(f => f.membership.username.toLowerCase() === name.toLowerCase());
          if (!member || !eligible.has(member.user.id)) {
            throw new AppError(
              'custom_field.unknown_user',
              400,
              { field: field.name, username: `@${name}`, project: vc.projectKey },
              paramField(field),
            );
          }
          return { user_id: member.user.id };
        }),
      );
    }
  }
}

function limitsOf(type: 'text' | 'url' | 'markdown') {
  if (type === 'text') return { max: CUSTOM_FIELD_TEXT_MAX };
  if (type === 'url') return { max: CUSTOM_FIELD_URL_MAX };
  return { max: CUSTOM_FIELD_MARKDOWN_MAX_BYTES / 1024 };
}

const unique = (names: string[]) => {
  const seen = new Set<string>();
  return names.filter(n => {
    const folded = n.toLowerCase();
    if (!n || seen.has(folded)) return false;
    seen.add(folded);
    return true;
  });
};

function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

/** A stored value as history keeps it: names and usernames, never ids. */
export function snapshotOf(
  field: CustomFieldRow,
  rows: readonly FieldValueInsert[],
  options: readonly CustomFieldOptionRow[],
  usernames: ReadonlyMap<number, string>,
): unknown {
  if (rows.length === 0) return null;
  const first = rows[0]!;
  switch (field.type as CustomFieldType) {
    case 'markdown':
      return null;
    case 'text':
    case 'url':
      return first.value_text ?? null;
    case 'number':
    case 'integer':
    case 'duration':
      return first.value_number ?? null;
    case 'date':
      return first.value_date ?? null;
    case 'datetime':
      return first.value_timestamptz ? new Date(first.value_timestamptz).toISOString() : null;
    case 'checkbox':
      return true;
    case 'select': {
      const option = options.find(o => o.id === first.option_id);
      return option ? { name: option.name } : null;
    }
    case 'multi_select':
      return rows
        .map(r => options.find(o => o.id === r.option_id)?.name ?? '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    case 'user':
      return usernames.get(first.user_id!) ?? null;
    case 'multi_user':
      return rows
        .map(r => usernames.get(r.user_id!) ?? '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
  }
}

const sameRows = (a: readonly FieldValueInsert[], b: readonly FieldValueInsert[]) => {
  const key = (r: FieldValueInsert) =>
    JSON.stringify([
      r.value_text ?? null,
      r.value_number ?? null,
      r.value_date ?? null,
      r.value_timestamptz ? new Date(r.value_timestamptz).toISOString() : null,
      r.value_bool ?? null,
      r.option_id ?? null,
      r.user_id ?? null,
    ]);
  const left = a.map(key).sort();
  const right = b.map(key).sort();
  return JSON.stringify(left) === JSON.stringify(right);
};

/**
 * Resolves `custom_fields` on a create or update into planned values. Unknown, archived,
 * inapplicable and read-only fields are refused before anything is written.
 */
export async function planInput(
  deps: ValueDeps,
  vc: ValueContext,
  cat: FieldCatalogue,
  input: CustomFieldsInput | undefined,
  currentValues: readonly IssueFieldValueRow[] = [],
): Promise<Map<number, PlannedValue>> {
  const out = new Map<number, PlannedValue>();
  if (!input) return out;
  const fields = fieldsOfProject(cat, vc.projectId);
  for (const [key, value] of Object.entries(input)) {
    const field = findField(fields, key);
    if (!field) {
      throw new AppError(
        'custom_field.unknown',
        400,
        { field: key, project: vc.projectKey },
        'custom_fields',
        fields.filter(f => !f.is_archived).map(f => f.slug),
      );
    }
    if (field.is_archived) throw new AppError('custom_field.archived', 409, { field: field.name }, paramField(field));
    if (timeRoleOf(cat, field) === 'spent_time') {
      throw new AppError('custom_field.read_only', 409, { field: field.name }, paramField(field));
    }
    out.set(
      field.id,
      await planValue(
        deps,
        vc,
        field,
        cat.options.get(field.id) ?? [],
        value,
        currentValues.filter(v => v.field_id === field.id),
      ),
    );
  }
  return out;
}

export function checkApplicable(
  cat: FieldCatalogue,
  plan: ReadonlyMap<number, PlannedValue>,
  typeId: number,
  typeName?: string,
) {
  for (const { field, rows } of plan.values()) {
    if (rows.length > 0 && !appliesTo(cat, field, typeId)) {
      throw new AppError(
        'custom_field.not_applicable',
        400,
        { field: field.name, type: typeName ?? '' },
        paramField(field),
      );
    }
  }
}

/** Fills defaults for fields the request did not name, then refuses a required field left empty. */
export async function completeRequired(
  deps: ValueDeps,
  vc: ValueContext,
  cat: FieldCatalogue,
  plan: Map<number, PlannedValue>,
  options: {
    typeId: number;
    currentValues: readonly IssueFieldValueRow[];
    /** On create every field is new; on update only those that just started to apply. */
    candidates: (field: CustomFieldRow) => boolean;
  },
): Promise<void> {
  for (const field of fieldsOfProject(cat, vc.projectId)) {
    if (field.is_archived || !appliesTo(cat, field, options.typeId) || timeRoleOf(cat, field) === 'spent_time')
      continue;
    const planned = plan.get(field.id);
    const held = options.currentValues.filter(v => v.field_id === field.id);
    const empty = planned ? planned.rows.length === 0 : held.length === 0;
    if (!empty) continue;
    const eligibleForDefault = !planned && options.candidates(field);
    if (eligibleForDefault && field.default_value !== null && field.default_value !== undefined) {
      try {
        plan.set(
          field.id,
          await planValue(
            deps,
            vc,
            field,
            cat.options.get(field.id) ?? [],
            field.default_value as CustomFieldValueInput,
          ),
        );
        continue;
      } catch (err) {
        if (!(err instanceof AppError)) throw err;
      }
    }
    if (field.is_required && field.type !== 'checkbox' && (planned || options.candidates(field))) {
      throw new AppError('custom_field.required', 400, { field: field.name }, paramField(field));
    }
  }
}

/** Writes the planned values that differ from what is stored and returns their history. */
export async function writePlanned(
  repo: CustomFieldsRepository,
  target: { ctx: TenantContext; projectId: number; issueId: number; at: Date },
  cat: FieldCatalogue,
  plan: ReadonlyMap<number, PlannedValue>,
  currentValues: readonly IssueFieldValueRow[],
  usernames: ReadonlyMap<number, string>,
): Promise<FieldChange[]> {
  const changes: FieldChange[] = [];
  for (const { field, rows } of plan.values()) {
    const held = currentValues.filter(v => v.field_id === field.id);
    if (sameRows(held, rows)) continue;
    await repo.replaceValues(
      target.ctx,
      { projectId: target.projectId, issueId: target.issueId, fieldId: field.id },
      rows,
      target.at,
    );
    const options = cat.options.get(field.id) ?? [];
    changes.push({
      field: `${HISTORY_PREFIX}${field.slug}`,
      old_value: snapshotOf(field, held, options, usernames),
      new_value: snapshotOf(field, rows, options, usernames),
      ...(field.type === 'markdown' ? { valueless: true } : {}),
    });
  }
  return changes;
}

/** Users a snapshot or a DTO names, for one people lookup. */
export const userIdsIn = (rows: readonly FieldValueInsert[]) =>
  rows.flatMap(r => (r.user_id === null || r.user_id === undefined ? [] : [r.user_id]));

/** The Issue's `custom_fields`: fields that apply to its type and are not archived, in field order. */
export function issueCustomFields(
  cat: FieldCatalogue,
  issue: { project_id: number; type_id: number; spent_minutes: number },
  values: readonly IssueFieldValueRow[],
  people: ReadonlyMap<number, MemberRef>,
): IssueCustomFieldValue[] {
  return fieldsOfProject(cat, issue.project_id)
    .filter(f => !f.is_archived && appliesTo(cat, f, issue.type_id))
    .map(field => {
      const rows = values.filter(v => v.field_id === field.id);
      const options = cat.options.get(field.id) ?? [];
      const option = (id: number | null) => {
        const o = options.find(x => x.id === id);
        return o ? { name: o.name, color: o.color as LabelColor } : null;
      };
      const base = { slug: field.slug, name: field.name, empty_label: emptyLabelOf(field) };
      const first = rows[0];
      const type = field.type as CustomFieldType;
      if (timeRoleOf(cat, field) === 'spent_time') {
        return { ...base, type: 'duration', value: issue.spent_minutes > 0 ? issue.spent_minutes : null };
      }
      switch (type) {
        case 'text':
        case 'markdown':
        case 'url':
          return { ...base, type, value: first?.value_text ?? null };
        case 'number':
        case 'integer':
        case 'duration':
          return { ...base, type, value: first?.value_number ?? null };
        case 'date':
          return { ...base, type, value: first?.value_date ?? null };
        case 'datetime':
          return { ...base, type, value: first?.value_timestamptz?.toISOString() ?? null };
        case 'checkbox':
          return { ...base, type, value: rows.some(r => r.value_bool) };
        case 'select':
          return { ...base, type, value: option(first?.option_id ?? null) };
        case 'multi_select':
          return {
            ...base,
            type,
            value: [...rows]
              .sort(
                (a, b) =>
                  (options.find(o => o.id === a.option_id)?.position ?? 0) -
                  (options.find(o => o.id === b.option_id)?.position ?? 0),
              )
              .map(r => option(r.option_id))
              .filter((o): o is NonNullable<typeof o> => o !== null),
          };
        case 'user':
          return { ...base, type, value: first?.user_id ? (people.get(first.user_id) ?? null) : null };
        case 'multi_user':
          return {
            ...base,
            type,
            value: rows
              .map(r => (r.user_id ? people.get(r.user_id) : undefined))
              .filter((p): p is MemberRef => p !== undefined)
              .sort((a, b) => a.username.localeCompare(b.username)),
          };
      }
    });
}

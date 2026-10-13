import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import {
  CUSTOM_FIELD_TYPES,
  LABEL_COLORS,
  type BulkUpdateResult,
  type CustomField,
  type Issue,
} from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { ToolError } from '../errors.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { calendarOf, issueKey, projectKeyOf, projectOrganization, usernameIn } from '../resolve.ts';
import { code, facts, join, list, table } from '../render.ts';
import { customFieldFacts, issueHeading } from '../render-issue.ts';

type Scope = { org?: string };
const scope = (org: string | undefined): Scope => (org ? { org } : {});

const TYPE_LABELS: Record<(typeof CUSTOM_FIELD_TYPES)[number], string> = {
  text: 'Text',
  markdown: 'Markdown',
  number: 'Number',
  integer: 'Integer',
  date: 'Date',
  datetime: 'Date and time',
  checkbox: 'Checkbox',
  select: 'Select',
  multi_select: 'Multi-select',
  user: 'User',
  multi_user: 'Multi-user',
  url: 'URL',
  duration: 'Duration',
};

const PERSON_TYPES = new Set(['user', 'multi_user']);

export const fieldValue = z
  .union([z.string().max(20_000), z.number(), z.boolean(), z.array(z.string().trim().min(1).max(200)).max(50)])
  .nullable();

export const customFieldsArg = z
  .record(z.string().trim().min(1).max(100), fieldValue)
  .describe(
    'Custom field values by field name or slug, e.g. {"Severity": "High", "platforms": ["Web", "iOS"], "Reviewer": "@casey", "Launch": "2026-10-01", "Budget": 12.5, "Blocking": true, "Review time": "1h 30m"}. Options by name, people as @username, me or a full name, dates YYYY-MM-DD, datetimes ISO, durations "1h 30m". null clears one. describe_project_schema and list_custom_fields list the fields.',
  );

const fieldArg = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .describe('The field by name or slug, e.g. "Severity" or "severity".');

async function fieldsOf(ctx: ToolContext, key: string, org: string | undefined): Promise<CustomField[]> {
  return ctx.memo(`custom-fields:${key}:${org ?? ''}`, async () => {
    const { data } = await ctx.api.get<CustomField[]>(path`/v1/projects/${key}/custom-fields`, scope(org));
    return data;
  });
}

const findField = (fields: CustomField[], name: string) => {
  const folded = name.trim().toLowerCase();
  return fields.find(f => f.slug === folded) ?? fields.find(f => f.name.toLowerCase() === folded);
};

/**
 * People in custom field values go to the API as usernames; `me` and full names are resolved here,
 * as for assignees. Everything else passes through for the API to check.
 */
export async function customFieldsBody(
  ctx: ToolContext,
  projectKey: string,
  org: string | undefined,
  values: Record<string, z.infer<typeof fieldValue>>,
): Promise<Record<string, unknown>> {
  const needsPeople = Object.values(values).some(
    v => (typeof v === 'string' && !v.startsWith('@')) || (Array.isArray(v) && v.some(x => !x.startsWith('@'))),
  );
  const fields = needsPeople ? await fieldsOf(ctx, projectKey, org) : [];
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    const field = findField(fields, name);
    if (!field || !PERSON_TYPES.has(field.type) || value === null) {
      out[name] = value;
      continue;
    }
    const resolve = (v: string) => usernameIn(ctx, projectKey, org, v);
    out[name] = Array.isArray(value) ? await Promise.all(value.map(resolve)) : await resolve(String(value));
  }
  return out;
}

function defaultText(f: CustomField): string {
  if (f.default_value === null) return '—';
  return Array.isArray(f.default_value) ? f.default_value.join(', ') : String(f.default_value);
}

function rangeText(f: CustomField): string | null {
  const { min, max, decimals } = f.config;
  const parts = [
    min !== undefined || max !== undefined ? `${min ?? '…'} to ${max ?? '…'}` : null,
    decimals !== undefined ? `${decimals} decimals` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

export function fieldsTable(fields: readonly CustomField[]): string {
  return table(
    ['Field', 'Slug', 'Type', 'Required', 'Default', 'Applies to', 'Options'],
    fields.map(f => [
      f.name +
        (f.is_archived ? ' (archived)' : '') +
        (f.time_role ? ` (the project's ${f.time_role === 'estimation' ? 'Estimation' : 'Spent time'})` : ''),
      code(f.slug),
      TYPE_LABELS[f.type] + (rangeText(f) ? ` (${rangeText(f)})` : ''),
      f.is_required ? 'Yes' : 'No',
      defaultText(f),
      f.applies_to.length ? f.applies_to.join(', ') : 'All types',
      f.options.length ? f.options.map(o => o.name + (o.is_archived ? ' (archived)' : '')).join(', ') : '—',
    ]),
  );
}

/** For describe_project_schema and project://: the fields, what each takes and how a query names it. */
export function customFieldsSection(fields: readonly CustomField[]): string {
  const live = fields.filter(f => !f.is_archived);
  if (!live.length) return '**Custom fields**: none. create_custom_field adds one.';
  return join(
    `**Custom fields** (${live.length}) — set with \`custom_fields\` on create_issue, update_issue, bulk_update_issues or set_field_values; search by slug, e.g. ${code(`${live[0]!.slug}: …`)}`,
    fieldsTable(live),
  );
}

function fieldDetails(f: CustomField): string {
  return join(
    `**${f.name}** — ${code(f.slug)}, ${TYPE_LABELS[f.type]}${f.is_archived ? ', archived' : ''}`,
    facts([
      ['Required', f.is_required ? 'Yes' : 'No'],
      ['Default', f.default_value === null ? null : defaultText(f)],
      ['Empty label', f.empty_label],
      ['Applies to', f.applies_to.length ? f.applies_to.join(', ') : 'All types'],
      ['Range', rangeText(f)],
      [
        'Options',
        f.options.length
          ? f.options.map(o => `${o.name} (${o.color})${o.is_archived ? ' archived' : ''}`).join(', ')
          : null,
      ],
      [
        'Time tracking',
        f.time_role ? (f.time_role === 'estimation' ? "The project's Estimation" : "The project's Spent time") : null,
      ],
      ['Issues with a value', String(f.issue_count)],
      ['Position', String(f.position)],
    ]),
  );
}

const typeArg = z
  .enum(CUSTOM_FIELD_TYPES)
  .describe(
    'text (one line), markdown, number, integer, date, datetime, checkbox, select, multi_select, user, multi_user, url or duration.',
  );
const optionArg = z.union([
  z.string().trim().min(1).max(60),
  z.strictObject({
    name: z.string().trim().min(1).max(60),
    color: z.enum(LABEL_COLORS).optional().describe('A label colour such as "red-3"; default "gray-2".'),
  }),
]);
const optionsOf = (options: z.infer<typeof optionArg>[]) => options.map(o => (typeof o === 'string' ? { name: o } : o));

export const listCustomFields = defineTool({
  name: 'list_custom_fields',
  title: 'List custom fields',
  description:
    "A project's custom fields: name, slug (the search attribute), type, whether required, the default, which issue types it applies to and its options. Pass `field` for one field's detail.",
  input: z.strictObject({
    project: arg.project,
    field: fieldArg.optional(),
    archived: z.boolean().optional().describe('true lists only archived fields, false only live ones; default both.'),
    org: arg.org,
  }),
  kind: 'read',
  endpoints: ['GET /v1/projects/{key}/custom-fields', 'GET /v1/projects/{key}/custom-fields/{slug}'],
  async run(ctx, args) {
    const key = args.project.toUpperCase();
    const s = scope(args.org);
    if (args.field) {
      const { data } = await ctx.api.get<CustomField>(path`/v1/projects/${key}/custom-fields/${args.field}`, s);
      return { markdown: fieldDetails(data) };
    }
    const { data } = await ctx.api.get<CustomField[]>(path`/v1/projects/${key}/custom-fields`, {
      ...s,
      query: { archived: args.archived },
    });
    return {
      markdown: data.length
        ? join(`**${data.length} custom ${data.length === 1 ? 'field' : 'fields'}** in ${key}`, fieldsTable(data))
        : `${key} has no custom fields${args.archived !== undefined ? ' of that kind' : ''}.`,
    };
  },
});

export const createCustomField = defineTool({
  name: 'create_custom_field',
  title: 'Create custom field',
  description:
    'Adds a custom field to a project: name, type, options for a select, the issue types it applies to (all by default), required, a default, an empty label, and min / max / decimals for numbers. The slug - the search attribute - comes from the name unless given, and never changes. At most 50 live fields per project. Needs a Project Admin and admin:project.',
  input: z.strictObject({
    project: arg.project,
    name: z.string().trim().min(1).max(60),
    type: typeArg,
    slug: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .optional()
      .describe('Lower-case letters, digits and hyphens, e.g. "severity".'),
    options: z
      .array(optionArg)
      .max(200)
      .optional()
      .describe('select / multi_select: e.g. ["Low", {"name": "High", "color": "red-3"}].'),
    applies_to: z
      .array(z.string().trim().min(1).max(100))
      .max(50)
      .optional()
      .describe('Issue type names, e.g. ["Bug"]. Default every type.'),
    required: z.boolean().optional().describe('New issues must have a value (a checkbox cannot be required).'),
    default: fieldValue.optional().describe('Pre-filled on new issues, in the same form as a value.'),
    empty_label: z.string().trim().min(1).max(60).optional().describe('Shown when empty; default "No <name>".'),
    min: z.number().optional().describe('number / integer: the smallest value.'),
    max: z.number().optional().describe('number / integer: the largest value.'),
    decimals: z.number().int().min(0).max(6).optional().describe('number: decimal places allowed.'),
    position: z.number().int().min(0).max(999).optional().describe('0 is first.'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/projects/{key}/custom-fields'],
  async run(ctx, args) {
    const key = args.project.toUpperCase();
    const config = {
      ...(args.min !== undefined ? { min: args.min } : {}),
      ...(args.max !== undefined ? { max: args.max } : {}),
      ...(args.decimals !== undefined ? { decimals: args.decimals } : {}),
    };
    const { data } = await ctx.api.send<CustomField>('POST', path`/v1/projects/${key}/custom-fields`, {
      ...scope(args.org),
      body: {
        name: args.name,
        type: args.type,
        ...(args.slug ? { slug: args.slug } : {}),
        ...(args.options?.length ? { options: optionsOf(args.options) } : {}),
        ...(args.applies_to ? { applies_to: args.applies_to } : {}),
        ...(args.required !== undefined ? { is_required: args.required } : {}),
        ...(args.default !== undefined ? { default_value: args.default } : {}),
        ...(args.empty_label ? { empty_label: args.empty_label } : {}),
        ...(Object.keys(config).length ? { config } : {}),
        ...(args.position !== undefined ? { position: args.position } : {}),
      },
    });
    return { markdown: join(`Created in ${key}:`, fieldDetails(data), `Search it with ${code(`${data.slug}: …`)}.`) };
  },
});

const updateCustomFieldInput = z.strictObject({
  project: arg.project,
  field: fieldArg,
  name: z.string().trim().min(1).max(60).optional(),
  required: z.boolean().optional(),
  default: fieldValue.optional().describe('The new default; null removes it.'),
  empty_label: z.string().trim().min(1).max(60).nullable().optional().describe('null returns to "No <name>".'),
  applies_to: z
    .array(z.string().trim().min(1).max(100))
    .max(50)
    .optional()
    .describe('Issue type names; [] applies to every type.'),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  decimals: z.number().int().min(0).max(6).nullable().optional(),
  position: z.number().int().min(0).max(999).optional(),
  archived: z.boolean().optional().describe('true hides it and freezes its values; false brings it back.'),
  add_options: z.array(optionArg).max(200).optional(),
  update_options: z
    .array(
      z.strictObject({
        option: z.string().trim().min(1).max(60).describe('The option as it is named now.'),
        name: z.string().trim().min(1).max(60).optional().describe('Rename it; every issue follows.'),
        color: z.enum(LABEL_COLORS).optional(),
        position: z.number().int().min(0).max(999).optional(),
        archived: z.boolean().optional().describe('Kept where set, no longer offered.'),
      }),
    )
    .max(200)
    .optional(),
  remove_options: z
    .array(
      z.strictObject({
        option: z.string().trim().min(1).max(60),
        move_to: z.string().trim().min(1).max(60).optional().describe('Where issues holding it move, when any do.'),
      }),
    )
    .max(200)
    .optional(),
  org: arg.org,
});

type FieldUpdate = z.output<typeof updateCustomFieldInput>;

const shown = (value: unknown) => (Array.isArray(value) ? value.map(v => `“${v}”`).join(', ') : `“${String(value)}”`);
type CatalogueKey = Parameters<typeof t>[0];
type FieldPart = CatalogueKey extends infer K ? (K extends `mcp.action.custom_field.${infer P}` ? P : never) : never;
const part = (key: FieldPart, values?: Record<string, string | number>) =>
  t(`mcp.action.custom_field.${key}` as CatalogueKey, values);
const removal = (o: { option: string; move_to?: string | undefined }) =>
  o.move_to ? part('remove_option_moving', { option: o.option, move_to: o.move_to }) : `“${o.option}”`;

/** Every change the call would make, in words, so the person sees what they approve. */
function fieldChanges(args: FieldUpdate): string[] {
  const changes: string[] = [];
  if (args.name !== undefined) changes.push(part('rename', { name: args.name }));
  if (args.required !== undefined) changes.push(part(args.required ? 'required' : 'optional'));
  if (args.default !== undefined) {
    changes.push(args.default === null ? part('default_clear') : part('default', { value: shown(args.default) }));
  }
  if (args.empty_label !== undefined) {
    changes.push(
      args.empty_label === null ? part('empty_label_reset') : part('empty_label', { label: args.empty_label }),
    );
  }
  if (args.applies_to !== undefined) {
    changes.push(
      args.applies_to.length ? part('applies_to', { types: shown(args.applies_to) }) : part('applies_to_all'),
    );
  }
  const range = (['min', 'max', 'decimals'] as const)
    .filter(k => args[k] !== undefined)
    .map(k => (args[k] === null ? part('range_cleared', { setting: k }) : part(`range_${k}`, { value: args[k]! })));
  if (range.length) changes.push(part('range', { settings: range.join(', ') }));
  if (args.position !== undefined) changes.push(part('position', { position: args.position }));
  if (args.archived !== undefined) changes.push(part(args.archived ? 'archive' : 'unarchive'));
  if (args.add_options?.length) {
    changes.push(part('add_options', { options: shown(optionsOf(args.add_options).map(o => o.name)) }));
  }
  for (const u of args.update_options ?? []) {
    const what = [
      u.name !== undefined ? part('option_rename', { name: u.name }) : null,
      u.color !== undefined ? part('option_color', { color: u.color }) : null,
      u.position !== undefined ? part('option_position', { position: u.position }) : null,
      u.archived !== undefined ? part(u.archived ? 'option_archive' : 'option_unarchive') : null,
    ].filter((w): w is string => w !== null);
    if (what.length) changes.push(part('change_option', { option: u.option, changes: what.join(', ') }));
  }
  if (args.remove_options?.length) {
    changes.push(part('remove_options', { options: args.remove_options.map(removal).join(', ') }));
  }
  return changes;
}

export const updateCustomField = defineTool({
  name: 'update_custom_field',
  title: 'Update custom field',
  description:
    'Changes a custom field: rename it (the slug stays), required, default, empty label, the issue types it applies to, range, position, archive or unarchive; and its options - add, rename (every issue follows), recolour, reorder, archive, or remove (an option in use needs move_to). Archiving keeps every value; delete_custom_field destroys them. Needs a Project Admin and admin:project. Asks you to confirm before acting.',
  input: updateCustomFieldInput,
  kind: 'destructive',
  endpoints: [
    'GET /v1/projects/{key}/custom-fields/{slug}',
    'PATCH /v1/projects/{key}/custom-fields/{slug}',
    'POST /v1/projects/{key}/custom-fields/{slug}/options',
    'PATCH /v1/projects/{key}/custom-fields/{slug}/options/{name}',
    'DELETE /v1/projects/{key}/custom-fields/{slug}/options/{name}',
  ],
  async describeAction(ctx, args) {
    const key = args.project.toUpperCase();
    const { data } = await ctx.api.get<CustomField>(
      path`/v1/projects/${key}/custom-fields/${args.field}`,
      scope(args.org),
    );
    const changes = fieldChanges(args);
    if (!changes.length) throw ToolError.local('mcp.nothing_to_change', { tool: 'update_custom_field' });
    return t('mcp.action.custom_field_change', { name: data.name, project: key, changes: changes.join('; ') });
  },
  async run(ctx, args) {
    const key = args.project.toUpperCase();
    const s = scope(args.org);
    const { data: current } = await ctx.api.get<CustomField>(path`/v1/projects/${key}/custom-fields/${args.field}`, s);
    const base = path`/v1/projects/${key}/custom-fields/${current.slug}`;
    const body: Record<string, unknown> = {};
    if (args.name !== undefined) body['name'] = args.name;
    if (args.required !== undefined) body['is_required'] = args.required;
    if (args.default !== undefined) body['default_value'] = args.default;
    if (args.empty_label !== undefined) body['empty_label'] = args.empty_label;
    if (args.applies_to !== undefined) body['applies_to'] = args.applies_to;
    if (args.position !== undefined) body['position'] = args.position;
    if (args.archived !== undefined) body['is_archived'] = args.archived;
    if (args.min !== undefined || args.max !== undefined || args.decimals !== undefined) {
      const config: Record<string, number | undefined> = { ...current.config };
      for (const k of ['min', 'max', 'decimals'] as const) {
        const v = args[k];
        if (v === null) delete config[k];
        else if (v !== undefined) config[k] = v;
      }
      body['config'] = config;
    }

    const steps: [string, () => Promise<unknown>][] = [];
    for (const option of optionsOf(args.add_options ?? [])) {
      steps.push([
        `option ${option.name} added`,
        () => ctx.api.send('POST', `${base}/options`, { ...s, body: option }),
      ]);
    }
    for (const u of args.update_options ?? []) {
      const patch: Record<string, unknown> = {};
      if (u.name !== undefined) patch['name'] = u.name;
      if (u.color !== undefined) patch['color'] = u.color;
      if (u.position !== undefined) patch['position'] = u.position;
      if (u.archived !== undefined) patch['is_archived'] = u.archived;
      steps.push([
        `option ${u.option} changed`,
        () => ctx.api.send('PATCH', `${base}/options/${encodeURIComponent(u.option)}`, { ...s, body: patch }),
      ]);
    }
    for (const r of args.remove_options ?? []) {
      steps.push([
        `option ${r.option} removed`,
        () =>
          ctx.api.send('DELETE', `${base}/options/${encodeURIComponent(r.option)}`, {
            ...s,
            ...(r.move_to ? { query: { move_to: r.move_to } } : {}),
          }),
      ]);
    }
    // Field changes last: renaming or archiving first would change what the option routes address.
    if (Object.keys(body).length) steps.push(['field', () => ctx.api.send('PATCH', base, { ...s, body })]);
    if (!steps.length) throw ToolError.local('mcp.nothing_to_change', { tool: 'update_custom_field' });

    const applied: string[] = [];
    for (const [label, step] of steps) {
      try {
        await step();
      } catch (error) {
        if (error instanceof ToolError && applied.length) {
          const hint = t('error.mcp.partially_applied', { tool: 'update_custom_field', applied: applied.join(', ') });
          throw new ToolError({ ...error.body, hints: [...(error.body.hints ?? []), hint] });
        }
        throw error;
      }
      applied.push(label);
    }
    const { data } = await ctx.api.get<CustomField>(base, s);
    return { markdown: join(`Updated in ${key}:`, fieldDetails(data)) };
  },
});

export const deleteCustomField = defineTool({
  name: 'delete_custom_field',
  title: 'Delete custom field',
  description:
    'Deletes a custom field and every value it holds; history keeps what was recorded. A project using it as its Estimation or Spent time goes back to the built-in. To keep the values, archive it with update_custom_field instead. Asks you to confirm before acting. Needs a Project Admin and admin:project.',
  input: z.strictObject({ project: arg.project, field: fieldArg, org: arg.org }),
  kind: 'destructive',
  endpoints: ['GET /v1/projects/{key}/custom-fields/{slug}', 'DELETE /v1/projects/{key}/custom-fields/{slug}'],
  async describeAction(ctx, args) {
    const key = args.project.toUpperCase();
    const { data } = await ctx.api.get<CustomField>(
      path`/v1/projects/${key}/custom-fields/${args.field}`,
      scope(args.org),
    );
    return t('mcp.action.custom_field_delete', { name: data.name, project: key, count: data.issue_count });
  },
  async run(ctx, args) {
    const key = args.project.toUpperCase();
    const s = scope(args.org);
    const { data: field } = await ctx.api.get<CustomField>(path`/v1/projects/${key}/custom-fields/${args.field}`, s);
    const { data } = await ctx.api.send<CustomField>(
      'DELETE',
      path`/v1/projects/${key}/custom-fields/${field.slug}`,
      s,
    );
    return { markdown: `Deleted the custom field **${data.name}** (${code(data.slug)}) from ${key}, with its values.` };
  },
});

export const setFieldValues = defineTool({
  name: 'set_field_values',
  title: 'Set custom field values',
  description:
    'Sets custom field values on one issue or on many at once (the same values on each, each issue checked on its own). Only the fields you name change; null clears one. For other fields in the same call, use update_issue or bulk_update_issues with `custom_fields`.',
  input: z.strictObject({
    issues: z
      .union([arg.issue, z.array(arg.issue).min(1).max(500)])
      .describe('One issue key, or a list, e.g. ["PP-12", "PP-14"].'),
    values: customFieldsArg,
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['PATCH /v1/issues/{key}', 'POST /v1/issues/bulk-update', 'GET /v1/projects/{key}/custom-fields'],
  async run(ctx, args) {
    const keys = (Array.isArray(args.issues) ? args.issues : [args.issues]).map(issueKey);
    if (!Object.keys(args.values).length) throw ToolError.local('mcp.nothing_to_change', { tool: 'set_field_values' });
    const s = scope(args.org);
    const custom_fields = await customFieldsBody(ctx, projectKeyOf(keys[0]!), args.org, args.values);
    if (keys.length === 1) {
      const { data: issue } = await ctx.api.send<Issue>('PATCH', path`/v1/issues/${keys[0]!}`, {
        ...s,
        body: { custom_fields },
      });
      const calendar = await projectOrganization(ctx, issue.project.key, args.org)
        .then(calendarOf)
        .catch(() => undefined);
      return {
        markdown: join(
          issueHeading(issue, ctx.appBaseUrl, 'Updated'),
          customFieldFacts(issue, calendar) ?? '_No custom fields apply to this issue._',
        ),
      };
    }
    const { data } = await ctx.api.send<BulkUpdateResult[]>('POST', '/v1/issues/bulk-update', {
      ...s,
      body: { issues: keys, changes: { custom_fields } },
    });
    const by = (r: BulkUpdateResult['result']) => data.filter(d => d.result === r);
    const failed = by('failed');
    return {
      markdown: join(
        `**${by('updated').length} updated**, ${by('unchanged').length} already so, ${failed.length} failed — of ${data.length}.`,
        by('updated').length
          ? `Updated: ${by('updated')
              .map(d => d.key)
              .join(', ')}`
          : null,
        failed.length
          ? table(
              ['Issue', 'Error', 'Reason'],
              failed.map(f => [
                f.key,
                code(f.error?.code ?? 'failed'),
                (f.error?.message ?? '') +
                  (f.error?.valid_values?.length ? ` Valid: ${list(f.error.valid_values)}` : ''),
              ]),
            )
          : null,
      ),
    };
  },
});

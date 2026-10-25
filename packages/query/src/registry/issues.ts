import { type AttributeDefinition, type AttributeType, type Registry, buildRegistry, ISSUE_LINKS } from './registry.ts';

export type CustomAttributeType = Exclude<AttributeType, 'has' | 'sort' | 'key' | 'project'>;

export interface CustomFieldAttribute {
  slug: string;
  name: string;
  type: CustomAttributeType;
  /** The field's empty label; `No <name>` when absent. */
  empty?: string;
}

export interface IssueRegistryOptions {
  customFields?: readonly CustomFieldAttribute[];
}

const ISSUE_ATTRIBUTES: readonly AttributeDefinition[] = [
  {
    name: 'project',
    type: 'project',
    description: { key: 'query.attribute.project' },
    group: { key: 'query.group.project' },
  },
  {
    name: 'priority',
    type: 'enum',
    description: { key: 'query.attribute.priority' },
    group: { key: 'query.group.priority' },
    sortable: true,
    shorthand: true,
  },
  {
    name: 'status',
    type: 'enum',
    description: { key: 'query.attribute.status' },
    group: { key: 'query.group.status' },
    sortable: true,
    shorthand: true,
  },
  {
    name: 'type',
    type: 'enum',
    description: { key: 'query.attribute.type' },
    group: { key: 'query.group.type' },
    sortable: true,
    shorthand: true,
  },
  {
    name: 'assignee',
    type: 'user',
    description: { key: 'query.attribute.assignee' },
    group: { key: 'query.group.user' },
    empty: 'Unassigned',
  },
  {
    name: 'created by',
    type: 'user',
    description: { key: 'query.attribute.created_by' },
    group: { key: 'query.group.user' },
  },
  {
    name: 'updated by',
    type: 'user',
    description: { key: 'query.attribute.updated_by' },
    group: { key: 'query.group.user' },
  },
  {
    name: 'commenter',
    type: 'user',
    description: { key: 'query.attribute.commenter' },
    group: { key: 'query.group.user' },
  },
  { name: 'commented', type: 'instant', description: { key: 'query.attribute.commented' } },
  { name: 'comments', type: 'text', description: { key: 'query.attribute.comments' } },
  { name: 'created', type: 'instant', description: { key: 'query.attribute.created' }, sortable: true },
  { name: 'updated', type: 'instant', description: { key: 'query.attribute.updated' }, sortable: true },
  {
    name: 'resolved date',
    type: 'instant',
    description: { key: 'query.attribute.resolved_date' },
    sortable: true,
    empty: 'Unresolved',
  },
  {
    name: 'due date',
    type: 'date',
    description: { key: 'query.attribute.due_date' },
    sortable: true,
    empty: 'No due date',
  },
  {
    name: 'start date',
    type: 'date',
    description: { key: 'query.attribute.start_date' },
    sortable: true,
    empty: 'No start date',
  },
  {
    name: 'sprint',
    type: 'enum',
    description: { key: 'query.attribute.sprint' },
    group: { key: 'query.group.sprint' },
    shorthand: true,
    empty: 'No sprint',
  },
  {
    name: 'tag',
    type: 'enum',
    description: { key: 'query.attribute.tag' },
    group: { key: 'query.group.tag' },
    shorthand: true,
  },
  { name: 'attachments', type: 'text', description: { key: 'query.attribute.attachments' } },
  {
    name: 'work author',
    type: 'user',
    description: { key: 'query.attribute.work_author' },
    group: { key: 'query.group.user' },
  },
  {
    name: 'work type',
    type: 'enum',
    description: { key: 'query.attribute.work_type' },
    group: { key: 'query.group.work_type' },
  },
  {
    name: 'spent time',
    type: 'duration',
    description: { key: 'query.attribute.spent_time' },
    sortable: true,
    empty: 'No spent time',
  },
  {
    name: 'estimation',
    type: 'duration',
    description: { key: 'query.attribute.estimation' },
    sortable: true,
    empty: 'No estimation',
  },
  {
    name: 'story points',
    type: 'number',
    description: { key: 'query.attribute.story_points' },
    sortable: true,
    empty: 'No story points',
  },
  { name: 'votes', type: 'number', description: { key: 'query.attribute.votes' }, sortable: true },
  {
    name: 'pull request',
    type: 'enum',
    description: { key: 'query.attribute.pull_request' },
    group: { key: 'query.group.pull_request' },
    empty: 'No pull request',
  },
  {
    name: 'development',
    type: 'enum',
    description: { key: 'query.attribute.development' },
    group: { key: 'query.group.development' },
  },
  { name: 'repository', type: 'enum', description: { key: 'query.attribute.repository' } },
  { name: 'branch', type: 'text', description: { key: 'query.attribute.branch' } },
  { name: 'key', type: 'key', description: { key: 'query.attribute.key' }, sortable: true },
  { name: 'has', type: 'has', description: { key: 'query.attribute.has' } },
  { name: 'sort by', type: 'sort', description: { key: 'query.attribute.sort_by' } },
];

/** Fixed values of the git attributes: a pull request's state, and the issue's development badge. */
export const GIT_QUERY_VALUES: Readonly<Record<'pull request' | 'development', readonly string[]>> = {
  'pull request': ['Open', 'Draft', 'Merged', 'Closed'],
  development: [
    'Merged',
    'CI failing',
    'Changes requested',
    'Approved',
    'In review',
    'Draft',
    'Branch active',
    'Reverted',
    'None',
  ],
};

const GIT_ONLY = new Set(['pull request', 'development', 'repository', 'branch', 'commits']);

/** The registry autocomplete offers where no project has a repository: the parser still accepts the rest. */
export function withoutGitAttributes(registry: Registry): Registry {
  return {
    ...registry,
    attributes: registry.attributes.filter(a => !GIT_ONLY.has(a.name)),
    existence: registry.existence.filter(name => !GIT_ONLY.has(name)),
    attribute: name => {
      const found = registry.attribute(name);
      return found && GIT_ONLY.has(found.name) ? undefined : found;
    },
  };
}

const RESERVED = new Set(ISSUE_ATTRIBUTES.map(attribute => attribute.name));

function customFieldAttribute(field: CustomFieldAttribute): AttributeDefinition {
  const params = { name: field.name };
  return {
    name: field.slug.toLowerCase(),
    type: field.type,
    description: { key: 'query.attribute.custom_field', params },
    group: { key: 'query.group.custom_field', params },
    sortable: field.type !== 'text',
    shorthand: field.type === 'enum',
    // A checkbox is never empty: unchecked is `No`.
    ...(field.type === 'boolean' ? {} : { empty: field.empty ?? `No ${field.name}` }),
    custom: true,
  };
}

/** Names a custom field slug may not take: every built-in attribute, plus words the grammar reserves. */
export const RESERVED_ISSUE_ATTRIBUTES: ReadonlySet<string> = new Set([
  ...RESERVED,
  'aggregate',
  'description',
  ...ISSUE_LINKS.map(link => link.name),
]);

export const ISSUE_CATEGORIES = ['resolved', 'unresolved', 'star'] as const;

/** The issue vocabulary from search-query-language.md, plus the organisation's custom fields by slug. */
export function issueRegistry(options: IssueRegistryOptions = {}): Registry {
  const custom = (options.customFields ?? [])
    .filter(field => !RESERVED.has(field.slug.toLowerCase()))
    .map(customFieldAttribute);
  return buildRegistry({
    attributes: [...ISSUE_ATTRIBUTES, ...custom],
    links: ISSUE_LINKS,
    categories: ISSUE_CATEGORIES,
    presenceOnly: ['description', 'commits'],
  });
}

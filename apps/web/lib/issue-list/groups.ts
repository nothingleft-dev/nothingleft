import type { GroupChoice } from '@lib/issue-list/url-state';

export type BuiltinGroup = Exclude<GroupChoice, `custom:${string}`>;

export const GROUP_LABELS: Record<BuiltinGroup, string> = {
  none: 'None',
  project: 'Project',
  status: 'Status',
  priority: 'Priority',
  type: 'Type',
  assignee: 'Assignee',
  tag: 'Tag',
  sprint: 'Sprint',
  due: 'Due date',
};

export const GROUP_CHOICES: readonly BuiltinGroup[] = [
  'none',
  'project',
  'status',
  'priority',
  'type',
  'assignee',
  'tag',
  'sprint',
  'due',
];

/** A group field as a heading: the built-in's name, or a custom field's slug when its name is not at hand. */
export const groupFieldLabel = (field: string) =>
  (GROUP_LABELS as Record<string, string>)[field] ?? field.replace(/^custom:/, '');

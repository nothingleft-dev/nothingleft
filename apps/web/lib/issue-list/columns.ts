import { CUSTOM_FIELD_SLUG_PATTERN, type CustomFieldType, type IssueCsvColumnInput } from '@nothingleft/types';

export type BuiltinColumnId =
  | 'project'
  | 'status'
  | 'assignee'
  | 'due'
  | 'start'
  | 'sprint'
  | 'updated'
  | 'created'
  | 'estimate'
  | 'points'
  | 'votes';

/** A custom field's column is `custom:<slug>`, the form saved views and the CSV export use. */
export type ColumnId = BuiltinColumnId | `custom:${string}`;

export interface ColumnDef {
  id: ColumnId;
  label: string;
  /** The grid track for this column. */
  width: string;
  align?: 'right';
  csv?: IssueCsvColumnInput;
  /** The `sort by:` attribute a header click sorts on. */
  sort?: string;
  /** Set on a custom field's column. */
  fieldType?: CustomFieldType;
  decimals?: number | undefined;
}

export const COLUMNS: readonly ColumnDef[] = [
  { id: 'project', label: 'Project', width: '56px', csv: 'project' },
  { id: 'status', label: 'Status', width: '150px', csv: 'status', sort: 'status' },
  { id: 'assignee', label: 'Assignee', width: '140px', csv: 'assignees' },
  { id: 'due', label: 'Due', width: '84px', csv: 'due_date', sort: '{due date}' },
  { id: 'start', label: 'Start', width: '84px', csv: 'start_date', sort: '{start date}' },
  { id: 'sprint', label: 'Sprint', width: '112px', csv: 'sprint' },
  { id: 'updated', label: 'Updated', width: '92px', align: 'right', csv: 'updated_at', sort: 'updated' },
  { id: 'created', label: 'Created', width: '92px', align: 'right', csv: 'created_at', sort: 'created' },
  { id: 'estimate', label: 'Estimate', width: '72px', align: 'right', csv: 'estimation', sort: 'estimation' },
  { id: 'points', label: 'Story points', width: '84px', align: 'right', csv: 'story_points', sort: '{story points}' },
  { id: 'votes', label: 'Votes', width: '56px', align: 'right', csv: 'vote_count', sort: 'votes' },
];

export const DEFAULT_COLUMNS: readonly ColumnId[] = ['status', 'assignee', 'due', 'updated'];

/** A custom field as the list knows it: from the project's fields, or from the rows on screen. */
export interface CustomColumn {
  slug: string;
  name: string;
  type: CustomFieldType;
  /** A number field's decimal places, where the list knows the field's settings. */
  decimals?: number | undefined;
}

const CUSTOM_WIDTH: Record<CustomFieldType, string> = {
  text: '140px',
  markdown: '160px',
  url: '140px',
  number: '80px',
  integer: '72px',
  duration: '72px',
  date: '84px',
  datetime: '136px',
  checkbox: '64px',
  select: '112px',
  multi_select: '140px',
  user: '140px',
  multi_user: '140px',
};

const UNSORTABLE: ReadonlySet<CustomFieldType> = new Set(['text', 'markdown', 'url']);
const RIGHT: ReadonlySet<CustomFieldType> = new Set(['number', 'integer', 'duration']);

export const customColumnDef = ({ slug, name, type, decimals }: CustomColumn): ColumnDef => ({
  id: `custom:${slug}`,
  label: name,
  width: CUSTOM_WIDTH[type],
  ...(RIGHT.has(type) ? { align: 'right' as const } : {}),
  csv: `custom:${slug}`,
  ...(UNSORTABLE.has(type) ? {} : { sort: slug }),
  fieldType: type,
  decimals,
});

/** The built-in columns, then the custom fields in their field order. */
export const columnDefs = (custom: readonly CustomColumn[] = []): ColumnDef[] => [
  ...COLUMNS,
  ...custom.map(customColumnDef),
];

const BUILTIN = new Set<string>(COLUMNS.map(c => c.id));
export const isCustomColumn = (value: string): value is `custom:${string}` =>
  value.startsWith('custom:') && CUSTOM_FIELD_SLUG_PATTERN.test(value.slice('custom:'.length));
export const isColumnId = (value: string): value is ColumnId => BUILTIN.has(value) || isCustomColumn(value);

/** Keeps the fixed order of `COLUMNS`, then custom columns in the order they arrive. */
export const orderColumns = (ids: readonly string[]): ColumnId[] => [
  ...COLUMNS.filter(c => ids.includes(c.id)).map(c => c.id),
  ...ids.filter(isCustomColumn).filter((id, i, all) => all.indexOf(id) === i),
];

/** Only the chosen columns this list can draw: a custom field of another project is left out. */
export const shownColumns = (visible: readonly ColumnId[], defs: readonly ColumnDef[]): ColumnDef[] =>
  defs.filter(d => visible.includes(d.id));

/** `key` and `title` always export; the rest follows the visible columns, plus what identifies the row. */
export const csvColumnsFor = (visible: readonly ColumnId[], defs: readonly ColumnDef[]): IssueCsvColumnInput[] => {
  const picked = shownColumns(visible, defs).flatMap(c => (c.csv ? [c.csv] : []));
  return ['key', 'title', 'priority', 'type', ...picked];
};

/** The fixed tracks before the optional columns: checkbox · P · T · key · title. */
export const FIXED_TRACKS = '28px 18px 18px 84px minmax(200px,1fr)';

export const gridTemplate = (shown: readonly ColumnDef[]) => [FIXED_TRACKS, ...shown.map(c => c.width)].join(' ');

/** The narrowest the table can be with a readable title: tracks, 8px gaps and the row's side padding. */
export const tableMinWidth = (shown: readonly ColumnDef[]) =>
  28 +
  18 +
  18 +
  84 +
  200 +
  shown.reduce((sum, c) => sum + Number.parseInt(c.width, 10), 0) +
  8 * (4 + shown.length) +
  16;

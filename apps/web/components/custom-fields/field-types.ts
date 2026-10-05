import {
  Calendar,
  CalendarClock,
  CircleDot,
  FileText,
  Hash,
  Link2,
  ListChecks,
  SquareCheck,
  Timer,
  Type,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { CustomField, CustomFieldType } from '@nothingleft/types';

export interface FieldTypeMeta {
  label: string;
  hint: string;
  icon: LucideIcon;
}

export const FIELD_TYPE_META: Record<CustomFieldType, FieldTypeMeta> = {
  text: { label: 'Text', hint: 'One line, up to 1,000 characters', icon: Type },
  markdown: { label: 'Markdown', hint: 'Formatted text, up to 16 KB', icon: FileText },
  url: { label: 'URL', hint: 'A web address', icon: Link2 },
  number: { label: 'Number', hint: 'A number, optionally in a range with set decimals', icon: Hash },
  integer: { label: 'Integer', hint: 'A whole number, optionally in a range', icon: Hash },
  duration: { label: 'Duration', hint: 'Time, as 1w 1d 1h 1m', icon: Timer },
  date: { label: 'Date', hint: 'A calendar date, the same in every timezone', icon: Calendar },
  datetime: { label: 'Date and time', hint: 'A moment, shown in each reader’s timezone', icon: CalendarClock },
  checkbox: { label: 'Checkbox', hint: 'Yes or no', icon: SquareCheck },
  select: { label: 'Select', hint: 'One option from a list', icon: CircleDot },
  multi_select: { label: 'Multi-select', hint: 'Several options from a list', icon: ListChecks },
  user: { label: 'User', hint: 'One member of the project', icon: User },
  multi_user: { label: 'Multi-user', hint: 'Several members', icon: Users },
};

/** The type picker's sections, in the manual's order. */
export const FIELD_TYPE_GROUPS: readonly { label: string; types: readonly CustomFieldType[] }[] = [
  { label: 'Text', types: ['text', 'markdown', 'url'] },
  { label: 'Numbers and time', types: ['number', 'integer', 'duration'] },
  { label: 'Dates', types: ['date', 'datetime'] },
  { label: 'Choices', types: ['select', 'multi_select', 'checkbox'] },
  { label: 'People', types: ['user', 'multi_user'] },
];

export const hasOptions = (type: CustomFieldType) => type === 'select' || type === 'multi_select';
export const hasRange = (type: CustomFieldType) => type === 'number' || type === 'integer';
export const isMulti = (type: CustomFieldType) => type === 'multi_select' || type === 'multi_user';
export const isGroupable = (type: CustomFieldType) =>
  hasOptions(type) || type === 'user' || type === 'multi_user' || type === 'checkbox';
export const isSortable = (type: CustomFieldType) => type !== 'text' && type !== 'markdown' && type !== 'url';

export const emptyLabelOf = (field: Pick<CustomField, 'name' | 'empty_label'>) =>
  field.empty_label ?? `No ${field.name}`;

/** Fields a new issue of `typeName` carries: live, applying to the type, and not standing in for Estimation or Spent time. */
export const fieldsForType = (fields: readonly CustomField[], typeName: string | null) =>
  fields
    .filter(
      f =>
        !f.is_archived &&
        f.time_role === null &&
        (f.applies_to.length === 0 || (typeName !== null && f.applies_to.includes(typeName))),
    )
    .toSorted((a, b) => a.position - b.position);

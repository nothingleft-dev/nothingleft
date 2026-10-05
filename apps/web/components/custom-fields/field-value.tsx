import type { WorkCalendar } from '@nothingleft/format';
import type { CustomFieldOptionRef, IssueCustomFieldValue, MemberRef } from '@nothingleft/types';
import { Duration } from '@components/duration';
import { PersonName } from '@components/former-member-chip';
import { AssigneeStack } from '@components/issues/assignee-stack';
import { MemberAvatar } from '@components/issues/member-avatar';
import { formatCalendarDate, formatCalendarDateShort, formatDateTime } from '@lib/datetime';
import { cn } from '@lib/utils';

export const isEmptyValue = (entry: IssueCustomFieldValue) =>
  entry.type === 'checkbox'
    ? false
    : Array.isArray(entry.value)
      ? entry.value.length === 0
      : entry.value === null || entry.value === '';

/** Markdown reduced to one line of its words, for a list cell. */
export const markdownPreview = (source: string) =>
  source
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export function OptionChip({ option, className }: { option: CustomFieldOptionRef; className?: string }) {
  return (
    <span
      className={cn(
        `l-${option.color}`,
        'inline-flex h-5 max-w-full items-center truncate rounded-sm bg-c-bg px-1.5 text-2xs font-medium text-c-fg',
        className,
      )}
    >
      {option.name}
    </span>
  );
}

/** A list cell's calmer form: the option's dot, then its name. */
function OptionDot({ option }: { option: CustomFieldOptionRef }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <i aria-hidden className={cn(`l-${option.color}`, 'inline-block size-2 flex-none rounded-full bg-c-solid')} />
      <span className="truncate">{option.name}</span>
    </span>
  );
}

function Person({ person }: { person: MemberRef }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <MemberAvatar member={person} className="size-5" />
      <PersonName person={person} />
    </span>
  );
}

interface FieldValueProps {
  entry: IssueCustomFieldValue;
  calendar: WorkCalendar;
  /** `sidebar` shows the empty label and full values; `cell` shows `--` and one truncated line. */
  variant: 'sidebar' | 'cell';
  timeZone?: string;
  /** A number field's set decimal places, so `1250.5` reads `1250.50`. */
  decimals?: number | undefined;
}

export function FieldValue({ entry, calendar, variant, timeZone, decimals }: FieldValueProps) {
  const cell = variant === 'cell';
  if (isEmptyValue(entry)) return <>{cell ? '--' : entry.empty_label}</>;

  switch (entry.type) {
    case 'text':
    case 'url':
      return <span className={cn('min-w-0', cell ? 'truncate' : '[overflow-wrap:anywhere]')}>{entry.value}</span>;
    case 'markdown':
      return <span className="min-w-0 truncate">{markdownPreview(entry.value ?? '')}</span>;
    case 'number':
    case 'integer':
      return (
        <span className="font-mono tabular">
          {entry.type === 'number' && decimals !== undefined ? entry.value!.toFixed(decimals) : entry.value}
        </span>
      );
    case 'duration':
      return <Duration minutes={entry.value ?? 0} calendar={calendar} />;
    case 'date':
      return <>{cell ? formatCalendarDateShort(entry.value!) : formatCalendarDate(entry.value!)}</>;
    case 'datetime':
      return <>{formatDateTime(entry.value!, timeZone)}</>;
    case 'checkbox':
      return <>{entry.value ? 'Yes' : 'No'}</>;
    case 'select':
      return cell ? <OptionDot option={entry.value!} /> : <OptionChip option={entry.value!} />;
    case 'multi_select':
      return cell ? (
        <span className="min-w-0 truncate">{entry.value.map(o => o.name).join(', ')}</span>
      ) : (
        <span className="flex flex-wrap gap-1">
          {entry.value.map(o => (
            <OptionChip key={o.name} option={o} />
          ))}
        </span>
      );
    case 'user':
      return cell ? <AssigneeStack assignees={[entry.value!]} /> : <Person person={entry.value!} />;
    case 'multi_user':
      return cell ? (
        <AssigneeStack assignees={entry.value} />
      ) : (
        <span className="flex flex-col gap-1">
          {entry.value.map(p => (
            <Person key={p.username} person={p} />
          ))}
        </span>
      );
  }
}

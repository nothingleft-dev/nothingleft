'use client';

import { useId, type ReactNode } from 'react';
import Link from 'next/link';
import { formatDuration, type WorkCalendar } from '@nothingleft/format';
import type { ReportScope } from '@nothingleft/types';
import { Switch } from '@components/ui/switch';
import { MemberAvatar } from '@components/issues/member-avatar';
import { listHref } from '@lib/issue-list/links';
import { cn } from '@lib/utils';
import { formatCount, plural } from '@lib/numbers';

/**
 * `in Product Platform, Mobile App · view Blocking bugs` — what the figures cover. With no projects
 * picked, the API lists every project the viewer can open, so the sentence says so rather than reading
 * as a filter the picker does not show.
 */
export function scopeText(scope: ReportScope, picked: boolean) {
  const names = scope.projects.map(p => p.name);
  const listed = names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
  const where =
    names.length === 0
      ? 'in every project you can open'
      : picked
        ? `in ${names.length <= 3 ? listed : `${listed} projects`}`
        : names.length === 1
          ? `in ${listed}, the one project you can open`
          : `in all ${formatCount(names.length)} projects you can open (${listed})`;
  return scope.view ? `${where} · saved view ${scope.view}` : where;
}

export { formatCount, plural };

const round1 = (n: number) => Math.round(n * 10) / 10;

export type DurationUnit = 'duration' | 'days' | 'hours';

export const DURATION_UNITS = [
  { value: 'duration', label: '1w 1d' },
  { value: 'days', label: 'Days' },
  { value: 'hours', label: 'Hours' },
] as const satisfies readonly { value: DurationUnit; label: string }[];

/** The `unit` parameter: absent is the product's own `1w 1d 1h` format. */
export const durationUnitOf = (value: string | null): DurationUnit =>
  value === 'days' || value === 'hours' ? value : 'duration';

/** `1,036.5`: one decimal, thousands grouped. */
export const oneDecimal = (n: number) => {
  const [whole, fraction] = round1(n).toFixed(1).split('.');
  return `${formatCount(Number(whole))}.${fraction}`;
};

/**
 * Minutes in the unit the viewer picked: `1w 2d 3h`, `7.4d` or `59h`. Days and weeks are working ones.
 * `column` keeps one decimal on every day or hour figure, so a column of them lines up.
 */
export function formatMinutes(
  minutes: number,
  unit: DurationUnit,
  calendar: WorkCalendar,
  { column = false }: { column?: boolean } = {},
): string {
  if (minutes < 0) return `−${formatMinutes(-minutes, unit, calendar, { column })}`;
  const decimal = (n: number) => (column ? oneDecimal(n) : formatCount(round1(n)));
  if (unit === 'hours') return `${decimal(minutes / 60)}h`;
  if (unit === 'days') return `${decimal(minutes / calendar.workdayMinutes)}d`;
  return minutes === 0 ? '0m' : formatDuration(Math.round(minutes), calendar);
}

/** A duration in the mono face, as everywhere else in the app. */
export function Minutes({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono text-xs tabular', className)}>{children}</span>;
}

/** `12.0%`, and `<0.1%` for a share too small to round to one: a column of shares lines up on its point. */
export const formatShare = (share: number, amount = 1) =>
  share === 0 && amount > 0 ? '<0.1%' : share === 100 ? '100%' : `${share.toFixed(1)}%`;

/** The working-time convention behind `d` and `w`, which differs per organisation. */
export const calendarNote = (calendar: WorkCalendar) =>
  `A day is ${formatCount(round1(calendar.workdayMinutes / 60))}h and a week ${calendar.workweekDays} days, from the organisation’s working calendar.`;

export function UnitToggle({ value, onChange }: { value: DurationUnit; onChange: (unit: DurationUnit) => void }) {
  return <ToggleGroup label="Units" value={value} options={DURATION_UNITS} onChange={onChange} />;
}

/** Says which projects a chart draws in another colour than their own, since a colour alone must never mislead. */
export function HueNote({
  groups,
}: {
  groups: readonly { label: string; hue_adjusted: boolean; hue_striped: boolean }[];
}) {
  const moved = groups.filter(g => g.hue_adjusted);
  if (moved.length === 0) return null;
  const striped = moved.some(g => g.hue_striped);
  const names = moved.map(g => g.label);
  const listed =
    names.length <= 3
      ? names.length === 1
        ? names[0]
        : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
      : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more projects`;
  const one = moved.length === 1;
  return (
    <p className="text-xs text-text-secondary">
      {listed} {one ? 'is' : 'are'} drawn in another colour here, because an earlier project in this chart has the same
      colour
      {striped ? '; once every colour is taken, the next is striped' : ''}. {one ? 'Its' : 'Their'} project colour is
      unchanged.
    </p>
  );
}

export interface PersonRef {
  avatarUrl: string | null;
  /** The empty group of a person field: Unassigned. */
  nobody: boolean;
}

/** Groups that are people: the assignee field, or any whose groups carry a picture (a person field). */
export const isPeopleField = (field: string | null, groups: readonly { avatar_url: string | null }[]) =>
  field === 'assignee' || groups.some(g => g.avatar_url !== null);

export const personOf = (
  group: { value: string | null; avatar_url: string | null; other?: boolean },
  people: boolean,
): PersonRef | undefined =>
  people && !group.other ? { avatarUrl: group.avatar_url, nobody: group.value === null } : undefined;

/** A person beside their name: their picture, or the dashed ring the app uses for nobody. */
export function PersonMark({ name, avatarUrl, nobody, small = false }: PersonRef & { name: string; small?: boolean }) {
  const size = small ? 'size-4' : 'size-6';
  if (nobody) {
    return (
      <span
        aria-hidden
        className={cn('inline-block flex-none rounded-full border border-dashed border-border-strong', size)}
      />
    );
  }
  return (
    <MemberAvatar
      member={{ name, avatar_url: avatarUrl }}
      className={cn(size, 'flex-none')}
      initialsClassName={small ? 'text-[7px]' : undefined}
    />
  );
}

export function ToggleGroup<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5 rounded-sm border p-0.5">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          data-state={o.value === value ? 'on' : 'off'}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-6 rounded-xs px-2 text-xs font-medium text-text-secondary hover:bg-hover hover:text-text',
            o.value === value && 'bg-active text-text hover:bg-active',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SwitchParam({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex h-7 cursor-pointer items-center gap-2 px-1 text-xs text-text-secondary">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

/** A label that opens the issue list for exactly the issues it counts; Other has no query. */
export function DrillLink({
  query,
  children,
  className,
}: {
  query: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  if (!query) return <span className={className}>{children}</span>;
  return (
    <Link href={listHref(query)} className={cn('text-link', className)}>
      {children}
    </Link>
  );
}

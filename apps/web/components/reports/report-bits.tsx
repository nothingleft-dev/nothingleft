'use client';

import { useId } from 'react';
import Link from 'next/link';
import { formatDuration, type WorkCalendar } from '@nothingleft/format';
import type { ReportScope } from '@nothingleft/types';
import { Switch } from '@components/ui/switch';
import { MemberAvatar } from '@components/issues/member-avatar';
import { listHref } from '@lib/issue-list/links';
import { cn } from '@lib/utils';

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

/** `1,284`: thousands separated, as every figure in a report reads. */
export const formatCount = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

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

/** Minutes in the unit the viewer picked: `1w 2d 3h`, `7.4d` or `59h`. Days and weeks are working ones. */
export function formatMinutes(minutes: number, unit: DurationUnit, calendar: WorkCalendar): string {
  if (minutes < 0) return `−${formatMinutes(-minutes, unit, calendar)}`;
  if (unit === 'hours') return `${formatCount(round1(minutes / 60))}h`;
  if (unit === 'days') return `${formatCount(round1(minutes / calendar.workdayMinutes))}d`;
  return minutes === 0 ? '0m' : formatDuration(Math.round(minutes), calendar);
}

/** The working-time convention behind `d` and `w`, which differs per organisation. */
export const calendarNote = (calendar: WorkCalendar) =>
  `A day is ${formatCount(round1(calendar.workdayMinutes / 60))}h and a week ${calendar.workweekDays} days, from the organisation's working calendar.`;

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
  return (
    <p className="text-xs text-text-secondary">
      {moved.map(g => g.label).join(', ')} {moved.length === 1 ? 'shares its' : 'share their'} colour with an earlier
      project here, so the chart draws {moved.length === 1 ? 'it' : 'them'} in another
      {striped ? ', striped once every colour is taken' : ''}. Project settings are unchanged.
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
    <div role="radiogroup" aria-label={label} className="flex items-center rounded-sm border bg-inset p-0.5">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-6 rounded-xs px-2 text-xs font-medium text-text-secondary hover:text-text',
            o.value === value && 'bg-surface text-text shadow-[0_0_0_1px_var(--border-strong)]',
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

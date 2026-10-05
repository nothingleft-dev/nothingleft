'use client';

import { useId } from 'react';
import Link from 'next/link';
import type { ReportScope } from '@nothingleft/types';
import { Switch } from '@components/ui/switch';
import { listHref } from '@lib/issue-list/links';
import { cn } from '@lib/utils';

/** `in Product Platform, Mobile App · view Blocking bugs` — what the figures cover. */
export function scopeText(scope: ReportScope) {
  const names = scope.projects.map(p => p.name);
  const where =
    names.length === 0
      ? 'in every project you can open'
      : names.length <= 3
        ? `in ${names.join(', ')}`
        : `in ${names.slice(0, 2).join(', ')} and ${names.length - 2} more projects`;
  return scope.view ? `${where} · view ${scope.view}` : where;
}

/** `1,284`: thousands separated, as every figure in a report reads. */
export const formatCount = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

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
    <div role="radiogroup" aria-label={label} className="flex items-center rounded-sm border p-0.5">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-6 rounded-xs px-2 text-xs font-medium text-text-secondary hover:bg-hover hover:text-text',
            o.value === value && 'bg-active text-text',
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
    <Link href={listHref(query)} className={cn('hover:underline hover:underline-offset-4', className)}>
      {children}
    </Link>
  );
}

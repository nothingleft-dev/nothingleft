'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  RESOLVED_STATUS_CATEGORIES,
  type IssueGroup,
  type IssueGroupBy,
  type IssueListItem,
  type StatusCategory,
} from '@nothingleft/types';
import { Checkbox } from '@components/ui/checkbox';
import { Skeleton } from '@components/ui/skeleton';
import { LoadMore } from '@components/text-button';
import { GROUP_GAP, GROUP_HEIGHT, GroupHeader } from '@components/issues/list/group-header';
import { IssueRow, ROW_HEIGHT, type RowUpdate } from '@components/issues/list/issue-row';
import { usePhone } from '@hooks/use-media-query';
import { gridTemplate, tableMinWidth, type ColumnDef } from '@lib/issue-list/columns';
import { cn } from '@lib/utils';

type Item =
  | { kind: 'group'; group: IssueGroup; rows: IssueListItem[]; collapsed: boolean; category: StatusCategory | null }
  | { kind: 'row'; issue: IssueListItem };

interface IssueTableProps {
  rows: readonly IssueListItem[];
  groups: readonly IssueGroup[] | undefined;
  groupBy: IssueGroupBy | null;
  /** The optional columns to draw, in order. */
  columns: readonly ColumnDef[];
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  /** Data is being replaced under the table: keep the rows, dim them. */
  stale: boolean;
  selection: ReadonlySet<string>;
  onSelectionChange: (next: Set<string>) => void;
  canEdit: (projectKey: string) => boolean;
  onUpdate: RowUpdate;
  sort: string;
  onSort: (sort: string) => void;
  today: string;
  timeZone?: string;
}

const groupKey = (value: string | null) => value ?? '\u0000';

export function IssueTable({
  rows,
  groups,
  groupBy,
  columns,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
  stale,
  selection,
  onSelectionChange,
  canEdit,
  onUpdate,
  sort,
  onSort,
  today,
  timeZone,
}: IssueTableProps) {
  const phone = usePhone();
  const template = gridTemplate(columns);
  const minWidth = tableMinWidth(columns);
  // Only a table wider than the page scrolls sideways; its header then stops sticking, which is the price.
  const outerRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => setWide(el.clientWidth < minWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [minWidth]);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const lastPicked = useRef<string | null>(null);

  const items = useMemo<Item[]>(() => {
    if (!groupBy || !groups) return rows.map(issue => ({ kind: 'row', issue }));
    const byGroup = new Map<string, IssueListItem[]>();
    for (const row of rows) {
      const key = groupKey(row.group ?? null);
      byGroup.set(key, [...(byGroup.get(key) ?? []), row]);
    }
    const out: Item[] = [];
    for (const group of groups) {
      const groupRows = byGroup.get(groupKey(group.value)) ?? [];
      const category = group.category ?? null;
      // Resolved statuses start collapsed: they are the part of the list nobody is working on.
      const collapsed =
        toggled[groupKey(group.value)] ?? (category !== null && RESOLVED_STATUS_CATEGORIES.includes(category));
      out.push({ kind: 'group', group, rows: groupRows, collapsed, category });
      if (!collapsed) for (const issue of groupRows) out.push({ kind: 'row', issue });
    }
    return out;
  }, [rows, groups, groupBy, toggled]);

  const visibleKeys = useMemo(
    () => items.filter((i): i is Extract<Item, { kind: 'row' }> => i.kind === 'row').map(i => i.issue.key),
    [items],
  );

  // The shell's <main> scrolls, not the window: the virtualiser measures against it.
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useEffect(() => {
    const root = listRef.current?.closest<HTMLElement>('[data-scroll-root]') ?? null;
    setScrollRoot(root);
    const measure = () => {
      if (!root || !listRef.current) return;
      setScrollMargin(listRef.current.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (root) observer.observe(root);
    return () => observer.disconnect();
  }, [items.length]);

  // The virtualiser hands back functions the React Compiler cannot memoise; the component is left uncompiled.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRoot,
    estimateSize: index => (items[index]?.kind === 'group' ? GROUP_HEIGHT + GROUP_GAP : ROW_HEIGHT),
    overscan: 16,
    scrollMargin,
    getItemKey: index => {
      const item = items[index]!;
      return item.kind === 'group'
        ? `g:${groupKey(item.group.value)}`
        : `r:${item.issue.key}:${item.issue.group ?? ''}`;
    },
  });

  const select = (key: string, checked: boolean, shift: boolean) => {
    const next = new Set(selection);
    // Shift extends from the last pick across every visible row in between.
    const anchor = lastPicked.current;
    if (shift && anchor && visibleKeys.includes(anchor)) {
      const [a, b] = [visibleKeys.indexOf(anchor), visibleKeys.indexOf(key)].sort((x, y) => x - y) as [number, number];
      for (const k of visibleKeys.slice(a, b + 1))
        if (checked) next.add(k);
        else next.delete(k);
    } else if (checked) next.add(key);
    else next.delete(key);
    lastPicked.current = key;
    onSelectionChange(next);
  };

  const allSelected = visibleKeys.length > 0 && visibleKeys.every(k => selection.has(k));
  const someSelected = visibleKeys.some(k => selection.has(k));

  const headerCell = (def: ColumnDef) => {
    const { id } = def;
    const key = def.sort;
    const active = key ? sort.startsWith(key) : false;
    const direction = active && sort.endsWith(' desc') ? 'desc' : 'asc';
    if (!key)
      return (
        <span
          key={id}
          role="columnheader"
          className={cn(
            'truncate',
            def.align === 'right' && 'text-right',
            def.align === 'right' && def.fieldType && 'pr-3',
          )}
        >
          {def.label}
        </span>
      );
    return (
      <span
        key={id}
        role="columnheader"
        aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={cn('flex', def.align === 'right' && 'justify-end', def.align === 'right' && def.fieldType && 'pr-3')}
      >
        <button
          type="button"
          onClick={() => onSort(active && direction === 'asc' ? `${key} desc` : active ? '' : `${key} asc`)}
          className={cn('flex min-w-0 items-center gap-1 rounded-xs hover:text-text', active && 'text-text')}
        >
          <span className="truncate">{def.label}</span>
          {active ? direction === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
        </button>
      </span>
    );
  };

  return (
    <div
      ref={outerRef}
      role="grid"
      aria-rowcount={total}
      className={cn('relative', wide && !phone && 'scroll-fade-x overflow-x-auto', stale && 'is-stale')}
    >
      <div style={wide && !phone ? { minWidth } : undefined}>
        {phone ? null : (
          <div
            role="row"
            style={{ gridTemplateColumns: template }}
            className="sticky top-0 z-10 grid h-row-dense items-center gap-2 border-b bg-surface px-2 text-2xs font-medium text-text-muted"
          >
            <span className="flex items-center">
              <Checkbox
                aria-label={allSelected ? 'Clear selection' : 'Select all loaded issues'}
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={checked => {
                  const next = new Set(selection);
                  for (const k of visibleKeys)
                    if (checked === true) next.add(k);
                    else next.delete(k);
                  onSelectionChange(next);
                }}
                className={cn(
                  'bg-surface',
                  !someSelected && 'reveal hover:opacity-100 [[role=grid]:hover_&]:opacity-100',
                )}
              />
            </span>
            <button
              type="button"
              title="Priority"
              onClick={() =>
                onSort(
                  sort.startsWith('priority') && !sort.endsWith(' desc')
                    ? 'priority desc'
                    : sort.startsWith('priority')
                      ? ''
                      : 'priority asc',
                )
              }
              className={cn('rounded-xs hover:text-text', sort.startsWith('priority') && 'text-text')}
            >
              P
            </button>
            <button
              type="button"
              title="Type"
              onClick={() =>
                onSort(
                  sort.startsWith('type') && !sort.endsWith(' desc')
                    ? 'type desc'
                    : sort.startsWith('type')
                      ? ''
                      : 'type asc',
                )
              }
              className={cn('rounded-xs hover:text-text', sort.startsWith('type') && 'text-text')}
            >
              T
            </button>
            <button
              type="button"
              onClick={() =>
                onSort(
                  sort.startsWith('key') && !sort.endsWith(' desc')
                    ? 'key desc'
                    : sort.startsWith('key')
                      ? ''
                      : 'key asc',
                )
              }
              className={cn(
                'flex items-center gap-1 rounded-xs text-left hover:text-text',
                sort.startsWith('key') && 'text-text',
              )}
            >
              Key
              {sort.startsWith('key') ? (
                sort.endsWith(' desc') ? (
                  <ArrowDown className="size-3" />
                ) : (
                  <ArrowUp className="size-3" />
                )
              ) : null}
            </button>
            <span>Title</span>
            {columns.map(headerCell)}
          </div>
        )}

        <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(virtualRow => {
            const item = items[virtualRow.index]!;
            const style = {
              position: 'absolute' as const,
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            };
            if (item.kind === 'group') {
              return (
                <GroupHeader
                  key={virtualRow.key}
                  style={style}
                  group={item.group}
                  groupBy={groupBy!}
                  category={item.category}
                  loaded={item.rows.length}
                  collapsed={item.collapsed}
                  onToggle={() => setToggled(t => ({ ...t, [groupKey(item.group.value)]: !item.collapsed }))}
                />
              );
            }
            return (
              <IssueRow
                key={virtualRow.key}
                style={style}
                issue={item.issue}
                columns={columns}
                template={template}
                selected={selection.has(item.issue.key)}
                selecting={selection.size > 0}
                onSelect={select}
                canEdit={canEdit(item.issue.project.key)}
                onUpdate={onUpdate}
                today={today}
                timeZone={timeZone}
                phone={phone}
              />
            );
          })}
        </div>
      </div>

      {hasMore ? (
        <LoadMore
          className="justify-center py-4"
          pending={loadingMore}
          onClick={onLoadMore}
          progress={`Showing ${rows.length} of ${total}`}
        />
      ) : null}
    </div>
  );
}

const PHONE_TEMPLATE = 'minmax(64px,auto) minmax(0,1fr) 7rem';

/** Shaped like the table it stands in for: header, a group band per run of rows, cells aligned as the real ones. */
export function IssueTableSkeleton({ columns, grouped }: { columns: readonly ColumnDef[]; grouped: boolean }) {
  const phone = usePhone();
  const template = phone ? PHONE_TEMPLATE : gridTemplate(columns);
  const runs = grouped ? [5, 7] : [12];
  return (
    <div aria-hidden className="flex flex-col">
      {phone ? null : (
        <div style={{ gridTemplateColumns: template }} className="grid h-row-dense items-center gap-2 border-b px-2">
          <span />
          <Skeleton className="h-2.5 w-2" />
          <Skeleton className="h-2.5 w-2" />
          <Skeleton className="h-2.5 w-6" />
          <Skeleton className="h-2.5 w-8" />
          {columns.map(c => (
            <span key={c.id} className={cn('flex', c.align === 'right' && 'justify-end')}>
              <Skeleton className="h-2.5 w-10" />
            </span>
          ))}
        </div>
      )}
      {runs.map((count, run) => (
        <div key={run}>
          {grouped ? (
            <div className="pt-3">
              <div className="flex h-8 items-center gap-2 rounded-sm bg-app px-2">
                <Skeleton className="size-3 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ) : null}
          {Array.from({ length: count }, (_, row) => {
            const i = run * 5 + row;
            return (
              <div
                key={i}
                style={{ gridTemplateColumns: template }}
                className="grid h-row items-center gap-2 border-b border-border-subtle px-2 max-md:px-1"
              >
                {phone ? null : (
                  <>
                    <span />
                    <Skeleton className="size-badge-letter rounded-xs" />
                    <Skeleton className="size-badge-letter rounded-xs" />
                  </>
                )}
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-3" style={{ width: `${40 + ((i * 23) % 50)}%` }} />
                {phone ? (
                  <StatusSkeleton />
                ) : (
                  columns.map(c => (
                    <span key={c.id} className={cn('flex min-w-0', c.align === 'right' && 'justify-end')}>
                      {c.id === 'status' ? <StatusSkeleton /> : <Skeleton className="h-3 w-16" />}
                    </span>
                  ))
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function StatusSkeleton() {
  return (
    <span className="flex items-center gap-2">
      <Skeleton className="size-2 rounded-full" />
      <Skeleton className="h-3 w-16" />
    </span>
  );
}

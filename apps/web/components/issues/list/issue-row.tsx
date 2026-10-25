'use client';

import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { formatDuration } from '@nothingleft/format';
import { RESOLVED_STATUS_CATEGORIES, type Issue, type IssueListItem, type UpdateIssue } from '@nothingleft/types';
import { Checkbox } from '@components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { IssueKey } from '@components/issue-key';
import { RelativeTime } from '@components/relative-time';
import { AssigneeStack } from '@components/issues/assignee-stack';
import { DueDate } from '@components/issues/due-date';
import { AssigneeCommand, ValueCommand } from '@components/issues/pickers';
import { StatusPill } from '@components/issues/status-pill';
import { PriorityBadge, StatusDot, TypeBadge } from '@components/issues/value-marks';
import { useProjectAssignees } from '@hooks/use-projects';
import { useSchemaValues } from '@hooks/use-project-schema';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import type { ColumnDef } from '@lib/issue-list/columns';
import { DevelopmentBadge, summaryCounts } from '@components/git/git-marks';
import { FieldValue } from '@components/custom-fields/field-value';
import { formatCalendarDateShort } from '@lib/datetime';
import { issuePath } from '@lib/issue-path';
import { cn } from '@lib/utils';

export type RowUpdate = (key: string, body: UpdateIssue, optimistic: (issue: IssueListItem) => Issue) => void;

interface IssueRowProps {
  issue: IssueListItem;
  columns: readonly ColumnDef[];
  template: string;
  selected: boolean;
  /** Any row is selected, so every checkbox shows. */
  selecting: boolean;
  onSelect: (key: string, checked: boolean, shift: boolean) => void;
  canEdit: boolean;
  onUpdate: RowUpdate;
  today: string;
  timeZone?: string;
  phone: boolean;
  style?: CSSProperties;
}

export const ROW_HEIGHT = 36;

export function IssueRow({
  issue,
  columns,
  template,
  selected,
  selecting,
  onSelect,
  canEdit,
  onUpdate,
  today,
  timeZone,
  phone,
  style,
}: IssueRowProps) {
  const router = useRouter();
  const calendar = useWorkCalendar();
  const resolved = RESOLVED_STATUS_CATEGORIES.includes(issue.status.category);
  const href = issuePath(issue);

  const open = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, [role="checkbox"], [data-inline]')) return;
    if (event.metaKey || event.ctrlKey) window.open(href, '_blank');
    else router.push(href);
  };

  const cell = ({ id, decimals }: ColumnDef): ReactNode => {
    switch (id) {
      case 'project':
        return (
          <span className="grid size-avatar-sm place-items-center rounded-sm bg-inset text-[10px] font-semibold text-text-secondary">
            {issue.project.key}
          </span>
        );
      case 'status':
        return <StatusCell issue={issue} canEdit={canEdit} onUpdate={onUpdate} />;
      case 'assignee':
        return <AssigneeCell issue={issue} canEdit={canEdit} onUpdate={onUpdate} />;
      case 'due':
        return <DueDate value={issue.due_date} today={today} resolved={resolved} />;
      case 'start':
        return (
          <span className="text-xs tabular text-text-muted">
            {issue.start_date ? formatCalendarDateShort(issue.start_date) : '--'}
          </span>
        );
      case 'updated':
        return <RelativeTime value={issue.updated_at} timeZone={timeZone} className="text-xs whitespace-nowrap" />;
      case 'created':
        return <RelativeTime value={issue.created_at} timeZone={timeZone} className="text-xs whitespace-nowrap" />;
      case 'estimate':
        return (
          <span
            className={cn(
              'font-mono text-2xs tabular',
              issue.estimate_minutes === null ? 'text-text-muted' : 'text-text-secondary',
            )}
          >
            {issue.estimate_minutes === null ? '--' : formatDuration(issue.estimate_minutes, calendar)}
          </span>
        );
      case 'sprint':
        return (
          <span className={cn('truncate text-xs', issue.sprint ? 'text-text-secondary' : 'text-text-muted')}>
            {issue.sprint?.name ?? '--'}
          </span>
        );
      case 'points':
        return (
          <span
            className={cn(
              'font-mono text-2xs tabular',
              issue.story_points === null ? 'text-text-muted' : 'text-text-secondary',
            )}
          >
            {issue.story_points ?? '--'}
          </span>
        );
      case 'development':
        return issue.development && issue.development.rollup !== 'none' ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <DevelopmentBadge rollup={issue.development.rollup} />
            <span className="truncate text-2xs text-text-muted tabular">{summaryCounts(issue.development, true)}</span>
          </span>
        ) : (
          <span className="text-xs text-text-muted">--</span>
        );
      case 'votes':
        return (
          <span className={cn('text-xs tabular', issue.vote_count === 0 ? 'text-text-muted' : 'text-text-secondary')}>
            {issue.vote_count === 0 ? '--' : issue.vote_count}
          </span>
        );
      default: {
        // A field that does not apply to this issue's type is as empty as one never filled in.
        const entry = issue.custom_fields.find(e => `custom:${e.slug}` === id);
        const empty = !entry || (Array.isArray(entry.value) ? entry.value.length === 0 : entry.value === null);
        return (
          <span
            className={cn(
              'flex min-w-0 items-center text-xs',
              empty ? 'text-text-muted' : 'text-text-secondary',
              (entry?.type === 'number' || entry?.type === 'integer' || entry?.type === 'duration') &&
                'font-mono text-2xs tabular',
            )}
          >
            {entry ? (
              <FieldValue entry={entry} calendar={calendar} variant="cell" timeZone={timeZone} decimals={decimals} />
            ) : (
              '--'
            )}
          </span>
        );
      }
    }
  };

  const meta =
    issue.comment_count > 0 ? (
      <span
        className="ml-2 inline-flex items-center gap-0.5 align-middle text-2xs tabular text-text-muted"
        title={`${issue.comment_count} comments`}
      >
        <MessageSquare className="size-[11px]" />
        {issue.comment_count}
      </span>
    ) : null;

  if (phone) {
    return (
      <div
        role="row"
        aria-selected={selected || undefined}
        onClick={open}
        style={style}
        className={cn(
          'group grid h-row cursor-pointer grid-cols-[minmax(64px,auto)_minmax(0,1fr)_auto] items-center gap-2 border-b border-border-subtle px-1 hover:bg-hover',
          selected && 'bg-selected',
        )}
      >
        <IssueKey issueKey={issue.key} resolved={resolved} />
        <Link
          href={href}
          className={cn('truncate', resolved && 'text-text-muted line-through decoration-border-strong')}
        >
          {issue.title}
        </Link>
        <StatusPill status={issue.status} className="min-w-0 px-1" />
      </div>
    );
  }

  return (
    <div
      role="row"
      aria-selected={selected || undefined}
      onClick={open}
      style={{ ...style, gridTemplateColumns: template }}
      className={cn(
        'group grid h-row cursor-pointer items-center gap-2 border-b border-border-subtle px-2 hover:bg-hover',
        selected && 'bg-selected hover:bg-selected',
      )}
    >
      <span className="flex items-center" data-inline>
        <Checkbox
          checked={selected}
          aria-label={`Select ${issue.key}`}
          onClick={event => onSelect(issue.key, !selected, event.shiftKey)}
          className={cn(
            'bg-surface transition-opacity duration-(--dur-fast)',
            !selected && !selecting && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          )}
        />
      </span>
      <PriorityCell issue={issue} canEdit={canEdit} onUpdate={onUpdate} dim={resolved} />
      <TypeBadge type={issue.type} className={cn(resolved && 'opacity-55')} />
      <Link href={href} className="min-w-0">
        <IssueKey issueKey={issue.key} resolved={resolved} />
      </Link>
      <span className="min-w-0 truncate">
        <Link
          href={href}
          className={cn('text-text', resolved && 'text-text-muted line-through decoration-border-strong')}
        >
          {issue.title}
        </Link>
        {meta}
      </span>
      {columns.map(column => (
        <span
          key={column.id}
          className={cn(
            'flex min-w-0 items-center',
            column.align === 'right' && 'justify-end',
            column.align === 'right' && column.fieldType && 'pr-3',
          )}
        >
          {cell(column)}
        </span>
      ))}
    </div>
  );
}

interface CellProps {
  issue: IssueListItem;
  canEdit: boolean;
  onUpdate: RowUpdate;
}

function StatusCell({ issue, canEdit, onUpdate }: CellProps) {
  const [open, setOpen] = useState(false);
  if (!canEdit) return <StatusPill status={issue.status} />;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-inline
          className="group/pill -ml-2 max-w-full text-left"
          aria-label={`Status: ${issue.status.name}. Change`}
        >
          <StatusPill status={issue.status} editable />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-0" data-inline>
        {open ? (
          <StatusEditor
            issue={issue}
            onPick={(name, patch) => {
              setOpen(false);
              if (name !== issue.status.name) onUpdate(issue.key, { status: name }, patch);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function StatusEditor({
  issue,
  onPick,
}: {
  issue: IssueListItem;
  onPick: (name: string, patch: (i: IssueListItem) => Issue) => void;
}) {
  const statuses = useSchemaValues(issue.project.key, 'statuses');
  return (
    <ValueCommand
      placeholder="Change status"
      loading={statuses.isPending}
      selected={issue.status.name}
      options={(statuses.data ?? [])
        .filter(s => !s.is_archived || s.name === issue.status.name)
        .map(s => ({ name: s.name, mark: <StatusDot category={s.category} color={s.color} /> }))}
      onSelect={name => {
        const next = statuses.data?.find(s => s.name === name);
        onPick(name, i => (next ? { ...i, status: next } : i));
      }}
    />
  );
}

function PriorityCell({ issue, canEdit, onUpdate, dim }: CellProps & { dim: boolean }) {
  const [open, setOpen] = useState(false);
  const badge = <PriorityBadge priority={issue.priority} className={cn(dim && 'opacity-55')} />;
  if (!canEdit) return badge;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-inline
          className="grid place-items-center rounded-xs hover:shadow-(--focus-ring)"
          aria-label={`Priority: ${issue.priority.name}. Change`}
        >
          {badge}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[240px] p-0" data-inline>
        {open ? (
          <PriorityEditor
            issue={issue}
            onPick={(name, patch) => {
              setOpen(false);
              if (name !== issue.priority.name) onUpdate(issue.key, { priority: name }, patch);
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function PriorityEditor({
  issue,
  onPick,
}: {
  issue: IssueListItem;
  onPick: (name: string, patch: (i: IssueListItem) => Issue) => void;
}) {
  const priorities = useSchemaValues(issue.project.key, 'priorities');
  return (
    <ValueCommand
      placeholder="Change priority"
      loading={priorities.isPending}
      selected={issue.priority.name}
      options={(priorities.data ?? []).map(p => ({ name: p.name, mark: <PriorityBadge priority={p} /> }))}
      onSelect={name => {
        const next = priorities.data?.find(p => p.name === name);
        onPick(name, i => (next ? { ...i, priority: next } : i));
      }}
    />
  );
}

function AssigneeCell({ issue, canEdit, onUpdate }: CellProps) {
  const [open, setOpen] = useState(false);
  if (!canEdit) return <AssigneeStack assignees={issue.assignees} className="max-w-full" />;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-inline
          aria-label="Change assignees"
          className="-ml-1.5 flex h-[26px] max-w-full items-center rounded-sm border border-transparent px-1.5 text-left hover:border-border-strong"
        >
          <AssigneeStack assignees={issue.assignees} className="max-w-full" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0" data-inline>
        {open ? <AssigneeEditor issue={issue} onClose={() => setOpen(false)} onUpdate={onUpdate} /> : null}
      </PopoverContent>
    </Popover>
  );
}

/** Saves once, when the popover closes, so toggling three people is one PATCH. */
function AssigneeEditor({
  issue,
  onClose,
  onUpdate,
}: {
  issue: IssueListItem;
  onClose: () => void;
  onUpdate: RowUpdate;
}) {
  const people = useProjectAssignees(issue.project.key);
  const [draft, setDraft] = useState(() => issue.assignees.map(a => a.username));

  const commit = () => {
    const before = issue.assignees.map(a => a.username).sort();
    const after = [...draft].sort();
    onClose();
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const list = people.data ?? [];
    onUpdate(issue.key, { assignees: after }, i => ({
      ...i,
      assignees: after.map(u => list.find(p => p.username === u) ?? i.assignees.find(a => a.username === u)!),
    }));
  };

  return (
    <div
      onKeyDown={event => {
        if (event.key === 'Escape') commit();
      }}
    >
      <AssigneeCommand
        people={people.data ?? []}
        loading={people.isPending}
        selected={draft}
        onToggle={username => setDraft(d => (d.includes(username) ? d.filter(u => u !== username) : [...d, username]))}
      />
      <div className="flex items-center justify-between border-t px-3 py-2 text-2xs text-text-muted">
        <span>{draft.length === 0 ? 'Unassigned' : `${draft.length} assigned`}</span>
        <button type="button" onClick={commit} className="font-medium text-text-secondary hover:text-text">
          Done
        </button>
      </div>
    </div>
  );
}

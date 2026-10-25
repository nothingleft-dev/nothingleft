'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { formatDuration, type WorkCalendar } from '@nothingleft/format';
import { RESOLVED_STATUS_CATEGORIES, type Issue, type UpdateIssue } from '@nothingleft/types';
import { Plus } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { Meter } from '@components/dashboard/meter';
import { Duration } from '@components/duration';
import { MemberAvatar } from '@components/issues/member-avatar';
import { PriorityBadge, StatusDot, TypeBadge } from '@components/issues/value-marks';
import { AssigneeCommand, DateEditor, EstimateEditor, ValueCommand } from '@components/issues/pickers';
import { SidebarField } from '@components/issues/sidebar-field';
import { DevelopmentField } from '@components/git/development-field';
import { NOT_ESTIMATED, SprintCommand, StoryPointsEditor, UNSCHEDULED } from '@components/agile/sprint-field';
import type { TimeTracking } from '@components/issues/issue-activity';
import { SidebarCustomFields, timeRoleField } from '@components/custom-fields/sidebar-fields';
import { useCustomFields } from '@hooks/use-custom-fields';
import { PersonName } from '@components/former-member-chip';
import { useIssueWatchers, useUpdateIssue, type IssueUpdate } from '@hooks/use-issues';
import { useProjectAssignees } from '@hooks/use-projects';
import { useSchemaValues } from '@hooks/use-project-schema';
import { useSprints } from '@hooks/use-sprints';
import { useShortcut } from '@hooks/use-shortcut';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import { isApiError } from '@lib/api/errors';
import { formatCalendarDate, todayCalendarDate } from '@lib/datetime';
import { cn } from '@lib/utils';

type Editor =
  | 'priority'
  | 'type'
  | 'status'
  | 'assignees'
  | 'start_date'
  | 'due_date'
  | 'sprint'
  | 'story_points'
  | 'estimate'
  | null;

interface IssueSidebarProps {
  issue: Issue;
  canEdit: boolean;
  time: TimeTracking;
  timeZone?: string;
  onOpenDevelopment?: () => void;
  onLinkPullRequest?: () => void;
}

export function IssueSidebar({
  issue,
  canEdit,
  time,
  timeZone,
  onOpenDevelopment,
  onLinkPullRequest,
}: IssueSidebarProps) {
  const [editing, setEditing] = useState<Editor>(null);
  const [draftAssignees, setDraftAssignees] = useState<string[]>([]);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [pointsError, setPointsError] = useState<string | null>(null);
  const projectKey = issue.project.key;
  const statuses = useSchemaValues(canEdit ? projectKey : null, 'statuses');
  const priorities = useSchemaValues(canEdit ? projectKey : null, 'priorities');
  const types = useSchemaValues(canEdit ? projectKey : null, 'types');
  const assignees = useProjectAssignees(canEdit ? projectKey : null);
  const sprints = useSprints(canEdit ? projectKey : null);
  const calendar = useWorkCalendar();
  const update = useUpdateIssue(issue.key);
  const customFields = useCustomFields(projectKey);
  const estimationLabel = timeRoleField(customFields.data, 'estimation')?.name ?? 'Estimation';
  const spentLabel = timeRoleField(customFields.data, 'spent_time')?.name ?? 'Spent time';

  const save = (input: IssueUpdate, onError?: (message: string) => void) => {
    update.mutate(input, {
      onError: error => {
        const message = error.message;
        if (onError) onError(message);
        else toast.error(message);
      },
    });
  };

  const openProps = (editor: Exclude<Editor, null>) => ({
    open: editing === editor,
    onOpenChange: (open: boolean) => setEditing(open ? editor : null),
  });

  const pick = (field: 'status' | 'priority' | 'type', name: string, patch: (i: Issue) => Issue) => {
    setEditing(null);
    const current = field === 'status' ? issue.status : field === 'priority' ? issue.priority : issue.type;
    if (current.name === name) return;
    save({ body: { [field]: name } as UpdateIssue, optimistic: patch });
  };

  const assigneesOpen = editing === 'assignees';
  const closeAssignees = () => {
    setEditing(null);
    const before = issue.assignees.map(a => a.username).sort();
    const after = [...draftAssignees].sort();
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const people = assignees.data ?? [];
    save({
      body: { assignees: after },
      optimistic: i => ({
        ...i,
        assignees: after.map(u => people.find(p => p.username === u) ?? i.assignees.find(a => a.username === u)!),
      }),
    });
  };

  const openAssignees = () => {
    setDraftAssignees(issue.assignees.map(a => a.username));
    setEditing('assignees');
  };
  useShortcut('s', () => setEditing('status'), canEdit && editing === null);
  useShortcut('a', openAssignees, canEdit && editing === null);

  const today = todayCalendarDate(timeZone);
  const resolved = RESOLVED_STATUS_CATEGORIES.includes(issue.status.category);
  const dueTone =
    issue.due_date === null || resolved
      ? undefined
      : issue.due_date < today
        ? 'overdue'
        : issue.due_date === today
          ? 'today'
          : undefined;

  const setDate = (field: 'start_date' | 'due_date', value: string | null) => {
    setEditing(null);
    if (issue[field] === value) return;
    save({ body: { [field]: value }, optimistic: i => ({ ...i, [field]: value }) });
  };

  return (
    <aside
      aria-label="Issue fields"
      className="flex flex-col gap-0.5 min-[1100px]:sticky min-[1100px]:top-0 min-[1100px]:max-h-[calc(100vh-var(--topbar)-var(--space-5))] min-[1100px]:overflow-y-auto"
    >
      <SidebarField
        label="Project"
        aside={
          <span className="grid size-avatar-sm place-items-center rounded-sm bg-inset text-[10px] font-semibold text-text-secondary">
            {issue.project.key}
          </span>
        }
      >
        {issue.project.name}
      </SidebarField>

      <SidebarField
        label="Priority"
        disabled={!canEdit}
        aside={<PriorityBadge priority={issue.priority} />}
        {...openProps('priority')}
        editor={
          <ValueCommand
            placeholder="Change priority"
            loading={priorities.isPending}
            selected={issue.priority.name}
            options={(priorities.data ?? []).map(p => ({ name: p.name, mark: <PriorityBadge priority={p} /> }))}
            onSelect={name => {
              const next = priorities.data?.find(p => p.name === name);
              pick('priority', name, i => (next ? { ...i, priority: next } : i));
            }}
          />
        }
      >
        {issue.priority.name}
      </SidebarField>

      <SidebarField
        label="Type"
        disabled={!canEdit}
        aside={<TypeBadge type={issue.type} />}
        {...openProps('type')}
        editor={
          <ValueCommand
            placeholder="Change type"
            loading={types.isPending}
            selected={issue.type.name}
            options={(types.data ?? []).map(t => ({ name: t.name, mark: <TypeBadge type={t} /> }))}
            onSelect={name => {
              const next = types.data?.find(t => t.name === name);
              pick('type', name, i => (next ? { ...i, type: next } : i));
            }}
          />
        }
      >
        {issue.type.name}
      </SidebarField>

      <SidebarField
        label="Status"
        disabled={!canEdit}
        {...openProps('status')}
        editor={
          <ValueCommand
            placeholder="Change status"
            loading={statuses.isPending}
            selected={issue.status.name}
            options={(statuses.data ?? [])
              .filter(s => !s.is_archived)
              .map(s => ({ name: s.name, mark: <StatusDot category={s.category} color={s.color} /> }))}
            onSelect={name => {
              const next = statuses.data?.find(s => s.name === name);
              pick('status', name, i => (next ? { ...i, status: next } : i));
            }}
          />
        }
      >
        <StatusDot category={issue.status.category} color={issue.status.color} />
        {issue.status.name}
      </SidebarField>

      <SidebarField
        label="Assignees"
        disabled={!canEdit}
        empty={issue.assignees.length === 0}
        open={assigneesOpen}
        onOpenChange={open => {
          if (open) openAssignees();
          else closeAssignees();
        }}
        editor={
          <AssigneeCommand
            people={assignees.data ?? []}
            loading={assignees.isPending}
            selected={draftAssignees}
            onToggle={username =>
              setDraftAssignees(current =>
                current.includes(username) ? current.filter(u => u !== username) : [...current, username],
              )
            }
          />
        }
      >
        {issue.assignees.length === 0
          ? 'Unassigned'
          : issue.assignees.map(a => (
              <span key={a.username} className="inline-flex items-center gap-1.5">
                <MemberAvatar member={a} className="size-5" />
                <PersonName person={a} />
              </span>
            ))}
      </SidebarField>

      <SidebarField
        label="Start date"
        disabled={!canEdit}
        empty={issue.start_date === null}
        contentClassName="w-[284px]"
        {...openProps('start_date')}
        editor={<DateEditor value={issue.start_date} onChange={v => setDate('start_date', v)} />}
      >
        {issue.start_date ? formatCalendarDate(issue.start_date) : 'No start date'}
      </SidebarField>

      <SidebarField
        label="Due date"
        disabled={!canEdit}
        empty={issue.due_date === null}
        contentClassName="w-[284px]"
        {...openProps('due_date')}
        editor={<DateEditor value={issue.due_date} onChange={v => setDate('due_date', v)} />}
      >
        {issue.due_date ? (
          <span
            className={cn(
              dueTone === 'overdue' && 'font-medium text-danger-fg',
              dueTone === 'today' && 'font-medium text-text',
            )}
          >
            {formatCalendarDate(issue.due_date)}
            {dueTone === 'today' ? ', today' : dueTone === 'overdue' ? ', overdue' : ''}
          </span>
        ) : (
          'No due date'
        )}
      </SidebarField>

      <SidebarField
        label="Sprint"
        disabled={!canEdit}
        empty={issue.sprint === null}
        {...openProps('sprint')}
        editor={
          <SprintCommand
            sprints={sprints.data ?? []}
            loading={sprints.isPending}
            selected={issue.sprint?.slug ?? null}
            onSelect={slug => {
              setEditing(null);
              if ((issue.sprint?.slug ?? null) === slug) return;
              const next = slug === null ? null : sprints.data?.find(s => s.slug === slug);
              save({
                body: { sprint: slug },
                optimistic: i => ({
                  ...i,
                  sprint: next ? { name: next.name, slug: next.slug, state: next.state } : null,
                }),
              });
            }}
          />
        }
      >
        {issue.sprint ? issue.sprint.name : UNSCHEDULED}
      </SidebarField>

      <SidebarField
        label="Story points"
        mono
        disabled={!canEdit}
        empty={issue.story_points === null}
        {...openProps('story_points')}
        onOpenChange={open => {
          setPointsError(null);
          setEditing(open ? 'story_points' : null);
        }}
        editor={
          <StoryPointsEditor
            value={issue.story_points}
            error={pointsError}
            onSave={points => {
              if (points === issue.story_points) return setEditing(null);
              update.mutate(
                { body: { story_points: points }, optimistic: i => ({ ...i, story_points: points }) },
                {
                  onSuccess: () => setEditing(null),
                  onError: error => setPointsError(isApiError(error) ? error.message : 'Could not save.'),
                },
              );
            }}
          />
        }
      >
        {issue.story_points === null ? NOT_ESTIMATED : issue.story_points}
      </SidebarField>
      {issue.story_points_rollup !== null ? (
        <p className="-mt-1.5 px-2 pb-1 text-2xs text-text-secondary">
          <span className="font-mono tabular">{issue.story_points_rollup}</span> in subtasks
        </p>
      ) : null}

      {time.enabled ? (
        <>
          <SidebarField
            label={estimationLabel}
            mono
            disabled={!canEdit}
            empty={issue.estimate_minutes === null}
            {...openProps('estimate')}
            onOpenChange={open => {
              setEstimateError(null);
              setEditing(open ? 'estimate' : null);
            }}
            editor={
              <EstimateEditor
                label={estimationLabel}
                value={issue.estimate_minutes}
                calendar={calendar}
                error={estimateError}
                onSave={typed => {
                  if (typed === null && issue.estimate_minutes === null) return setEditing(null);
                  update.mutate(
                    { body: { estimate: typed } },
                    {
                      onSuccess: () => setEditing(null),
                      onError: error => setEstimateError(isApiError(error) ? error.message : 'Could not save.'),
                    },
                  );
                }}
              />
            }
          >
            {issue.estimate_minutes === null ? '?' : formatDuration(issue.estimate_minutes, calendar)}
          </SidebarField>
          <SpentTimeField
            issue={issue}
            label={spentLabel}
            calendar={calendar}
            onLogTime={time.canLog ? time.onLogTime : undefined}
          />
        </>
      ) : null}

      <SidebarCustomFields issue={issue} canEdit={canEdit} timeZone={timeZone} />

      {issue.project.git_enabled ? (
        <DevelopmentField issue={issue} onOpen={onOpenDevelopment} onLink={onLinkPullRequest} />
      ) : null}

      <div className="mx-2 mt-2 border-t pt-4 pb-1 text-2xs font-medium text-text-muted">Watching</div>
      <WatchersField issueKey={issue.key} count={issue.watcher_count} />
      <SidebarField label="Votes">
        <span className="tabular">{issue.vote_count}</span>
      </SidebarField>
    </aside>
  );
}

function WatchersField({ issueKey, count }: { issueKey: string; count: number }) {
  const [open, setOpen] = useState(false);
  const watchers = useIssueWatchers(issueKey, open);

  return (
    <SidebarField
      label="Watchers"
      empty={count === 0}
      open={open}
      onOpenChange={setOpen}
      editor={
        <ul className="flex max-h-72 flex-col overflow-y-auto p-1">
          {(watchers.data ?? []).map(w => (
            <li key={w.username} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
              <MemberAvatar member={w} className="size-5" />
              <PersonName person={w} className="flex-1" />
              <span className="text-xs text-text-muted">@{w.username}</span>
            </li>
          ))}
          {watchers.isPending
            ? Array.from({ length: Math.min(count, 4) }, (_, i) => (
                <li key={i} className="flex items-center gap-2 px-2 py-1.5">
                  <Skeleton className="size-5 rounded-full" />
                  <Skeleton className="h-3 w-32" />
                </li>
              ))
            : null}
        </ul>
      }
    >
      {count === 0 ? 'Nobody' : `${count} ${count === 1 ? 'person' : 'people'}`}
    </SidebarField>
  );
}

interface SpentTimeFieldProps {
  issue: Issue;
  label: string;
  calendar: WorkCalendar;
  onLogTime?: (() => void) | undefined;
}

/** Spent against the estimate: `3h of 4h`, a meter, and the overrun in the danger colour once past it. */
function SpentTimeField({ issue, label, calendar, onLogTime }: SpentTimeFieldProps) {
  const spent = issue.spent_minutes;
  const estimate = issue.estimate_minutes;
  const over = estimate !== null && spent > estimate;
  const ratio = estimate ? spent / estimate : 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 rounded-sm px-2 py-[7px]">
      <span className="text-2xs text-text-muted">{label}</span>
      <span
        className={cn(
          'col-start-1 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm',
          spent === 0 ? 'text-text-muted' : 'font-mono text-xs tabular text-text',
        )}
      >
        {spent === 0 ? '?' : formatDuration(spent, calendar)}
        {spent > 0 && estimate !== null && estimate > 0 ? (
          <span className="font-sans text-2xs text-text-secondary">
            of <Duration minutes={estimate} calendar={calendar} />
          </span>
        ) : null}
        {over ? (
          <span className="font-sans text-2xs font-medium text-danger-fg">
            <span aria-hidden className="mr-1.5 font-normal text-text-muted">
              ·
            </span>
            <Duration minutes={spent - estimate} calendar={calendar} /> over
          </span>
        ) : null}
      </span>
      {onLogTime ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add spent time"
              className="col-start-2 row-span-2 row-start-1 text-text-secondary"
              onClick={onLogTime}
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add spent time</TooltipContent>
        </Tooltip>
      ) : null}
      {estimate !== null && estimate > 0 ? (
        <div className={cn('col-start-1 mt-1', over && 'c-red')}>
          <Meter
            ratio={ratio}
            label={`Spent ${Math.round(ratio * 100)}% of the estimate`}
            className={cn(over && '[&>i]:bg-c-solid')}
          />
        </div>
      ) : null}
    </div>
  );
}

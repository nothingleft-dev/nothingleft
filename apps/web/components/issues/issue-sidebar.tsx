'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { toastError } from '@components/toast-error';
import type { WorkCalendar } from '@nothingleft/format';
import { RESOLVED_STATUS_CATEGORIES, type Issue, type MemberRef, type UpdateIssue } from '@nothingleft/types';
import { Plus } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { Meter } from '@components/dashboard/meter';
import { Duration } from '@components/duration';
import { PriorityBadge, StatusDot, TypeBadge, ValueDot } from '@components/issues/value-marks';
import { AssigneeCommand, DateEditor, EstimateEditor, ValueCommand, retryOf } from '@components/issues/pickers';
import { FIELD_NAME_TEXT, FIELD_PERSON_TEXT, FIELD_TEXT, SidebarField } from '@components/issues/sidebar-field';
import { DevelopmentField } from '@components/git/development-field';
import { SprintCommand, StoryPointsEditor, UNSCHEDULED } from '@components/agile/sprint-field';
import type { TimeTracking } from '@components/issues/issue-activity';
import { SidebarCustomFields, timeRoleField } from '@components/custom-fields/sidebar-fields';
import { RelativeTime } from '@components/relative-time';
import { useCustomFields } from '@hooks/use-custom-fields';
import { PersonName } from '@components/former-member-chip';
import { AssigneeStack } from '@components/issues/assignee-stack';
import { useIssueWatchers, useUpdateIssue, type IssueUpdate } from '@hooks/use-issues';
import { useProjectAssignees } from '@hooks/use-projects';
import { usePriorityRise, useSchemaValues } from '@hooks/use-project-schema';
import { useSprints } from '@hooks/use-sprints';
import { useShortcut } from '@hooks/use-shortcut';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import { isApiError } from '@lib/api/errors';
import { formatCalendarDate, todayCalendarDate } from '@lib/datetime';
import { ProjectMarkByKey } from '@components/projects/project-mark';
import { cn } from '@lib/utils';
import { plural } from '@lib/numbers';

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
  /** `primary`: the strip of key fields under the title. `rest`: the rail beside the issue. */
  part: 'primary' | 'rest';
  issue: Issue;
  canEdit: boolean;
  time: TimeTracking;
  timeZone?: string;
  onOpenDevelopment?: () => void;
  onLinkPullRequest?: () => void;
}

export function IssueSidebar({
  part,
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
  const rise = usePriorityRise(projectKey, issue.priority.name);
  const estimationLabel = timeRoleField(customFields.data, 'estimation')?.name ?? 'Estimation';
  const spentLabel = timeRoleField(customFields.data, 'spent_time')?.name ?? 'Spent time';

  const save = (field: string, input: IssueUpdate) => {
    const send = () =>
      update.mutate(input, {
        onError: error => toastError(`Could not save ${field}`, error, { retry: send }),
      });
    send();
  };

  const openProps = (editor: Exclude<Editor, null>) => ({
    open: editing === editor,
    onOpenChange: (open: boolean) => setEditing(open ? editor : null),
  });

  const pick = (field: 'status' | 'priority' | 'type', name: string, patch: (i: Issue) => Issue) => {
    setEditing(null);
    const current = field === 'status' ? issue.status : field === 'priority' ? issue.priority : issue.type;
    if (current.name === name) return;
    save(field, { body: { [field]: name } as UpdateIssue, optimistic: patch });
  };

  const assigneesOpen = editing === 'assignees';
  const closeAssignees = () => {
    setEditing(null);
    const before = issue.assignees.map(a => a.username).sort();
    const after = [...draftAssignees].sort();
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const people = assignees.data ?? [];
    save('the assignees', {
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
  const strip = part === 'primary';
  const variant = strip ? 'strip' : 'rail';
  const [railRef, railTop] = useRailStickyTop();
  useShortcut('s', () => setEditing('status'), strip && canEdit && editing === null);
  useShortcut('a', openAssignees, strip && canEdit && editing === null);

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
    save(field === 'due_date' ? 'the due date' : 'the start date', {
      body: { [field]: value },
      optimistic: i => ({ ...i, [field]: value }),
    });
  };

  // Creating an issue also stamps its update; a second row would only repeat the first.
  const untouched = Date.parse(issue.updated_at) - Date.parse(issue.created_at) < 60_000;

  if (part === 'primary') {
    return (
      <div role="group" aria-label="Key fields" className="key-strip mt-4">
        <SidebarField
          variant={variant}
          label="Status"
          disabled={!canEdit}
          {...openProps('status')}
          editor={
            <ValueCommand
              placeholder="Find a status"
              loading={statuses.isPending}
              onRetry={retryOf(statuses)}
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
          <span className={cn('font-medium', FIELD_TEXT)}>{issue.status.name}</span>
        </SidebarField>
        <SidebarField
          label="Priority"
          disabled={!canEdit}
          variant={variant}
          aside={strip ? undefined : <PriorityBadge priority={issue.priority} />}
          {...openProps('priority')}
          editor={
            <ValueCommand
              placeholder="Find a priority"
              loading={priorities.isPending}
              onRetry={retryOf(priorities)}
              selected={issue.priority.name}
              options={(priorities.data ?? []).map(p => ({
                name: p.name,
                mark: strip ? <ValueDot color={p.color} /> : <PriorityBadge priority={p} />,
              }))}
              onSelect={name => {
                const next = priorities.data?.find(p => p.name === name);
                pick('priority', name, i => (next ? { ...i, priority: next } : i));
              }}
            />
          }
        >
          {strip ? <ValueDot color={issue.priority.color} plain={!rise.raised} /> : null}
          {issue.priority.name}
        </SidebarField>
        <SidebarField
          label="Type"
          disabled={!canEdit}
          variant={variant}
          aside={strip ? undefined : <TypeBadge type={issue.type} />}
          {...openProps('type')}
          editor={
            <ValueCommand
              placeholder="Find a type"
              loading={types.isPending}
              onRetry={retryOf(types)}
              selected={issue.type.name}
              options={(types.data ?? []).map(t => ({
                name: t.name,
                mark: strip ? <ValueDot color={t.color} /> : <TypeBadge type={t} />,
              }))}
              onSelect={name => {
                const next = types.data?.find(t => t.name === name);
                pick('type', name, i => (next ? { ...i, type: next } : i));
              }}
            />
          }
        >
          {strip ? <ValueDot color={issue.type.color} /> : null}
          {issue.type.name}
        </SidebarField>
        <SidebarField
          variant={variant}
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
              onRetry={retryOf(assignees)}
              selected={draftAssignees}
              onToggle={username =>
                setDraftAssignees(current =>
                  current.includes(username) ? current.filter(u => u !== username) : [...current, username],
                )
              }
            />
          }
        >
          {issue.assignees.length === 0 ? (
            'Unassigned'
          ) : issue.assignees.length === 1 ? (
            <PersonName
              person={issue.assignees[0]!}
              avatar
              className={cn('[&>span]:whitespace-normal [&>span]:[overflow-wrap:anywhere]', FIELD_PERSON_TEXT)}
            />
          ) : (
            <AssigneeStack
              assignees={issue.assignees}
              short
              nameClassName={cn('text-text', FIELD_NAME_TEXT)}
              className="text-sm"
            />
          )}
        </SidebarField>
        <SidebarField
          variant={variant}
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
                save('the sprint', {
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
          variant={variant}
          label="Due date"
          disabled={!canEdit}
          empty={issue.due_date === null}
          // The label says it, so the date stays one line and the strip one height.
          labelAs={
            dueTone === 'overdue' ? (
              <span className="font-medium text-danger-fg">Overdue</span>
            ) : dueTone === 'today' ? (
              <span className="font-medium text-text">Due today</span>
            ) : undefined
          }
          contentClassName="w-[284px]"
          {...openProps('due_date')}
          editor={
            <DateEditor
              value={issue.due_date}
              timeZone={timeZone}
              onChange={v => setDate('due_date', v)}
              note={issue.start_date ? `Starts ${formatCalendarDate(issue.start_date)}` : undefined}
            />
          }
        >
          {issue.due_date ? (
            <span
              className={cn(
                FIELD_TEXT,
                dueTone === 'overdue' && 'font-medium text-danger-fg',
                dueTone === 'today' && 'font-medium text-text',
              )}
            >
              {formatCalendarDate(issue.due_date)}
            </span>
          ) : (
            'No due date'
          )}
        </SidebarField>
      </div>
    );
  }

  return (
    <aside
      ref={railRef}
      id="issue-fields"
      aria-label="Issue fields"
      style={{ top: railTop }}
      className="flex flex-col gap-0.5 min-[1100px]:sticky"
    >
      <SidebarField label="Project">
        <ProjectMarkByKey projectKey={issue.project.key} className="size-5 rounded-xs" />
        {issue.project.name}
      </SidebarField>
      <SidebarField
        label="Start date"
        disabled={!canEdit}
        empty={issue.start_date === null}
        contentClassName="w-[284px]"
        {...openProps('start_date')}
        editor={
          <DateEditor
            value={issue.start_date}
            timeZone={timeZone}
            onChange={v => setDate('start_date', v)}
            note={issue.due_date ? `Due ${formatCalendarDate(issue.due_date)}` : undefined}
          />
        }
      >
        {issue.start_date ? formatCalendarDate(issue.start_date) : 'No start date'}
      </SidebarField>
      <SidebarField
        label="Story points"
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
        {issue.story_points === null ? '?' : <span className={cn('tabular', FIELD_TEXT)}>{issue.story_points}</span>}
      </SidebarField>
      {issue.story_points_rollup !== null ? (
        <p className="-mt-1.5 px-2 pb-1 text-2xs text-text-secondary">
          <span className="tabular">{issue.story_points_rollup}</span> in subtasks
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
            {issue.estimate_minutes === null ? (
              '?'
            ) : (
              <Duration minutes={issue.estimate_minutes} calendar={calendar} className={FIELD_TEXT} />
            )}
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

      <div className="mx-2 mt-3 border-t pt-3" />
      <WatchersField issueKey={issue.key} count={issue.watcher_count} />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-2 pt-2 pb-1 text-2xs">
        <Provenance label="Created" person={issue.created_by} at={issue.created_at} timeZone={timeZone} />
        {untouched ? null : (
          <Provenance label="Updated" person={issue.updated_by} at={issue.updated_at} timeZone={timeZone} />
        )}
      </dl>
    </aside>
  );
}

interface ProvenanceProps {
  label: string;
  person: MemberRef;
  at: string;
  timeZone?: string | undefined;
}

function Provenance({ label, person, at, timeZone }: ProvenanceProps) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-text-secondary">
        <PersonName person={person} className="text-text" />
        <span aria-hidden>·</span>
        <RelativeTime value={at} {...(timeZone ? { timeZone } : {})} className="text-text-secondary" />
      </dd>
    </>
  );
}

/** Taller than its scroller, the rail sticks by its end, so the page's one scroll reaches every field. */
function useRailStickyTop() {
  const rail = useRef<HTMLElement>(null);
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    const element = rail.current;
    if (!element) return;
    let scroller = element.parentElement;
    while (scroller && !/auto|scroll/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    const room = scroller ?? document.documentElement;
    const measure = () => setTop(Math.min(0, room.clientHeight - element.offsetHeight - 24));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(room);
    return () => observer.disconnect();
  }, []);

  return [rail, top] as const;
}

function WatchersField({ issueKey, count }: { issueKey: string; count: number }) {
  const [open, setOpen] = useState(false);
  const watchers = useIssueWatchers(issueKey, open);

  return (
    <SidebarField
      label="Watchers"
      cue="open"
      empty={count === 0}
      open={open}
      onOpenChange={setOpen}
      disabled={count === 0}
      editor={
        <ul className="flex max-h-72 flex-col overflow-y-auto p-1">
          {(watchers.data ?? []).map(w => (
            <li key={w.username} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
              <PersonName person={w} avatar className="flex-1" />
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
      {count === 0 ? 'Nobody' : `${plural(count, 'person', 'people')}`}
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
      {onLogTime ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Add spent time"
              className="-my-1 text-text-secondary"
              onClick={onLogTime}
            >
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add spent time</TooltipContent>
        </Tooltip>
      ) : null}
      <span
        className={cn(
          'col-span-2 flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-sm',
          spent === 0 ? 'text-text-muted' : 'text-text',
        )}
      >
        {spent === 0 ? '?' : <Duration minutes={spent} calendar={calendar} className="text-xs" />}
        {spent > 0 && estimate !== null && estimate > 0 ? (
          <span className="text-2xs text-text-secondary">
            of <Duration minutes={estimate} calendar={calendar} />
          </span>
        ) : null}
        {over ? (
          <span className="text-2xs font-medium text-danger-fg">
            <span aria-hidden className="mr-1.5 font-normal text-text-muted">
              ·
            </span>
            <Duration minutes={spent - estimate} calendar={calendar} /> over
          </span>
        ) : null}
      </span>
      {spent > 0 && estimate !== null && estimate > 0 ? (
        <div className={cn('col-span-2 mt-1', over && 'c-red')}>
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

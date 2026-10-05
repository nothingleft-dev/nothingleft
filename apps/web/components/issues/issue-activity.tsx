'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import type { WorkCalendar } from '@nothingleft/format';
import {
  ISSUE_ACTIVITY_KINDS,
  type CustomField,
  type Issue,
  type IssueActivity,
  type IssueActivityKind,
  type IssueLinkSnapshot,
  type MemberRef,
  type WorkItemSnapshot,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Duration } from '@components/duration';
import { EmptyState } from '@components/empty-state';
import { RelativeTime } from '@components/relative-time';
import { PersonName } from '@components/former-member-chip';
import { CommentBody, CommentComposer, CommentHeader, CommentMenu } from '@components/issues/issue-comments';
import { MemberAvatar } from '@components/issues/member-avatar';
import { IssueSpentTime } from '@components/issues/issue-spent-time';
import { useComments, type ThreadComment } from '@hooks/use-comments';
import { useCustomFields } from '@hooks/use-custom-fields';
import { emptyLabelOf } from '@components/custom-fields/field-types';
import { useIssueActivity } from '@hooks/use-issues';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import { formatCalendarDate, formatDateTime } from '@lib/datetime';
import { cn } from '@lib/utils';

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'comments', label: 'Comments' },
  { value: 'time', label: 'Spent time' },
  { value: 'history', label: 'History' },
] as const;
type Tab = (typeof TABS)[number]['value'];

const COMMENT_KINDS: readonly IssueActivityKind[] = ['commented', 'comment_edited', 'comment_deleted'];
const HISTORY_KINDS = ISSUE_ACTIVITY_KINDS.filter(kind => !COMMENT_KINDS.includes(kind));

const VERBS: Partial<Record<IssueActivityKind, string>> = {
  created: 'created this issue',
  deleted: 'deleted this issue',
  restored: 'restored this issue',
  commented: 'commented',
  comment_deleted: 'deleted a comment',
};

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  status: 'Status',
  priority: 'Priority',
  type: 'Type',
  assignees: 'Assignees',
  estimate: 'Estimation',
  start_date: 'Start date',
  due_date: 'Due date',
  story_points: 'Story points',
};

type NameOf = (username: string) => string;
type FieldOf = (slug: string) => CustomField | undefined;

const CUSTOM = 'custom:';

// A deleted field leaves rows whose type can no longer be known: its slug and raw values stand in.
function customValue(
  field: CustomField | undefined,
  value: unknown,
  calendar: WorkCalendar,
  nameOf: NameOf,
): ReactNode {
  const empty = field ? emptyLabelOf(field) : '--';
  if (field?.type === 'checkbox') return value === true ? 'Yes' : 'No';
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return empty;
  const names = (v: unknown) => (Array.isArray(v) ? v.map(String) : [String(v)]);
  switch (field?.type) {
    case 'select':
      return (value as { name?: string }).name ?? empty;
    case 'multi_select':
      return names(value).join(', ');
    case 'user':
    case 'multi_user':
      return names(value).map(nameOf).join(', ');
    case 'duration':
      return typeof value === 'number' ? <Duration minutes={value} calendar={calendar} /> : String(value);
    case 'date':
      return formatCalendarDate(String(value));
    case 'datetime':
      return formatDateTime(String(value));
    default:
      if (typeof value === 'object' && value && 'name' in value) return String((value as { name: unknown }).name);
      return Array.isArray(value) ? value.join(', ') : String(value);
  }
}

// Snapshots taken at write time — see /v1/issues/{key}/activity in openapi.yaml for each shape.
function snapshotValue(field: string, value: unknown, calendar: WorkCalendar, nameOf: NameOf): ReactNode {
  switch (field) {
    case 'status':
    case 'priority':
    case 'type':
      return (value as { name?: string } | null)?.name ?? '--';
    case 'assignees': {
      const usernames = Array.isArray(value) ? (value as string[]) : [];
      return usernames.length === 0 ? 'Unassigned' : usernames.map(nameOf).join(', ');
    }
    case 'estimate':
      return typeof value === 'number' ? <Duration minutes={value} calendar={calendar} /> : '?';
    case 'start_date':
      return typeof value === 'string' ? formatCalendarDate(value) : 'No start date';
    case 'due_date':
      return typeof value === 'string' ? formatCalendarDate(value) : 'No due date';
    case 'story_points':
      return typeof value === 'number' ? value : 'Not estimated';
    default:
      return typeof value === 'string' ? value : '--';
  }
}

interface Entry {
  id: string;
  rows: IssueActivity[];
  at: string;
}

function groupBySave(rows: IssueActivity[]): Entry[] {
  const entries: Entry[] = [];
  for (const row of rows) {
    const last = entries.at(-1);
    if (last && last.id === row.change_group_id) {
      last.rows.push(row);
      if (row.updated_at > last.at) last.at = row.updated_at;
    } else {
      entries.push({ id: row.change_group_id, rows: [row], at: row.updated_at });
    }
  }
  return entries;
}

export interface TimeTracking {
  /** The project tracks time: the tab, the button and the sidebar fields show at all. */
  enabled: boolean;
  canLog: boolean;
  canLogForOthers: boolean;
  me: MemberRef | null;
  onLogTime: () => void;
}

interface IssueActivitySectionProps {
  issue: Issue;
  canComment: boolean;
  time: TimeTracking;
  timeZone?: string;
}

export function IssueActivitySection({ issue, canComment, time, timeZone }: IssueActivitySectionProps) {
  const [chosen, setTab] = useState<Tab>('all');
  const tab: Tab = chosen === 'time' && !time.enabled ? 'all' : chosen;
  const context = { issueKey: issue.key, projectKey: issue.project.key, timeZone };
  const calendar = useWorkCalendar();
  const tabs = TABS.filter(t => t.value !== 'time' || time.enabled);

  return (
    <section className="mt-8" aria-label="Activity">
      <div className="flex h-control items-center gap-3 border-b">
        <h2 className="text-sm font-semibold">Activity</h2>
        <div role="tablist" aria-label="Activity" className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                'inline-flex h-control-sm items-center gap-1.5 rounded-sm px-2 text-xs text-text-secondary hover:bg-hover hover:text-text',
                tab === t.value && 'bg-active text-text',
              )}
            >
              {t.label}
              {t.value === 'comments' && issue.comment_count > 0 ? (
                <span className="tabular text-text-muted">{issue.comment_count}</span>
              ) : null}
              {t.value === 'time' && issue.spent_minutes > 0 ? (
                <Duration minutes={issue.spent_minutes} calendar={calendar} className="text-2xs text-text-muted" />
              ) : null}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-text-muted max-sm:hidden">Oldest first</span>
      </div>

      {tab === 'comments' ? (
        <CommentsTab {...context} canComment={canComment} />
      ) : tab === 'time' ? (
        <IssueSpentTime
          issue={issue}
          canLog={time.canLog}
          canLogForOthers={time.canLogForOthers}
          me={time.me}
          onLogTime={time.onLogTime}
          timeZone={timeZone}
        />
      ) : (
        <ActivityTab key={tab} {...context} history={tab === 'history'} />
      )}

      {canComment && tab !== 'history' && tab !== 'time' ? (
        <CommentComposer
          scope={{ issue: issue.key }}
          projectKey={issue.project.key}
          onLogTime={time.enabled && time.canLog ? time.onLogTime : undefined}
        />
      ) : null}
    </section>
  );
}

interface TabContext {
  issueKey: string;
  projectKey: string;
  timeZone?: string;
}

function ActivityTab({ issueKey, projectKey, timeZone, history }: TabContext & { history: boolean }) {
  const activity = useIssueActivity(issueKey, history ? 'history' : 'all', history ? HISTORY_KINDS : undefined);
  const calendar = useWorkCalendar();

  const fields = useCustomFields(projectKey);
  const fieldOf = useMemo<FieldOf>(() => {
    const bySlug = new Map((fields.data ?? []).map(f => [f.slug, f]));
    return slug => bySlug.get(slug);
  }, [fields.data]);

  const nameOf = useMemo<NameOf>(() => {
    const people = (activity.data?.pages ?? []).flatMap(p => p.data).flatMap(r => r.people);
    const names = new Map(people.map(p => [p.username, p.name]));
    return username => names.get(username) ?? `@${username}`;
  }, [activity.data]);

  const entries = useMemo(() => {
    // An edit is the edited marker on the comment itself; its own line would repeat it.
    const rows = (activity.data?.pages ?? []).flatMap(p => p.data).filter(r => r.kind !== 'comment_edited');
    return groupBySave(rows);
  }, [activity.data]);

  if (activity.isPending) return <ActivitySkeleton />;
  if (activity.isError) {
    return (
      <EmptyState className="mt-3" title="The history could not be loaded." description={activity.error.message} />
    );
  }

  return (
    <>
      <ol>
        {entries.map((entry, index) => (
          <ActivityEntry
            key={entry.id}
            entry={entry}
            last={index === entries.length - 1}
            calendar={calendar}
            nameOf={nameOf}
            fieldOf={fieldOf}
            issueKey={issueKey}
            projectKey={projectKey}
            timeZone={timeZone}
          />
        ))}
      </ol>
      {activity.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={activity.isFetchingNextPage}
          onClick={() => void activity.fetchNextPage()}
        >
          {activity.isFetchingNextPage ? 'Loading more…' : 'Show later changes'}
        </Button>
      ) : null}
    </>
  );
}

function CommentsTab({ issueKey, projectKey, timeZone, canComment }: TabContext & { canComment: boolean }) {
  const comments = useComments({ issue: issueKey });
  const rows = (comments.data?.pages ?? []).flatMap(p => p.data);

  if (comments.isPending) return <ActivitySkeleton />;
  if (comments.isError) {
    return (
      <EmptyState className="mt-3" title="The comments could not be loaded." description={comments.error.message} />
    );
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        className="mt-3"
        title="No comments yet."
        description={canComment ? 'Start the conversation below.' : 'Comments people add will appear here.'}
      />
    );
  }

  return (
    <>
      <ol>
        {rows.map((comment, index) => (
          <CommentEntry
            key={comment.id}
            comment={comment}
            last={index === rows.length - 1}
            issueKey={issueKey}
            projectKey={projectKey}
            timeZone={timeZone}
          />
        ))}
      </ol>
      {comments.hasNextPage ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={comments.isFetchingNextPage}
          onClick={() => void comments.fetchNextPage()}
        >
          {comments.isFetchingNextPage ? 'Loading more…' : 'Show later comments'}
        </Button>
      ) : null}
    </>
  );
}

function Connector({ last }: { last: boolean }) {
  return last ? null : <span aria-hidden className="absolute top-11 -bottom-3 left-[15px] w-px bg-border" />;
}

interface CommentEntryProps extends TabContext {
  comment: ThreadComment;
  last: boolean;
  /** Field changes saved in the same go, drawn in a bordered block under the text. */
  children?: ReactNode;
}

function CommentEntry({ comment, last, issueKey, projectKey, timeZone, children }: CommentEntryProps) {
  const [editing, setEditing] = useState(false);
  const pending = comment.id < 0;
  return (
    <li
      className={cn('group/comment relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-3', pending && 'opacity-60')}
    >
      <Connector last={last} />
      <MemberAvatar member={comment.author} className="size-avatar-lg" />
      <div className="min-w-0">
        <div className="flex min-h-8 flex-wrap items-center gap-x-2 text-xs text-text-secondary">
          <CommentHeader comment={comment} timeZone={timeZone} />
          {pending || editing ? null : (
            <CommentMenu
              scope={{ issue: issueKey }}
              subject={issueKey}
              comment={comment}
              onEdit={() => setEditing(true)}
            />
          )}
        </div>
        <CommentBody
          scope={{ issue: issueKey }}
          projectKey={projectKey}
          comment={comment}
          editing={editing}
          onEditingChange={setEditing}
        />
        {children}
      </div>
    </li>
  );
}

interface ActivityEntryProps extends TabContext {
  entry: Entry;
  last: boolean;
  calendar: WorkCalendar;
  nameOf: NameOf;
  fieldOf: FieldOf;
}

const snap = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, unknown>) : null);

function ActivityEntry({ entry, last, calendar, nameOf, fieldOf, ...context }: ActivityEntryProps) {
  const first = entry.rows[0]!;
  const commented = entry.rows.find(r => r.kind === 'commented' && r.comment);
  const lifecycle = entry.rows.find(r => VERBS[r.kind] && r.kind !== 'commented');
  const changes = entry.rows.filter(r => r.kind === 'field_changed' && r.field && r.field !== 'description');
  const relations = entry.rows.filter(r => RELATION_KINDS.includes(r.kind));
  const time = entry.rows.filter(r => r.kind === 'time_logged');
  const touchedDescription = entry.rows.some(r => r.field === 'description');

  const details =
    changes.length > 0 || relations.length > 0 || time.length > 0 || touchedDescription ? (
      <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
        {changes.map(change => {
          const custom = change.field!.startsWith(CUSTOM) ? change.field!.slice(CUSTOM.length) : null;
          const field = custom ? fieldOf(custom) : undefined;
          const show = (value: unknown) =>
            custom
              ? customValue(field, value, calendar, nameOf)
              : snapshotValue(change.field!, value, calendar, nameOf);
          return (
            <div key={change.id} className="contents">
              <dt className="text-text-muted">
                {custom ? (field?.name ?? custom) : (FIELD_LABELS[change.field!] ?? change.field)}
              </dt>
              <dd className="min-w-0 text-text-secondary [overflow-wrap:anywhere]">
                {field?.type === 'markdown' ? (
                  'updated'
                ) : (
                  <>
                    {show(change.old_value)} → <b className="font-medium text-text">{show(change.new_value)}</b>
                  </>
                )}
              </dd>
            </div>
          );
        })}
        {relations.map(row => (
          <RelationLine key={row.id} row={row} />
        ))}
        {time.map(row => (
          <TimeLine key={row.id} row={row} calendar={calendar} nameOf={nameOf} />
        ))}
        {touchedDescription ? (
          <div className="contents">
            <dt className="text-text-muted">Description</dt>
            <dd className="text-text-secondary">updated</dd>
          </div>
        ) : null}
      </dl>
    ) : null;

  if (commented?.comment) {
    return (
      <CommentEntry comment={commented.comment} last={last} {...context}>
        {details ? <div className="mt-2 rounded-md border px-3 py-2">{details}</div> : null}
      </CommentEntry>
    );
  }

  const onlyTime = time.length > 0 && time.length === entry.rows.length;
  const fileVerb = filesVerb(entry.rows);
  const verb = lifecycle
    ? VERBS[lifecycle.kind]
    : onlyTime
      ? timeVerb(time)
      : fileVerb
        ? fileVerb
        : entry.rows.length === 1 && first.kind === 'sprint_changed'
          ? sprintVerb(first)
          : touchedDescription && changes.length === 0 && relations.length === 0
            ? 'updated the description'
            : 'updated';

  return (
    <li className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-3">
      <Connector last={last} />
      <MemberAvatar member={first.actor} className="size-avatar-lg" />
      <div className="min-w-0">
        <div className="flex h-8 flex-wrap items-center gap-x-2 text-xs text-text-secondary">
          <PersonName person={first.actor} className="font-medium text-text" />
          <span>{verb}</span>
          <RelativeTime value={entry.at} timeZone={context.timeZone} />
        </div>
        {details}
      </div>
    </li>
  );
}

const RELATION_KINDS: readonly IssueActivityKind[] = [
  'linked',
  'unlinked',
  'tagged',
  'untagged',
  'parent_changed',
  'attached',
  'detached',
  'sprint_changed',
];

const sprintName = (value: unknown) => {
  const name = snap(value)?.name;
  return typeof name === 'string' ? name : null;
};

function sprintVerb(row: IssueActivity): string {
  const to = sprintName(row.new_value);
  return to ? `moved this issue to ${to}` : 'moved this issue to the backlog';
}

function KeyLink({ issueKey }: { issueKey: string }) {
  return (
    <Link href={`/issue/${issueKey}` as Route} className="font-mono text-2xs text-text hover:underline">
      {issueKey}
    </Link>
  );
}

function RelationLine({ row }: { row: IssueActivity }) {
  const added = snap(row.new_value);
  const removed = snap(row.old_value);
  let label: string;
  let value: ReactNode;

  if (row.kind === 'sprint_changed') {
    label = 'Sprint';
    value = (
      <>
        {sprintName(row.old_value) ?? 'Unscheduled'} →{' '}
        <b className="font-medium text-text">{sprintName(row.new_value) ?? 'Unscheduled'}</b>
      </>
    );
  } else if (row.kind === 'parent_changed') {
    const from = removed?.key;
    const to = added?.key;
    label = 'Parent';
    value = (
      <>
        {typeof from === 'string' ? <KeyLink issueKey={from} /> : 'None'} →{' '}
        {typeof to === 'string' ? <KeyLink issueKey={to} /> : <b className="font-medium text-text">None</b>}
      </>
    );
  } else if (row.kind === 'linked' || row.kind === 'unlinked') {
    const link = ((row.kind === 'linked' ? added : removed) ?? {}) as Partial<IssueLinkSnapshot>;
    label = 'Links';
    value = (
      <>
        {row.kind === 'linked' ? 'added' : 'removed'} {link.link ?? ''}{' '}
        {typeof link.issue === 'string' ? <KeyLink issueKey={link.issue} /> : 'an issue in another project'}
      </>
    );
  } else if (row.kind === 'attached' || row.kind === 'detached') {
    const file = (row.kind === 'attached' ? added : removed) ?? {};
    label = 'Attachments';
    value = (
      <>
        {row.kind === 'attached' ? 'added' : 'removed'}{' '}
        <b className="font-medium text-text">{String(file.filename ?? '')}</b>
      </>
    );
  } else {
    const tag = (row.kind === 'tagged' ? added : removed) ?? {};
    label = 'Tags';
    value = (
      <>
        {row.kind === 'tagged' ? 'added' : 'removed'} <b className="font-medium text-text">{String(tag.name ?? '')}</b>
      </>
    );
  }

  return (
    <div className="contents">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 text-text-secondary [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

const snapshotOf = (value: unknown): WorkItemSnapshot | null =>
  value && typeof value === 'object' && 'minutes' in value ? (value as WorkItemSnapshot) : null;

function filesVerb(rows: IssueActivity[]): string | null {
  const n = rows.length;
  if (rows.every(r => r.kind === 'attached')) return n === 1 ? 'attached a file' : `attached ${n} files`;
  if (rows.every(r => r.kind === 'detached')) return n === 1 ? 'removed a file' : `removed ${n} files`;
  return null;
}

function timeVerb(rows: IssueActivity[]): string {
  if (rows.every(r => r.old_value === null)) return 'added spent time';
  if (rows.every(r => r.new_value === null)) return 'removed spent time';
  return 'changed spent time';
}

function TimeLine({ row, calendar, nameOf }: { row: IssueActivity; calendar: WorkCalendar; nameOf: NameOf }) {
  const before = snapshotOf(row.old_value);
  const after = snapshotOf(row.new_value);
  const duration = (s: WorkItemSnapshot, strong = false) => (
    <Duration minutes={s.minutes} calendar={calendar} className={cn(strong && 'font-medium text-text')} />
  );
  const whose = (s: WorkItemSnapshot) => (s.author && s.author !== row.actor.username ? nameOf(s.author) : null);
  const context = (s: WorkItemSnapshot) => {
    const author = whose(s);
    return [
      s.work_type,
      ...Object.entries(s.attributes ?? {}).map(([name, value]) => `${name}: ${value}`),
      formatCalendarDate(s.work_date),
      author ? `for ${author}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };

  let value: ReactNode = null;
  if (before && after) {
    // An edit names what moved, then the record it belongs to.
    const moved: ReactNode[] = [];
    const change = (label: string, from: ReactNode, to: ReactNode) =>
      moved.push(
        <span key={label}>
          {from} → <b className="font-medium text-text">{to}</b>
        </span>,
      );
    if (before.minutes !== after.minutes) change('minutes', duration(before), duration(after, true));
    if (before.work_date !== after.work_date) {
      change('date', formatCalendarDate(before.work_date), formatCalendarDate(after.work_date));
    }
    if (before.work_type !== after.work_type)
      change('type', before.work_type ?? 'No type', after.work_type ?? 'No type');
    if (before.author !== after.author) change('author', nameOf(before.author), nameOf(after.author));
    const was = before.attributes ?? {};
    const now = after.attributes ?? {};
    for (const name of new Set([...Object.keys(was), ...Object.keys(now)])) {
      if (was[name] !== now[name]) change(`attr:${name}`, `${name}: ${was[name] ?? 'none'}`, now[name] ?? 'none');
    }
    const unchanged: ReactNode[] = [
      before.minutes === after.minutes ? duration(after) : null,
      before.work_type === after.work_type ? after.work_type : null,
      before.work_date === after.work_date ? formatCalendarDate(after.work_date) : null,
      before.author === after.author && whose(after) ? `for ${whose(after)}` : null,
    ].filter(Boolean);
    value = (
      <>
        {moved.length > 0 ? (
          moved.reduce<ReactNode[]>((acc, node, i) => (i === 0 ? [node] : [...acc, ', ', node]), [])
        ) : (
          <>updated the note</>
        )}
        {unchanged.map((part, i) => (
          <span key={i} className="text-text-muted">
            {' · '}
            {part}
          </span>
        ))}
      </>
    );
  } else if (after) {
    value = (
      <>
        added {duration(after, true)} {context(after)}
      </>
    );
  } else if (before) {
    value = (
      <>
        removed <s>{duration(before)}</s> {context(before)}
      </>
    );
  }

  return (
    <div className="contents">
      <dt className="text-text-muted">Spent time</dt>
      <dd className="min-w-0 text-text-secondary [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex flex-col" aria-hidden>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 py-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-col gap-2 pt-2">
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

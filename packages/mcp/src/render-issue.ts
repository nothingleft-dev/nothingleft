import { formatDuration, type WorkCalendar } from '@nothingleft/format';
import type {
  Comment,
  CustomFieldOptionRef,
  Issue,
  IssueActivity,
  IssueCustomFieldValue,
  IssueLinkGroup,
  IssueLinkSnapshot,
  IssueRef,
  MemberRef,
} from '@nothingleft/types';
import { date, day, facts, handle, instant, join, person, table, untrusted } from './render.ts';

export const DESCRIPTION_PAGE = 8192;

export const issueUrl = (appBaseUrl: string, key: string) => `${appBaseUrl}/issue/${key}`;

export const people = (refs: readonly MemberRef[], empty = 'Unassigned') =>
  refs.length ? refs.map(person).join(', ') : empty;

export const duration = (minutes: number | null, calendar?: WorkCalendar) =>
  minutes === null ? null : formatDuration(minutes, calendar);

const resolvedMark = (issue: Pick<Issue, 'resolved_at'>) => (issue.resolved_at ? ' · resolved' : '');

export const ISSUE_ROW_HEADERS = ['Key', 'Title', 'Status', 'Priority', 'Type', 'Assignees', 'Due'];

export function issueRow(issue: Issue): string[] {
  return [
    issue.key,
    issue.title,
    issue.status.name + resolvedMark(issue),
    issue.priority.name,
    issue.type.name,
    issue.assignees.length ? issue.assignees.map(a => `@${a.username}`).join(', ') : '—',
    issue.due_date ? date(issue.due_date) : '—',
  ];
}

/** The list table, plus a column for each custom field slug in `slugs` that any row carries. */
export function issueTable(
  issues: readonly Issue[],
  zone: string,
  slugs: readonly string[] = [],
  calendar?: WorkCalendar,
): string {
  const extra = slugs.flatMap(slug => {
    const entry = issues.flatMap(i => i.custom_fields).find(f => f.slug === slug);
    return entry ? [{ slug, name: entry.name }] : [];
  });
  return table(
    [...ISSUE_ROW_HEADERS, ...extra.map(e => e.name)],
    issues.map(issue => [
      ...issueRow(issue),
      ...extra.map(e => {
        const entry = issue.custom_fields.find(f => f.slug === e.slug);
        return entry ? customFieldText(entry, issue.key, zone, calendar) : '—';
      }),
    ]),
  );
}

export const refLine = (ref: IssueRef) => `${ref.key} ${ref.title}${ref.resolved ? ' (resolved)' : ''}`;

export function linkLines(groups: readonly IssueLinkGroup[]): string | null {
  const shown = groups.filter(g => g.count > 0);
  if (!shown.length) return null;
  return shown
    .map(g => {
      const rest = g.count - g.issues.length;
      return `- **${g.link}** (${g.count}): ${g.issues.map(refLine).join('; ')}${rest > 0 ? `; …${rest} more` : ''}`;
    })
    .join('\n');
}

export function mine(issue: Issue): string | null {
  const flags = [issue.me.starred && 'starred', issue.me.watching && 'watching', issue.me.voted && 'voted'].filter(
    Boolean,
  );
  return flags.length ? flags.join(', ') : null;
}

/** One custom field of an issue as a fact row: the value, or the field's empty label. */
export function customFieldText(
  entry: IssueCustomFieldValue,
  issueKey: string,
  zone: string,
  calendar?: WorkCalendar,
): string {
  const value: unknown = entry.value;
  if (value === null || (Array.isArray(value) && value.length === 0)) return entry.empty_label;
  switch (entry.type) {
    case 'select':
      return (value as CustomFieldOptionRef).name;
    case 'multi_select':
      return (value as CustomFieldOptionRef[]).map(o => o.name).join(', ');
    case 'user':
      return person(value as MemberRef);
    case 'multi_user':
      return (value as MemberRef[]).map(person).join(', ');
    case 'checkbox':
      return value ? 'Yes' : 'No';
    case 'duration':
      return duration(value as number, calendar) ?? entry.empty_label;
    case 'date':
      return date(value as string);
    case 'datetime':
      return instant(value as string, zone);
    case 'markdown': {
      const text = String(value);
      const from = { author: 'a contributor', place: `the “${entry.name}” field of ${issueKey}` };
      return text.length > 200
        ? `${untrusted(from, `${text.slice(0, 200)}…`)} (${text.length} characters)`
        : untrusted(from, text);
    }
    default:
      return String(value);
  }
}

export const customFieldFacts = (issue: Issue, zone: string, calendar?: WorkCalendar): string | null =>
  issue.custom_fields.length
    ? facts(issue.custom_fields.map(f => [f.name, customFieldText(f, issue.key, zone, calendar)]))
    : null;

export function issueFacts(issue: Issue, zone: string, calendar?: WorkCalendar): string {
  return facts([
    ['Project', `${issue.project.key} — ${issue.project.name}`],
    ['Type', issue.type.name],
    ['Priority', issue.priority.name],
    ['Status', issue.status.name + resolvedMark(issue)],
    ['Assignees', people(issue.assignees)],
    ['Reporter', person(issue.created_by)],
    ['Parent', issue.parent],
    ['Tags', issue.tags.length ? issue.tags.map(t => t.name).join(', ') : null],
    ['Sprint', issue.sprint ? `${issue.sprint.name} (${issue.sprint.state})` : null],
    ['Story points', issue.story_points === null ? null : String(issue.story_points)],
    ['Subtask points', issue.story_points_rollup === null ? null : String(issue.story_points_rollup)],
    ['Subtasks', issue.subtasks.total ? `${issue.subtasks.resolved}/${issue.subtasks.total} resolved` : null],
    ['Estimation', duration(issue.estimate_minutes, calendar)],
    ['Spent time', issue.spent_minutes > 0 ? duration(issue.spent_minutes, calendar) : null],
    ['Start date', issue.start_date ? date(issue.start_date) : null],
    ['Due date', issue.due_date ? date(issue.due_date) : null],
    ...issue.custom_fields.map((f): [string, string] => [f.name, customFieldText(f, issue.key, zone, calendar)]),
    ['Votes', issue.vote_count > 0 ? String(issue.vote_count) : null],
    ['Watchers', issue.watcher_count > 0 ? String(issue.watcher_count) : null],
    ['Comments', issue.comment_count > 0 ? String(issue.comment_count) : null],
    ['Attachments', issue.attachment_count > 0 ? String(issue.attachment_count) : null],
    ['You', mine(issue)],
    ['Created', `${instant(issue.created_at, zone)} by ${person(issue.created_by)}`],
    ['Updated', `${instant(issue.updated_at, zone)} by ${person(issue.updated_by)}`],
    ['Resolved', issue.resolved_at ? instant(issue.resolved_at, zone) : null],
    [
      'Deleted',
      issue.deleted_at
        ? `${instant(issue.deleted_at, zone)} — restorable until ${instant(issue.restorable_until, zone)}`
        : null,
    ],
  ]);
}

export const issueHeading = (issue: Issue, appBaseUrl: string, verb?: string) =>
  `${verb ? `${verb} ` : ''}**${issue.key}** — ${issue.title}\n${issueUrl(appBaseUrl, issue.key)}`;

type DescribedIssue = Pick<Issue, 'key' | 'description_md' | 'updated_by' | 'updated_at'>;

/** A description cut at `length` characters, with the marker that says how to read on. */
export function descriptionPage(issue: DescribedIssue, zone: string, offset = 0, length = DESCRIPTION_PAGE): string {
  const text = issue.description_md ?? '';
  const page = text.slice(offset, offset + length);
  const end = offset + page.length;
  const framed = page
    ? untrusted(
        { author: handle(issue.updated_by.username), date: day(issue.updated_at, zone), place: issue.key },
        page,
      )
    : null;
  if (offset === 0 && end >= text.length) return framed ?? '';
  const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;
  const marker =
    end < text.length
      ? `[truncated — ${kb(text.length - end)} remaining. Call get_issue_description with issue: "${issue.key}", offset: ${end}]`
      : `[end of description — characters ${offset + 1}–${end} of ${text.length}]`;
  return join(framed, marker);
}

type ShownComment = Pick<Comment, 'id' | 'author' | 'created_at' | 'edited_at' | 'body_md'>;

export function commentBlock(c: ShownComment, place: string, zone: string): string {
  const edited = c.edited_at ? ` · edited ${instant(c.edited_at, zone)}` : '';
  return join(
    `**Comment ${c.id}** · ${person(c.author)} · ${instant(c.created_at, zone)}${edited}`,
    untrusted({ author: handle(c.author.username), date: day(c.edited_at ?? c.created_at, zone), place }, c.body_md),
  );
}

const snapshotName = (v: unknown) =>
  v && typeof v === 'object' && 'name' in v ? String((v as { name: unknown }).name) : v === null ? '—' : String(v);

function fieldValue(field: string, v: unknown, names: Map<string, MemberRef>, calendar?: WorkCalendar): string {
  if (v === null || v === undefined) return '—';
  if (field === 'assignees' && Array.isArray(v)) {
    return v.length
      ? v.map(u => (names.has(String(u)) ? person(names.get(String(u))!) : `@${u}`)).join(', ')
      : 'Unassigned';
  }
  if (field === 'estimate' && typeof v === 'number') return formatDuration(v, calendar);
  if ((field === 'start_date' || field === 'due_date') && typeof v === 'string') return date(v);
  if (Array.isArray(v)) return v.length ? v.map(String).join(', ') : '—';
  return snapshotName(v);
}

function linkSide(value: unknown): string {
  const side = value as Partial<IssueLinkSnapshot> | null;
  return `${side?.link} ${side?.issue ?? 'an issue in another project'}`;
}

/** One history entry as a line; snapshots are names already, `people` puts full names on usernames. */
export function activityLine(a: IssueActivity, zone: string, calendar?: WorkCalendar): string {
  const names = new Map(a.people.map(p => [p.username, p]));
  const who = a.actor.username ? person({ ...a.actor, username: a.actor.username }) : a.actor.name;
  const at = instant(a.updated_at, zone);
  const nv = a.new_value as Record<string, unknown> | null;
  const ov = a.old_value as Record<string, unknown> | null;
  const what = (() => {
    switch (a.kind) {
      case 'field_changed':
        return a.field === 'description' ||
          (a.field?.startsWith('custom:') && a.old_value === null && a.new_value === null)
          ? a.field === 'description'
            ? 'changed the description'
            : `changed ${a.field}`
          : `${a.field}: ${fieldValue(a.field!, a.old_value, names, calendar)} → ${fieldValue(a.field!, a.new_value, names, calendar)}`;
      case 'commented':
        return `commented${a.comment ? ` (comment ${a.comment.id})` : ''}`;
      case 'comment_edited':
        return `edited comment ${a.comment?.id ?? ''}`.trim();
      case 'comment_deleted':
        return 'deleted a comment';
      case 'linked':
        return `linked: ${linkSide(a.new_value)}`;
      case 'unlinked':
        return `unlinked: ${linkSide(a.old_value)}`;
      case 'tagged':
        return `tagged ${snapshotName(nv)}`;
      case 'untagged':
        return `untagged ${snapshotName(ov)}`;
      case 'attached':
        return `attached ${nv?.['filename']}`;
      case 'detached':
        return `removed file ${ov?.['filename']}`;
      case 'sprint_changed':
        return `sprint: ${snapshotName(ov) === '—' ? 'backlog' : snapshotName(ov)} → ${snapshotName(nv) === '—' ? 'backlog' : snapshotName(nv)}`;
      case 'parent_changed':
        return `parent: ${(ov?.['key'] as string) ?? '—'} → ${(nv?.['key'] as string) ?? '—'}`;
      case 'time_logged': {
        const side = (v: Record<string, unknown> | null) =>
          v
            ? `${formatDuration(Number(v['minutes']), calendar)} on ${date(String(v['work_date']))} by ${
                names.has(String(v['author'])) ? person(names.get(String(v['author']))!) : `@${v['author']}`
              }${v['work_type'] ? ` (${v['work_type']})` : ''}`
            : '';
        if (nv && ov) return `edited time: ${side(ov)} → ${side(nv)}`;
        return nv ? `logged ${side(nv)}` : `removed logged time: ${side(ov)}`;
      }
      default:
        return a.kind.replace(/_/g, ' ');
    }
  })();
  return `- ${at} · ${who} · ${what}`;
}

import {
  ARTICLES,
  articleUri,
  assigneesOf,
  comment,
  dependsOnOf,
  existsAt,
  firstName,
  formatDate,
  formatDuration,
  formatMoment,
  HISTORY,
  isResolved,
  isResolvedAt,
  issue,
  ISSUES,
  minutesFor,
  NOW,
  person,
  pointsOf,
  resolvedAt,
  severityOf,
  spentOn,
  sprintOf,
  statusOf,
  subtasksOf,
  updatedAt,
  type Moment,
  type Priority,
  type Status,
} from '@data/sample';
import type { FaqEntry } from '@lib/faq';

export const ISSUES_MANUAL_PATH = '/docs/manual/issues';
export const CUSTOM_FIELDS_MANUAL_PATH = '/docs/manual/custom-fields';

export interface SampleRow {
  key: string;
  title: string;
  priority: { name: string; letter: string; className: string };
  assignee?: { initials: string; name: string };
  spent?: string;
  status: { name: string; dot?: 'started' | 'done' };
}

const PRIORITY_LABELS: Record<Priority, { letter: string; className: string }> = {
  Critical: { letter: 'C', className: 'l-critical' },
  Major: { letter: 'M', className: 'l-major' },
  Normal: { letter: 'N', className: 'l-normal' },
  Minor: { letter: 'M', className: 'l-minor' },
};

const KEY = 'ACME-12';
const bug = issue(KEY);

// The issue page is shown just after ACME-12 was fixed.
export const SHOWN_AT: Moment = resolvedAt(KEY) ?? NOW;

const dotFor = (status: Status): 'started' | 'done' | undefined =>
  status === 'In Progress' ? 'started' : isResolved(status) ? 'done' : undefined;

export function sampleRow(key: string, at: Moment = SHOWN_AT): SampleRow {
  const found = issue(key);
  const assignee = assigneesOf(key, at)[0];
  const spent = minutesFor({ issue: key });
  const status = statusOf(key, at);
  return {
    key,
    title: found.title,
    priority: { name: found.priority, ...PRIORITY_LABELS[found.priority] },
    assignee: assignee && { initials: assignee.initials, name: assignee.name },
    spent: spent > 0 ? formatDuration(spent) : undefined,
    status: { name: status, dot: dotFor(status) },
  };
}

export const SAMPLE_ISSUE: SampleRow = sampleRow(KEY);

const LIST_PRIORITIES: Priority[] = ['Critical', 'Major'];
export const BUG_LIST_QUERY = `type: Bug priority: ${LIST_PRIORITIES.join(', ')} sort by: updated desc`;

export const BUG_LIST: SampleRow[] = ISSUES.filter(
  candidate =>
    candidate.type === 'Bug' && LIST_PRIORITIES.includes(candidate.priority) && existsAt(candidate.key, SHOWN_AT),
)
  .sort((a, b) => updatedAt(b.key, SHOWN_AT).localeCompare(updatedAt(a.key, SHOWN_AT)))
  .map(candidate => sampleRow(candidate.key));

export const SEVERITY_DEFAULT_VALUE = severityOf(KEY, SHOWN_AT) ?? 'High';

export const OTHER_CRITICAL_BUGS: SampleRow[] = ISSUES.filter(
  candidate =>
    candidate.key !== KEY && existsAt(candidate.key, SHOWN_AT) && severityOf(candidate.key, SHOWN_AT) === 'Critical',
).map(candidate => sampleRow(candidate.key));

const subtasks = subtasksOf(KEY, SHOWN_AT);
const dependencies = dependsOnOf(KEY, SHOWN_AT);
const reference = ARTICLES.find(candidate => candidate.references.includes(KEY));
const reproduction = comment(KEY, 'alex', '2026-10-06');
const lastChange = HISTORY.filter(entry => entry.key === KEY && entry.at <= SHOWN_AT).at(-1);

export const DETAIL = {
  key: KEY,
  title: bug.title,
  type: bug.type,
  priority: bug.priority,
  status: statusOf(KEY, SHOWN_AT),
  assignee: assigneesOf(KEY, SHOWN_AT)[0] ?? person('alex'),
  estimate: formatDuration(bug.estimate ?? 0),
  spent: formatDuration(spentOn(KEY, SHOWN_AT)),
  sprint: sprintOf(KEY, SHOWN_AT),
  points: pointsOf(KEY, SHOWN_AT),
  due: formatDate(bug.due ?? ''),
  severity: SEVERITY_DEFAULT_VALUE,
  subtasks: subtasks.map(child => ({
    key: child.key,
    title: child.title,
    resolved: isResolvedAt(child.key, SHOWN_AT),
  })),
  dependsOn: dependencies.map(key => ({ key, title: issue(key).title, resolved: isResolvedAt(key, SHOWN_AT) })),
  reference: reference?.title ?? '',
  attachments: bug.attachments ?? [],
  reproduction: {
    by: person(reproduction.by),
    when: formatMoment(reproduction.at),
    text: reproduction.text,
  },
  created: `Created by ${person(bug.reporter).name}, ${formatDate(bug.created)}.`,
  updated: lastChange ? `Updated by ${person(lastChange.by).name}, ${formatMoment(lastChange.at)}.` : '',
};

export const isKeyResolved = (key: string) => isResolvedAt(key, SHOWN_AT);

export interface HistoryEntry {
  who: string;
  what: string;
  when: string;
}

export const HISTORY_ENTRIES: HistoryEntry[] = HISTORY.filter(entry => entry.key === KEY && entry.at <= SHOWN_AT).map(
  entry => ({
    who: person(entry.by).name,
    what: entry.what,
    when: formatMoment(entry.at),
  }),
);

const historyAt = (what: string) => {
  const found = HISTORY.find(entry => entry.key === KEY && entry.what.startsWith(what));
  if (!found) throw new Error(`ACME-12 has no history entry starting "${what}"`);
  return found;
};

export interface WorkflowStep {
  title: string;
  body: string;
  record: string;
}

const firstSubtask = subtasks[0]?.key ?? '';
const firstDependency = dependencies[0] ?? '';

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    title: `${firstName(bug.reporter)} files the bug.`,
    body: `Only a title is required. Status, priority and type start at the project’s defaults, so ${firstName(bug.reporter)} writes the steps to reproduce in Markdown and raises the priority to ${bug.priority}.`,
    record: `${person(bug.reporter).name} created ${KEY} · ${bug.type} · ${statusOf(KEY, bug.created)} · ${bug.priority}`,
  },
  {
    title: `${firstName(DETAIL.assignee.handle)} takes it.`,
    body: `Assignee, estimate and due date saved together make one history entry. Being assigned makes ${firstName(DETAIL.assignee.handle)} a watcher, so new comments and status changes reach ${firstName(DETAIL.assignee.handle)}’s inbox.`,
    record: historyAt('Assignee:').what.replaceAll(', ', ' · '),
  },
  {
    title: 'It gets a subtask and a dependency.',
    body: `A parent for link puts ${firstSubtask} under it. A depends on link to ${firstDependency} shows on both issues, in both histories, and can never loop back on itself.`,
    record: `${KEY} parent for ${firstSubtask} · depends on ${firstDependency}`,
  },
  {
    title: 'The log goes on the issue.',
    body: 'Drop the file onto the editor or paste a screenshot. Files are private: a link opens only for someone signed in who can open the issue.',
    record: `${person(historyAt('attached').by).name} ${historyAt('attached').what}`,
  },
  {
    title: 'The reproduction is discussed in place.',
    body: `A comment mentions @${bug.reporter}, who is told in the inbox. ${firstDependency} typed in the text becomes a link, struck through once that issue is resolved.`,
    record: reproduction.text,
  },
  {
    title: 'It is resolved, with the record intact.',
    body: `Fixed is a done status, so the issue is marked resolved and the time recorded. ${firstName(bug.reporter)}, who filed it, hears that it was resolved.`,
    record: `${historyAt('Status: In Progress').what} · resolved ${formatMoment(SHOWN_AT)}`,
  },
];

export const DEFAULT_LISTS = [
  {
    list: 'Statuses',
    values: 'Submitted, Open, In Progress, Reopened, Can’t Reproduce, Duplicate, Fixed, Won’t fix, Obsolete, Closed',
  },
  { list: 'Priorities', values: 'Show-stopper, Critical, Major, Normal, Minor' },
  { list: 'Types', values: 'Bug, Feature, Task, Epic' },
];

export const SEVERITY_OPTIONS = ['Low', 'High', 'Critical'] as const;

export const SEVERITY_FIELD = [
  { term: 'Name', detail: 'Severity, renamed whenever you like' },
  { term: 'Slug', detail: 'severity, the name search uses; it never changes' },
  { term: 'Type', detail: 'Select, with Low, High and Critical' },
  { term: 'Applies to', detail: 'Bug only, so it never clutters an Epic' },
  { term: 'Required', detail: 'Yes, with High as the default' },
  { term: 'Empty label', detail: 'No Severity' },
];

const criticalBugs = OTHER_CRITICAL_BUGS.length + (SEVERITY_DEFAULT_VALUE === 'Critical' ? 1 : 0);
const subtasksDone = DETAIL.subtasks.filter(child => child.resolved).length;

export const CONNECTIONS = [
  {
    title: 'On the sprint board.',
    body: `Planned into ${DETAIL.sprint} with ${DETAIL.points} story points, ${KEY} is a card with its key, title, priority, people, points and subtask progress. On a board by status, moving the card changes its status.`,
    record: `${DETAIL.sprint} · ${KEY} · ${DETAIL.points} points · ${subtasksDone}/${DETAIL.subtasks.length} subtasks done`,
    href: '/features/sprints-kanban-boards',
    label: 'Sprints and boards',
  },
  {
    title: 'In the reports.',
    body: `Issues per field, grouped by Severity, counts ${KEY} under ${SEVERITY_DEFAULT_VALUE}. Click the bar and the issue list opens with exactly the issues it counted.`,
    record: `Issues per field · Severity · ${SEVERITY_DEFAULT_VALUE} ${criticalBugs}`,
    href: '/features/project-reports',
    label: 'Project reports',
  },
  {
    title: 'Beside the decision.',
    body: `The knowledge base article on invitation expiry mentions ${KEY}, so the issue lists it under Referenced by. Whoever picks the bug up finds the reasoning.`,
    record: `${articleUri(reference?.slug ?? '')} → ${KEY}`,
    href: '/features/project-knowledge-base',
    label: 'Knowledge base',
  },
  {
    title: 'In your agent.',
    body: 'Through MCP an agent reads, files and updates issues with the same keys, names and permission checks as the app, and every change is recorded under your name.',
    record: 'get_issue · search_issues · get_issue_activity',
    href: '/features/mcp-ai-agents',
    label: 'MCP and AI agents',
  },
];

export const ROLES = [
  {
    role: 'Observer',
    can: 'Reads the project’s issues, comments and files. Stars, watches and votes. Changes nothing.',
  },
  {
    role: 'Contributor',
    can: 'Creates and edits issues, comments, links, attaches files, logs time and sets custom field values.',
  },
  {
    role: 'Project Admin',
    can: 'Also deletes and restores issues, edits anyone’s comments and shapes the project’s lists and fields.',
  },
  { role: 'Org Admin', can: 'Project Admin on every project in the organisation, plus members and settings.' },
  { role: 'Org Owner', can: 'Everything an Org Admin can, plus transferring ownership.' },
];

export const ISSUE_TRACKING_FAQ: FaqEntry[] = [
  {
    question: 'Do we have to set up a workflow before filing the first bug?',
    answer: [
      'No. A new project starts with statuses, priorities and types you can use straight away, and a Project Admin edits them as lists. There are no transition rules: any status can follow any status. Moving an issue into a done or cancelled status marks it resolved.',
    ],
    link: { href: ISSUES_MANUAL_PATH, label: 'Statuses and resolution' },
  },
  {
    question: 'How do custom fields fit into search and export?',
    answer: [
      'Each field has a slug that search uses, such as severity: Critical. You can sort and group the issue list by it, add it as a column, count it in a report and include it in the CSV export. A project can have up to 50 active fields, in 13 types from text and dates to people and durations.',
    ],
    link: { href: CUSTOM_FIELDS_MANUAL_PATH, label: 'Custom fields' },
  },
  {
    question: 'What happens if someone deletes an issue by mistake?',
    answer: [
      'Only Project Admins can delete an issue, and they are asked to confirm. For 14 days it can be restored from the Undo that follows or from the project’s list of deleted issues. After that it is removed for good with its comments, time entries, attachments and history.',
    ],
  },
  {
    question: 'Can we bring our existing issues across?',
    answer: [
      'Issues export to CSV today, with the columns you choose. Generic CSV import arrives at launch. There is no native importer from another tracker; an agent connected to both trackers can help carry issues across, with you reviewing how people and fields map.',
    ],
    link: { href: '/features/mcp-ai-agents', label: 'Moving with an agent' },
  },
  {
    question: 'Who can open the files attached to an issue?',
    answer: [
      'Only people signed in who can open the issue. A file link pasted into a chat does not open for anyone else, and stops working for someone who loses access. A file can be up to 100 MB, and an issue can hold 50.',
    ],
  },
  {
    question: 'What happens to issues when someone leaves?',
    answer: [
      'Everything they did keeps their real name and picture, with a small Former member label. You can still search for their work, but they are no longer offered when you assign or mention someone.',
    ],
  },
];

import {
  ARTICLES,
  assigneesOf,
  backlogAt,
  comment,
  dependsOnOf,
  formatDate,
  formatDayMonth,
  formatDuration,
  formatMoment,
  HISTORY,
  isResolvedAt,
  issue,
  ISSUES,
  issuesInSprint,
  minutesFor,
  person,
  pointsOf,
  resolvedAt,
  sprint,
  sprintOf,
  statusOf,
  sumPoints,
  type Moment,
  type Status,
} from '@data/sample';
import type { FaqEntry } from '@lib/faq';
import { TOOL_REFERENCE_PATH } from '@lib/mcp';

export const ISSUES_FEATURE_PATH = '/features/issue-tracking';
export const SPRINTS_FEATURE_PATH = '/features/sprints-kanban-boards';
export const MCP_FEATURE_PATH = '/features/mcp-ai-agents';
export const REPORTS_FEATURE_PATH = '/features/project-reports';
export const KB_FEATURE_PATH = '/features/project-knowledge-base';
export const PRICING_PATH = '/pricing';
export const SHORTCUTS_MANUAL_PATH = '/docs/keyboard-shortcuts';
export const PERMISSIONS_PATH = '/docs/permissions';
export { TOOL_REFERENCE_PATH };

export const STANDUP_PROMPT = '/mcp__nothingleft__standup-summary';

const KEY = 'ACME-12';
const bug = issue(KEY);
const reporter = person(bug.reporter);
const SPRINT_NAME = 'Sprint 08';

const historyAt = (what: string) => {
  const found = HISTORY.find(entry => entry.key === KEY && entry.what.startsWith(what));
  if (!found) throw new Error(`${KEY} has no history entry starting "${what}"`);
  return found;
};

const assigned = historyAt('Assignee:');
const planned = historyAt('Sprint:');
const linked = historyAt('linked: depends on');
const started = historyAt('Status: Open');
const firstLog = historyAt('logged 20m');
const fixed = resolvedAt(KEY) ?? '';
const reproduction = comment(KEY, 'alex', started.at.slice(0, 10));
const decision = ARTICLES.find(candidate => candidate.references.includes(KEY));
const developer = person(assigneesOf(KEY, assigned.at)[0]?.handle ?? 'alex');

// The lead triages a few minutes before planning.
const TRIAGED_AT: Moment = '2026-10-03 10:05';
// The standup is the morning after the fix.
const STANDUP_AT: Moment = '2026-10-09 09:10';

const row = (key: string, at: Moment) => ({
  key,
  title: issue(key).title,
  priority: issue(key).priority,
  points: pointsOf(key, at),
  status: statusOf(key, at),
});

const unassignedBugs = ISSUES.filter(
  candidate =>
    candidate.type === 'Bug' &&
    candidate.created <= TRIAGED_AT &&
    !isResolvedAt(candidate.key, TRIAGED_AT) &&
    assigneesOf(candidate.key, TRIAGED_AT).length === 0,
)
  .map(candidate => row(candidate.key, TRIAGED_AT))
  .reverse();

const plannedIssues = issuesInSprint(SPRINT_NAME, planned.at);
const backlogBugs = backlogAt(planned.at).filter(candidate =>
  unassignedBugs.some(bugRow => bugRow.key === candidate.key),
);
const backlogSize = backlogAt(planned.at).length;

const boardAt = fixed;
const board = (['Open', 'In Progress', 'Fixed'] as Status[]).map(status => ({
  status,
  cards: issuesInSprint(SPRINT_NAME, boardAt)
    .filter(candidate => {
      const now = statusOf(candidate.key, boardAt);
      return status === 'Open' ? now === 'Open' || now === 'Reopened' : now === status;
    })
    .map(candidate => row(candidate.key, boardAt)),
}));

const dependencies = dependsOnOf(KEY, STANDUP_AT).map(key => ({
  key,
  title: issue(key).title,
  status: statusOf(key, STANDUP_AT),
}));
const dayBefore = (at: Moment) =>
  new Date(Date.parse(`${at.slice(0, 10)}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
const standupHandle = developer.handle;
const loggedYesterday = minutesFor({ author: standupHandle, date: dayBefore(STANDUP_AT) });
const inProgress = ISSUES.filter(
  candidate =>
    candidate.key !== KEY &&
    statusOf(candidate.key, STANDUP_AT) === 'In Progress' &&
    assigneesOf(candidate.key, STANDUP_AT).some(who => who.handle === standupHandle),
).map(candidate => row(candidate.key, STANDUP_AT));

const spentAt = (at: Moment) =>
  HISTORY.filter(entry => entry.key === KEY && entry.at <= at && entry.what.startsWith('logged ')).reduce(
    (total, entry) =>
      total + Number(entry.what.match(/(\d+)h/)?.[1] ?? 0) * 60 + Number(entry.what.match(/(\d+)m/)?.[1] ?? 0),
    0,
  );

export const STORY = {
  key: KEY,
  title: bug.title,
  type: bug.type,
  priority: bug.priority,
  reporter,
  developer,
  estimate: formatDuration(bug.estimate ?? 0),
  due: formatDate(bug.due ?? ''),
  points: pointsOf(KEY),
  sprint: SPRINT_NAME,
  sprintGoal: sprint(SPRINT_NAME).goal ?? '',
  sprintEnds: formatDate(sprint(SPRINT_NAME).end),
  decision: decision?.title ?? '',
  report: {
    when: formatMoment(bug.created),
    day: formatDate(bug.created),
    status: statusOf(KEY, bug.created),
    sprint: sprintOf(KEY, bug.created),
    points: pointsOf(KEY, bug.created),
  },
  triage: {
    when: formatMoment(TRIAGED_AT),
    query: 'type: Bug #Unresolved assignee: Unassigned',
    rows: unassignedBugs,
  },
  plan: {
    when: formatMoment(planned.at),
    shown: plannedIssues.slice(0, 3).map(candidate => row(candidate.key, planned.at)),
    more: plannedIssues.length - 3,
    issues: plannedIssues.length,
    points: sumPoints(plannedIssues, planned.at),
    backlog: backlogBugs.map(candidate => row(candidate.key, planned.at)),
    backlogMore: backlogSize - backlogBugs.length,
    moved: `${person(planned.by).name} moved ${KEY} into ${SPRINT_NAME}, Story points: ${pointsOf(KEY, planned.at)}`,
    assigned: `${person(assigned.by).name} set ${assigned.what}`,
    day: formatDate(planned.at),
  },
  develop: {
    days: `${formatDayMonth(linked.at).replace(/ \w+$/, '')}–${formatDate(started.at)}`,
    dependency: {
      key: dependsOnOf(KEY, started.at)[0] ?? '',
      title: issue(dependsOnOf(KEY, started.at)[0] ?? KEY).title,
    },
    comment: { by: person(reproduction.by), when: formatMoment(reproduction.at), text: reproduction.text },
    status: statusOf(KEY, reproduction.at),
    spent: formatDuration(spentAt(reproduction.at)),
    spentShare: Math.round((spentAt(reproduction.at) / (bug.estimate ?? 1)) * 100),
    activity: [linked, started, firstLog].map(entry => ({
      text: `${person(entry.by).name} ${entry.what.replace(/^linked: /, 'linked: ').replace(/^Status: /, 'changed Status: ')}`,
      day: formatDate(entry.at),
    })),
  },
  board: {
    iso: boardAt.slice(0, 10),
    when: formatMoment(boardAt),
    columns: board,
    activity: [historyAt('Status: In Progress'), historyAt('logged 1h')].map(entry => ({
      text: `${person(entry.by).name} ${entry.what.replace(/^Status: /, 'changed Status: ')}`,
      day: formatDate(entry.at),
    })),
  },
  standup: {
    when: formatMoment(STANDUP_AT),
    status: statusOf(KEY, STANDUP_AT),
    resolved: formatMoment(fixed),
    spent: formatDuration(spentAt(STANDUP_AT)),
    dependencies,
    inProgress,
    logged: formatDuration(loggedYesterday),
  },
  trail: [
    { when: formatDayMonth(bug.created), what: 'Reported' },
    { when: formatDayMonth(TRIAGED_AT), what: 'Triaged' },
    { when: formatDayMonth(planned.at), what: `In ${SPRINT_NAME}` },
    { when: formatDayMonth(reproduction.at), what: 'Reproduced' },
    { when: formatDayMonth(fixed), what: 'Fixed' },
    { when: formatDayMonth(STANDUP_AT), what: 'In the standup' },
  ],
};

export interface WorkflowStep {
  id: string;
  title: string;
  who: string;
  body: string;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'report',
    title: 'Report the bug',
    who: 'Casey Kim',
    body: `${reporter.name.split(' ')[0]} presses c, writes the steps in Markdown and sets ${bug.priority}.`,
  },
  {
    id: 'triage',
    title: 'Triage with the query bar',
    who: 'Casey Kim, lead',
    body: 'One query lists every unassigned bug still open.',
  },
  {
    id: 'plan',
    title: 'Plan it and assign it',
    who: 'Casey Kim, lead',
    body: `Into ${SPRINT_NAME} with ${pointsOf(KEY)} points, owned by ${developer.name.split(' ')[0]}, due ${formatDayMonth(bug.due ?? '')}.`,
  },
  {
    id: 'develop',
    title: 'Link, reproduce, log time',
    who: 'Alex Lee, developer',
    body: `A dependency on ${dependsOnOf(KEY)[0]}, a reproduction note and ${minutesFor({ issue: KEY, date: started.at.slice(0, 10) })} minutes.`,
  },
  {
    id: 'board',
    title: 'Move it on the board',
    who: 'Alex Lee, developer',
    body: 'The card goes to Fixed and the status follows it.',
  },
  {
    id: 'agent',
    title: 'Ask the agent for a standup',
    who: 'Alex’s agent, as @alex',
    body: 'It reads ACME-12 and drafts the standup with documented tools.',
  },
];

export interface Shortcut {
  keys: string[];
  join?: 'then' | 'or' | 'chord';
  action: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: ['c'], action: 'Create an issue' },
  { keys: ['/'], action: 'Focus search, Tab to complete, ↵ to run' },
  { keys: ['g', 'i'], join: 'then', action: 'Go to the project’s issues' },
  { keys: ['g', 'b'], join: 'then', action: 'Go to the board' },
  { keys: ['a', 's'], join: 'or', action: 'Assignee or status picker on an issue' },
  { keys: ['⌘', '↵'], join: 'chord', action: 'Submit the comment (Ctrl ↵ elsewhere)' },
  { keys: ['Space'], action: 'Pick up a card or backlog row, arrows to move' },
  { keys: ['?'], action: 'Every shortcut, on any page' },
];

export const READABLE_NAMES = [
  { name: 'ACME-12', detail: 'Issue keys count up from 1 and never skip; acme-12 finds it too.' },
  { name: '@alex', detail: 'People by username, in comments, queries and agent calls.' },
  { name: 'In Progress', detail: 'Statuses, priorities and sprints by name, not by ID.' },
];

export const ROLES = [
  { role: 'Observer', can: 'Reads issues, boards and articles. Changes nothing.' },
  { role: 'Contributor', can: 'Files, edits, links, comments, logs time and moves issues into sprints.' },
  { role: 'Project Admin', can: 'Also plans, starts and finishes sprints and shapes boards, statuses and fields.' },
  { role: 'Org Admin', can: 'Project Admin on every project, plus people and settings.' },
  { role: 'Org Owner', can: 'Everything an Org Admin can, plus transferring ownership.' },
];

export const SCOPES = [
  { scope: 'issues:read', lets: 'Read projects, issues, members, and search' },
  { scope: 'issues:write', lets: 'Create and change issues, tags, links, files and shared saved views' },
  { scope: 'comments:write', lets: 'Comment' },
  { scope: 'time:write', lets: 'Log time' },
];

export const FITS = [
  'Engineering teams that file bugs, plan sprints and follow a board in one project or several.',
  'Developers who would rather press s than hunt for a status menu, and say ACME-12 instead of pasting a link.',
  'Teams that want an AI agent to read and update the tracker as the person who connected it, and no further.',
];

export const NOT_BUILT = [
  'Source-control status. Issues show no pull-request or branch badges, and commits do not change an issue.',
  'Deployment data. Nothing reports what is released where; Fixed means someone set it to Fixed.',
  'Automatic updates from Git. Cards move when a person moves them, or their agent does as them.',
];

export const ENGINEERING_TEAMS_FAQ: FaqEntry[] = [
  {
    question: 'Does it connect to our Git repository?',
    answer: [
      'Not today. Pull-request and deployment status on issues, and status changes from commits, are not built. Signing in with GitHub is only a way to sign in. An agent that works in your repository can still read an issue and update it for you, as you, through the MCP tools.',
    ],
  },
  {
    question: 'Can an agent change issues without anyone knowing?',
    answer: [
      'No. An agent connects with a personal access token, acts as the person who created it and can never do more than their role allows; the token’s scopes can narrow that further. Every change it makes is in the activity log under that person’s name. Deleting something, or changing roles and access, stops and asks the person in their agent app first.',
    ],
    link: { href: TOOL_REFERENCE_PATH, label: 'MCP tool reference' },
  },
  {
    question: 'Do we have to design a workflow and roles before the first sprint?',
    answer: [
      'No. A new project starts with statuses, priorities and types, and there are no transition rules: any status can follow any status. There are five built-in roles and no permission schemes to maintain. A Project Admin edits the lists when the team needs to.',
    ],
    link: { href: PERMISSIONS_PATH, label: 'Permissions' },
  },
  {
    question: 'Can developers work without the mouse?',
    answer: [
      'Mostly. c creates an issue, / focuses search, g then b opens the board, a and s open the assignee and status pickers on an issue, and ⌘ ↵ or Ctrl ↵ submits a comment. On the board and the backlog, Space picks up a card, the arrow keys move it and Space drops it. Press ? on any page for the full list.',
    ],
    link: { href: SHORTCUTS_MANUAL_PATH, label: 'Keyboard shortcuts' },
  },
  {
    question: 'What does the standup summary read, and does it change anything?',
    answer: [
      'It searches the issues you updated since yesterday and the ones still assigned to you, reads their history for status moves, comments and time, and lists your unread mentions, assignments and due dates. It changes nothing and marks nothing read, so a token with issues:read is enough.',
    ],
    link: { href: MCP_FEATURE_PATH, label: 'MCP and AI agents' },
  },
  {
    question: 'What does it cost an engineering team?',
    answer: [
      'Nothing during beta, for any team size. The first 20 members of every organisation stay free once billing exists. We will give notice before charging for seats beyond that; nothing is priced today.',
    ],
    link: { href: PRICING_PATH, label: 'Pricing' },
  },
];

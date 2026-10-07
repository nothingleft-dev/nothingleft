import type { FaqEntry } from '@lib/faq';

export const TIME_MANUAL_PATH = '/docs/manual/issues#time-tracking';
export const TIMESHEET_MANUAL_PATH = '/docs/manual/reports#timesheet';

// Acme keeps the default working calendar: 1d is 8h and 1w is five days.
const WORKDAY_MINUTES = 480;
const WORKWEEK_DAYS = 5;

export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '−' : '';
  let rest = Math.abs(minutes);
  if (rest === 0) return '0m';
  const parts: string[] = [];
  for (const [size, unit] of [
    [WORKDAY_MINUTES * WORKWEEK_DAYS, 'w'],
    [WORKDAY_MINUTES, 'd'],
    [60, 'h'],
    [1, 'm'],
  ] as const) {
    const count = Math.floor(rest / size);
    if (count > 0) parts.push(`${count}${unit}`);
    rest -= count * size;
  }
  return sign + parts.join(' ');
}

export type PersonId = 'alex' | 'casey' | 'sam';

export interface Person {
  id: PersonId;
  name: string;
  initials: string;
}

export const PEOPLE: Person[] = [
  { id: 'alex', name: 'Alex Lee', initials: 'AL' },
  { id: 'casey', name: 'Casey Kim', initials: 'CK' },
  { id: 'sam', name: 'Sam Ortiz', initials: 'SO' },
];

export function person(id: PersonId): Person {
  const found = PEOPLE.find(candidate => candidate.id === id);
  if (!found) throw new Error(`Unknown person ${id}`);
  return found;
}

export interface Day {
  date: string;
  weekday: string;
  short: string;
  long: string;
  working: boolean;
}

export const DAYS: Day[] = [
  { date: '2026-10-05', weekday: 'Mon', short: '5', long: '5 Oct 2026', working: true },
  { date: '2026-10-06', weekday: 'Tue', short: '6', long: '6 Oct 2026', working: true },
  { date: '2026-10-07', weekday: 'Wed', short: '7', long: '7 Oct 2026', working: true },
  { date: '2026-10-08', weekday: 'Thu', short: '8', long: '8 Oct 2026', working: true },
  { date: '2026-10-09', weekday: 'Fri', short: '9', long: '9 Oct 2026', working: true },
  { date: '2026-10-10', weekday: 'Sat', short: '10', long: '10 Oct 2026', working: false },
  { date: '2026-10-11', weekday: 'Sun', short: '11', long: '11 Oct 2026', working: false },
];

export const PERIOD_LABEL = '5–11 Oct 2026';

export function day(date: string): Day {
  const found = DAYS.find(candidate => candidate.date === date);
  if (!found) throw new Error(`Unknown day ${date}`);
  return found;
}

export type IssueType = 'Bug' | 'Task' | 'Epic';

export interface Issue {
  key: string;
  title: string;
  type: IssueType;
  estimate: number;
  parent?: string;
}

export const EPIC_KEY = 'ACME-3';

export const ISSUES: Issue[] = [
  { key: 'ACME-3', title: 'Make invitations clearer', type: 'Epic', estimate: 960 },
  { key: 'ACME-10', title: 'Invite landing shows the inviter', type: 'Task', estimate: 300, parent: EPIC_KEY },
  { key: 'ACME-15', title: 'Resend invite from the members list', type: 'Task', estimate: 360, parent: EPIC_KEY },
  { key: 'ACME-12', title: 'Invite link blank after it expires', type: 'Bug', estimate: 120, parent: EPIC_KEY },
  { key: 'ACME-14', title: 'Invite email subject names the org', type: 'Task', estimate: 60, parent: EPIC_KEY },
  { key: 'ACME-11', title: 'Swimlane header overlaps count', type: 'Bug', estimate: 120 },
  { key: 'ACME-8', title: 'Saved view count is stale', type: 'Bug', estimate: 60 },
];

export function issue(key: string): Issue {
  const found = ISSUES.find(candidate => candidate.key === key);
  if (!found) throw new Error(`Unknown issue ${key}`);
  return found;
}

export interface TimeEntry {
  author: PersonId;
  date: string;
  issue: string;
  minutes: number;
  workType: string;
  loggedBy?: PersonId;
}

// Every logged minute on the page. All other figures are sums of these, so they cannot disagree.
export const ENTRIES: TimeEntry[] = [
  { author: 'alex', date: '2026-10-05', issue: 'ACME-10', minutes: 90, workType: 'Development' },
  { author: 'alex', date: '2026-10-06', issue: 'ACME-10', minutes: 90, workType: 'Development' },
  { author: 'alex', date: '2026-10-06', issue: 'ACME-12', minutes: 20, workType: 'Development' },
  { author: 'alex', date: '2026-10-07', issue: 'ACME-10', minutes: 45, workType: 'Testing' },
  { author: 'alex', date: '2026-10-08', issue: 'ACME-12', minutes: 85, workType: 'Development' },
  { author: 'alex', date: '2026-10-09', issue: 'ACME-15', minutes: 60, workType: 'Investigation' },
  { author: 'casey', date: '2026-10-05', issue: 'ACME-11', minutes: 60, workType: 'Development' },
  { author: 'casey', date: '2026-10-06', issue: 'ACME-11', minutes: 30, workType: 'Testing' },
  { author: 'casey', date: '2026-10-07', issue: 'ACME-14', minutes: 60, workType: 'Development' },
  { author: 'casey', date: '2026-10-08', issue: 'ACME-14', minutes: 30, workType: 'Testing' },
  { author: 'sam', date: '2026-10-05', issue: 'ACME-8', minutes: 45, workType: 'Investigation' },
  { author: 'sam', date: '2026-10-07', issue: 'ACME-15', minutes: 120, workType: 'Development', loggedBy: 'casey' },
  { author: 'sam', date: '2026-10-08', issue: 'ACME-15', minutes: 75, workType: 'Development' },
  { author: 'sam', date: '2026-10-09', issue: 'ACME-10', minutes: 30, workType: 'Testing' },
];

const sum = (entries: TimeEntry[]) => entries.reduce((total, entry) => total + entry.minutes, 0);

export function cellEntries(author: PersonId, date: string): TimeEntry[] {
  return ENTRIES.filter(entry => entry.author === author && entry.date === date);
}

export function personEntries(author: PersonId): TimeEntry[] {
  return ENTRIES.filter(entry => entry.author === author);
}

export const cellTotal = (author: PersonId, date: string) => sum(cellEntries(author, date));
export const personTotal = (author: PersonId) => sum(personEntries(author));
export const dayTotal = (date: string) => sum(ENTRIES.filter(entry => entry.date === date));
export const weekTotal = () => sum(ENTRIES);

export function issueEntries(key: string): TimeEntry[] {
  return ENTRIES.filter(entry => entry.issue === key);
}

export function subtaskKeys(key: string): string[] {
  return ISSUES.filter(candidate => candidate.parent === key).map(candidate => candidate.key);
}

// An issue's spent time is its own entries plus its whole subtree's.
export function issueSpent(key: string): number {
  return sum(issueEntries(key)) + subtaskKeys(key).reduce((total, child) => total + issueSpent(child), 0);
}

export interface ReportRow {
  issue: Issue;
  spent: number;
  difference: number;
}

// The time report adds up entries by the issue they were logged on, so a parent never gets a row for its subtasks' time.
export function timeReportByIssue(): ReportRow[] {
  return ISSUES.map(candidate => ({ issue: candidate, entries: issueEntries(candidate.key) }))
    .filter(row => row.entries.length > 0)
    .map(row => {
      const spent = sum(row.entries);
      return { issue: row.issue, spent, difference: row.issue.estimate - spent };
    })
    .sort((a, b) => b.spent - a.spent);
}

export function cellId(author: PersonId, date: string): string {
  return `ts-${author}-${date}`;
}

export const TIME_TRACKING_FAQ: FaqEntry[] = [
  {
    question: 'Is there a running timer?',
    answer: [
      'No. You enter the time you spent, on one date or across a date range, written the way you would say it: 2h, 1h 30m, 1d. A range writes one record per working day, and each record can be changed or deleted on its own.',
    ],
    link: { href: TIME_MANUAL_PATH, label: 'Time tracking in the manual' },
  },
  {
    question: 'Can someone log time for a colleague?',
    answer: [
      'Project Admins and organisation admins can, by choosing the colleague as the author. Anyone who could log their own time in the project can be chosen, never an Observer. The record shows who logged it, and it belongs to its author, who can edit or delete it like their own.',
    ],
    link: { href: '/docs/permissions', label: 'Permissions' },
  },
  {
    question: 'Does a parent issue count its subtasks’ time twice?',
    answer: [
      'No. A parent’s spent time includes everything logged on its subtasks, so an epic shows the whole effort beneath it. The time report adds up the entries themselves, so a subtask’s time is never counted again through its parent. Deleting a subtask takes its time off the parent, and restoring it brings the time back.',
    ],
  },
  {
    question: 'Can we turn time tracking off for one project?',
    answer: [
      'Yes. It is a setting on each project, and a Project Admin can switch it off. Estimation and Spent time then disappear from that project’s issues and nobody can log time there. Nothing is deleted: turn it back on and every record is where it was.',
    ],
  },
  {
    question: 'What does 1d mean in a total?',
    answer: [
      'A day and a week follow your organisation’s working calendar. With an 8-hour working day, 1d 3h 45m is 11h 45m. The time report and its CSV export use the same units, and totals close the file.',
    ],
    link: { href: '/features/project-reports', label: 'Reports' },
  },
  {
    question: 'Can an AI agent log or read time?',
    answer: [
      'Yes, through the MCP server. An agent logs time on an issue key with a duration, a date or range, a work type and a note, and its token needs the time:write scope. It reads timesheets and the time report as the same table the chart is drawn from.',
    ],
    link: { href: '/features/mcp-ai-agents', label: 'MCP and AI agents' },
  },
];

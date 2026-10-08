import {
  datesBetween,
  entriesFor,
  formatDate,
  formatDuration,
  isWorkingDay,
  issue as sampleIssue,
  minutesFor,
  PEOPLE as SAMPLE_PEOPLE,
  person as samplePerson,
  spentOn,
  subtasksOf,
  TIME_ENTRIES,
  TIME_WEEK,
  weekday,
  type Handle,
  type Issue,
  type TimeEntry,
} from '@data/sample';
import type { FaqEntry } from '@lib/faq';

export const TIME_MANUAL_PATH = '/docs/issues#time-tracking';
export const TIMESHEET_MANUAL_PATH = '/docs/reports#timesheet';

export { formatDuration };

export type PersonId = Handle;

export interface Person {
  id: PersonId;
  name: string;
  initials: string;
}

// The people with time in the week, in the sample's order.
export const PEOPLE: Person[] = SAMPLE_PEOPLE.filter(who => minutesFor({ author: who.handle }) > 0).map(who => ({
  id: who.handle,
  name: who.name,
  initials: who.initials,
}));

export function person(id: PersonId): Person {
  const found = samplePerson(id);
  return { id: found.handle, name: found.name, initials: found.initials };
}

export interface Day {
  date: string;
  weekday: string;
  short: string;
  long: string;
  working: boolean;
}

export const DAYS: Day[] = datesBetween(TIME_WEEK.start, TIME_WEEK.end).map(date => ({
  date,
  weekday: weekday(date),
  short: String(Number(date.slice(8))),
  long: formatDate(date),
  working: isWorkingDay(date),
}));

export const PERIOD_LABEL = TIME_WEEK.label;

export function day(date: string): Day {
  const found = DAYS.find(candidate => candidate.date === date);
  if (!found) throw new Error(`Unknown day ${date}`);
  return found;
}

export type IssueType = Issue['type'];

export interface TimedIssue {
  key: string;
  title: string;
  type: IssueType;
  estimate: number;
}

export const EPIC_KEY = 'ACME-3';

export function issue(key: string): TimedIssue {
  const found = sampleIssue(key);
  return { key: found.key, title: found.title, type: found.type, estimate: found.estimate ?? 0 };
}

export type { TimeEntry };

export const ENTRIES: TimeEntry[] = TIME_ENTRIES;

export const cellEntries = (author: PersonId, date: string) => entriesFor({ author, date });
export const personEntries = (author: PersonId) => entriesFor({ author });
export const cellTotal = (author: PersonId, date: string) => minutesFor({ author, date });
export const personTotal = (author: PersonId) => minutesFor({ author });
export const dayTotal = (date: string) => minutesFor({ date });
export const weekTotal = () => minutesFor({});
export const issueEntries = (key: string) => entriesFor({ issue: key });
export const subtaskKeys = (key: string) => subtasksOf(key).map(child => child.key);
export const issueSpent = (key: string) => spentOn(key);

export interface ReportRow {
  issue: TimedIssue;
  spent: number;
  difference: number;
}

// The time report adds up entries by the issue they were logged on, so a parent never gets a row for its subtasks' time.
export function timeReportByIssue(): ReportRow[] {
  return [...new Set(ENTRIES.map(entry => entry.issue))]
    .map(key => {
      const spent = minutesFor({ issue: key });
      const row = issue(key);
      return { issue: row, spent, difference: row.estimate - spent };
    })
    .sort((a, b) => b.spent - a.spent || epicFirst(a.issue.key) - epicFirst(b.issue.key));
}

const epicFirst = (key: string) => (subtaskKeys(EPIC_KEY).includes(key) ? 0 : 1);

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

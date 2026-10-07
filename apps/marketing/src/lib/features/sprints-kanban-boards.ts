import type { FaqEntry } from '@lib/faq';

export const AGILE_MANUAL_PATH = '/docs/manual/agile';
export const REPORTS_MANUAL_PATH = '/docs/manual/reports';
export const REPORTS_FEATURE_PATH = '/features/project-reports';

export interface Person {
  name: string;
  initials: string;
}

const ALEX: Person = { name: 'Alex Lee', initials: 'AL' };
const CASEY: Person = { name: 'Casey Kim', initials: 'CK' };
const SAM: Person = { name: 'Sam Ortiz', initials: 'SO' };

export const PEOPLE: Person[] = [ALEX, CASEY, SAM];

export type ColumnId = 'open' | 'in-progress' | 'fixed';
export type IssueType = 'Bug' | 'Feature' | 'Task';
export type Priority = 'Critical' | 'Major' | 'Normal';

export interface BoardColumn {
  id: ColumnId;
  name: string;
  resolved: boolean;
  wipMax?: number;
}

export const COLUMNS: BoardColumn[] = [
  { id: 'open', name: 'Open', resolved: false },
  { id: 'in-progress', name: 'In Progress', resolved: false, wipMax: 2 },
  { id: 'fixed', name: 'Fixed', resolved: true },
];

export const TYPES: IssueType[] = ['Bug', 'Feature', 'Task'];
export const PRIORITIES: Priority[] = ['Critical', 'Major', 'Normal'];

export interface SprintIssue {
  key: string;
  title: string;
  points: number;
  type: IssueType;
  priority: Priority;
  assignee: Person;
  column: ColumnId;
}

export const SPRINT = {
  name: 'Sprint 08',
  goal: 'Make invitations clearer',
  dates: '5 Oct – 17 Oct 2026',
  daysLeft: 10,
  today: '7 Oct 2026',
};

export const SPRINT_ISSUES: SprintIssue[] = [
  {
    key: 'ACME-12',
    title: 'Invite link blank after it expires',
    points: 3,
    type: 'Bug',
    priority: 'Major',
    assignee: ALEX,
    column: 'open',
  },
  {
    key: 'ACME-13',
    title: 'Pending invites sorted by date sent',
    points: 2,
    type: 'Task',
    priority: 'Normal',
    assignee: CASEY,
    column: 'open',
  },
  {
    key: 'ACME-14',
    title: 'Invite email subject names the org',
    points: 2,
    type: 'Task',
    priority: 'Normal',
    assignee: CASEY,
    column: 'open',
  },
  {
    key: 'ACME-15',
    title: 'Resend invite from the members list',
    points: 1,
    type: 'Feature',
    priority: 'Normal',
    assignee: ALEX,
    column: 'open',
  },
  {
    key: 'ACME-11',
    title: 'Swimlane header overlaps count',
    points: 5,
    type: 'Bug',
    priority: 'Normal',
    assignee: SAM,
    column: 'in-progress',
  },
  {
    key: 'ACME-10',
    title: 'Invite landing shows the inviter',
    points: 3,
    type: 'Feature',
    priority: 'Normal',
    assignee: SAM,
    column: 'in-progress',
  },
  {
    key: 'ACME-6',
    title: 'Project-scoped invite links',
    points: 8,
    type: 'Feature',
    priority: 'Major',
    assignee: ALEX,
    column: 'fixed',
  },
  {
    key: 'ACME-5',
    title: 'Accept invite while signed in',
    points: 5,
    type: 'Feature',
    priority: 'Critical',
    assignee: CASEY,
    column: 'fixed',
  },
  {
    key: 'ACME-4',
    title: 'Invite expiry setting per org',
    points: 3,
    type: 'Task',
    priority: 'Normal',
    assignee: SAM,
    column: 'fixed',
  },
  {
    key: 'ACME-9',
    title: 'Expiry date in the invite email',
    points: 2,
    type: 'Task',
    priority: 'Normal',
    assignee: ALEX,
    column: 'fixed',
  },
];

export const TOTAL_POINTS = SPRINT_ISSUES.reduce((sum, issue) => sum + issue.points, 0);

export const LIFECYCLE = [
  {
    state: 'Planned',
    sprint: 'Sprint 09',
    dates: '19 Oct – 30 Oct 2026',
    note: '4 issues, 11 points. Waiting for its start.',
  },
  {
    state: 'Active',
    sprint: 'Sprint 08',
    dates: SPRINT.dates,
    note: `${SPRINT.daysLeft} days left. One active sprint per project.`,
  },
  {
    state: 'Completed',
    sprint: 'Sprint 07',
    dates: '21 Sep – 2 Oct 2026',
    note: '27 of 30 points resolved. ACME-10 moved on to Sprint 08.',
  },
];

export interface BacklogRow {
  key: string;
  title: string;
  points: number | null;
  type: IssueType;
}

export const PLANNED_SPRINT_ROWS: BacklogRow[] = [
  { key: 'ACME-16', title: 'Reminder email before an invite expires', points: 3, type: 'Feature' },
  { key: 'ACME-17', title: 'Show who invited each member', points: 2, type: 'Feature' },
  { key: 'ACME-18', title: 'Revoke a pending invitation', points: 5, type: 'Feature' },
  { key: 'ACME-19', title: 'Invite form explains each role', points: 1, type: 'Task' },
];

export const BACKLOG_ROWS: BacklogRow[] = [
  { key: 'ACME-20', title: 'Members list stops at 50 people', points: 3, type: 'Bug' },
  { key: 'ACME-21', title: 'Avatar initials clash for similar names', points: 2, type: 'Bug' },
  { key: 'ACME-22', title: 'Remember the last board filter', points: null, type: 'Feature' },
  { key: 'ACME-23', title: 'Due date picker starts on Monday', points: 1, type: 'Task' },
];

export const BACKLOG_TOTAL = { issues: 9, points: 14 };

export type MoveId = 'start' | 'fix';

export interface DemoMove {
  id: MoveId;
  key: string;
  to: ColumnId;
}

export const DEMO_MOVES: DemoMove[] = [
  { id: 'start', key: 'ACME-12', to: 'in-progress' },
  { id: 'fix', key: 'ACME-10', to: 'fixed' },
];

export type DestinationId = 'backlog' | 'sprint-09';

export interface Destination {
  id: DestinationId;
  name: string;
  detail: string;
  issues: number;
  points: number;
}

export const DESTINATIONS: Destination[] = [
  { id: 'backlog', name: 'Backlog', detail: 'Issues in no sprint', ...BACKLOG_TOTAL },
  { id: 'sprint-09', name: 'Sprint 09', detail: 'Planned, 19 Oct – 30 Oct 2026', issues: 4, points: 11 },
];

export interface DemoState {
  moved: Record<MoveId, boolean>;
  destination: DestinationId | null;
  finished: boolean;
}

export const INITIAL_STATE: DemoState = { moved: { start: false, fix: false }, destination: null, finished: false };
export const FINISHED_STATE: DemoState = {
  moved: { start: true, fix: true },
  destination: 'sprint-09',
  finished: true,
};

export function columnOf(issue: SprintIssue, state: DemoState): ColumnId {
  const move = DEMO_MOVES.find(candidate => candidate.key === issue.key);
  return move && state.moved[move.id] ? move.to : issue.column;
}

export function columnName(id: ColumnId): string {
  return COLUMNS.find(column => column.id === id)?.name ?? id;
}

export function isResolvedColumn(id: ColumnId): boolean {
  return COLUMNS.find(column => column.id === id)?.resolved ?? false;
}

// The positions a card can occupy during the demo; the board renders one copy per position.
export function cardPositions(issue: SprintIssue): ColumnId[] {
  const move = DEMO_MOVES.find(candidate => candidate.key === issue.key);
  return move ? [issue.column, move.to] : [issue.column];
}

export function isCardShown(issue: SprintIssue, column: ColumnId, state: DemoState): boolean {
  if (columnOf(issue, state) !== column) return false;
  return !(state.finished && !isResolvedColumn(column));
}

export interface Tally {
  count: number;
  points: number;
}

export interface BoardTally {
  columns: Record<ColumnId, Tally>;
  resolvedPoints: number;
  unfinished: Tally & { keys: string[] };
}

export function tallyBoard(state: DemoState): BoardTally {
  const columns: Record<ColumnId, Tally> = {
    open: { count: 0, points: 0 },
    'in-progress': { count: 0, points: 0 },
    fixed: { count: 0, points: 0 },
  };
  const unfinished = { count: 0, points: 0, keys: [] as string[] };
  for (const issue of SPRINT_ISSUES) {
    const column = columnOf(issue, state);
    if (!isResolvedColumn(column)) {
      unfinished.count += 1;
      unfinished.points += issue.points;
      unfinished.keys.push(issue.key);
    }
    if (!isCardShown(issue, column, state)) continue;
    columns[column].count += 1;
    columns[column].points += issue.points;
  }
  return { columns, resolvedPoints: columns.fixed.points, unfinished };
}

export function isOverLimit(column: BoardColumn, tally: Tally): boolean {
  return column.wipMax !== undefined && tally.count > column.wipMax;
}

export const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;
export const formatTally = (tally: Tally) => `${plural(tally.count, 'issue')}, ${plural(tally.points, 'point')}`;

export function destinationAfter(destination: Destination, state: DemoState): Tally {
  if (!state.finished || state.destination !== destination.id)
    return { count: destination.issues, points: destination.points };
  const { unfinished } = tallyBoard(state);
  return { count: destination.issues + unfinished.count, points: destination.points + unfinished.points };
}

export interface BurndownDay {
  date: string;
  remaining: number;
  ideal: number;
  scopeAdded: number;
  completed: number;
}

const WORKING_DAY = [true, true, true, true, true, false, false, true, true, true, true, true];
const SPRINT_07_DATES = [
  '21 Sep',
  '22 Sep',
  '23 Sep',
  '24 Sep',
  '25 Sep',
  '26 Sep',
  '27 Sep',
  '28 Sep',
  '29 Sep',
  '30 Sep',
  '1 Oct',
  '2 Oct',
];
const SPRINT_07_REMAINING = [24, 24, 21, 18, 16, 16, 16, 13, 19, 14, 8, 3];
const SPRINT_07_SCOPE_ADDED = [0, 0, 0, 0, 0, 0, 0, 0, 6, 6, 6, 6];
const SPRINT_07_COMMITTED = 24;

// The ideal line falls only on working days after the first, reaching zero on the end date.
function idealLine(): number[] {
  const steps = WORKING_DAY.slice(1).filter(Boolean).length;
  let fallen = 0;
  return WORKING_DAY.map((working, index) => {
    if (index > 0 && working) fallen += 1;
    return Math.round(SPRINT_07_COMMITTED * (1 - fallen / steps) * 10) / 10;
  });
}

const IDEAL = idealLine();

export const BURNDOWN: BurndownDay[] = SPRINT_07_DATES.map((date, index) => {
  const remaining = SPRINT_07_REMAINING[index] ?? 0;
  const scopeAdded = SPRINT_07_SCOPE_ADDED[index] ?? 0;
  return {
    date,
    remaining,
    ideal: IDEAL[index] ?? 0,
    scopeAdded,
    completed: SPRINT_07_COMMITTED + scopeAdded - remaining,
  };
});

export const BURNDOWN_MAX = 30;

export const SPRINTS_BOARDS_FAQ: FaqEntry[] = [
  {
    question: 'Do unfinished issues roll into the next sprint on their own?',
    answer: [
      'No. Finishing a sprint asks where its unfinished issues go: the backlog or a planned sprint you pick. Nothing is chosen for you. Resolved issues stay with the finished sprint, and each moved issue’s history records the change of sprint.',
    ],
    link: { href: AGILE_MANUAL_PATH, label: 'Sprints in the manual' },
  },
  {
    question: 'Can we use a board without sprints?',
    answer: [
      'Not today. A board always shows one sprint, by default the running one. With no sprint running it shows the planned sprint, and with nothing planned it says so and points you to the backlog.',
    ],
  },
  {
    question: 'Do WIP limits stop people moving cards?',
    answer: [
      'No. A column can have a minimum and a maximum number of cards. Over the maximum its limit shows in red, under the minimum in amber, and the move still goes through. Limits count every card in the column, whatever the filter.',
    ],
  },
  {
    question: 'Who can plan, start and finish sprints?',
    answer: [
      'Project Admins and organisation admins plan, start, finish and delete sprints. Anyone who can edit issues, Contributors and up, moves issues into and out of sprints and reorders them. Observers see the backlog but cannot drag.',
    ],
  },
  {
    question: 'Does it plan sprints or forecast velocity for us?',
    answer: [
      'No. You choose what goes into a sprint and set the points yourself, as whole numbers from 0 to 999. The burndown records what happened each day, including scope added after the start; it does not predict what comes next.',
    ],
    link: { href: REPORTS_FEATURE_PATH, label: 'Reports' },
  },
  {
    question: 'Can an AI agent work with sprints and boards?',
    answer: [
      'Yes. Everything on the backlog and the board is also available through the MCP tools, with the same permissions as in the app, so an agent can move issues into a sprint or read a burndown for you.',
    ],
    link: { href: '/features/mcp-ai-agents', label: 'MCP and AI agents' },
  },
];

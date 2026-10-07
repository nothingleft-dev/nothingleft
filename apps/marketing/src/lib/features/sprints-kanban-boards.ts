import {
  assigneesOf,
  backlogAt,
  burndown,
  daysLeft,
  formatDate,
  formatDayMonth,
  formatSprintDates,
  issue,
  issuesInSprint,
  NOW,
  parentOf,
  PEOPLE as SAMPLE_PEOPLE,
  pointsOf,
  sprint,
  SPRINT_07_CARRIED_OVER,
  statusOf,
  sumPoints,
  weekday,
  type Issue,
  type Person as SamplePerson,
  type Priority as SamplePriority,
  type Status,
} from '@data/sample';
import type { FaqEntry } from '@lib/faq';

export const AGILE_MANUAL_PATH = '/docs/manual/agile';
export const REPORTS_MANUAL_PATH = '/docs/manual/reports';
export const REPORTS_FEATURE_PATH = '/features/project-reports';

export interface Person {
  name: string;
  initials: string;
}

export type ColumnId = 'open' | 'in-progress' | 'fixed';
export type IssueType = 'Bug' | 'Feature' | 'Task';
export type Priority = SamplePriority;

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

const COLUMN_OF_STATUS: Record<Status, ColumnId> = {
  Open: 'open',
  Reopened: 'open',
  'In Progress': 'in-progress',
  Fixed: 'fixed',
};

export interface SprintIssue {
  key: string;
  title: string;
  points: number;
  type: IssueType;
  priority: Priority;
  assignees: Person[];
  column: ColumnId;
}

const SPRINT_NAME = 'Sprint 08';
const PLANNED_NAME = 'Sprint 09';
const PREVIOUS_NAME = 'Sprint 07';

export const SPRINT = {
  name: SPRINT_NAME,
  goal: sprint(SPRINT_NAME).goal ?? '',
  dates: formatSprintDates(SPRINT_NAME),
  daysLeft: daysLeft(SPRINT_NAME),
  today: formatDate(NOW),
};

const toPerson = (who: SamplePerson): Person => ({ name: who.name, initials: who.initials });

export const SPRINT_ISSUES: SprintIssue[] = issuesInSprint(SPRINT_NAME).map(candidate => ({
  key: candidate.key,
  title: candidate.title,
  points: pointsOf(candidate.key) ?? 0,
  type: candidate.type as IssueType,
  priority: candidate.priority,
  assignees: assigneesOf(candidate.key).map(toPerson),
  column: COLUMN_OF_STATUS[statusOf(candidate.key)],
}));

// A card with several assignees sits in the lane of the first one, alphabetically.
export const laneOf = (issue: SprintIssue): string => issue.assignees.map(who => who.name).sort()[0] ?? 'Unassigned';

export const LANES: string[] = [
  ...SAMPLE_PEOPLE.map(who => who.name).filter(name => SPRINT_ISSUES.some(issue => laneOf(issue) === name)),
  ...(SPRINT_ISSUES.some(issue => laneOf(issue) === 'Unassigned') ? ['Unassigned'] : []),
];

export const TYPES: IssueType[] = ['Bug', 'Feature', 'Task'];

const EPIC_KEY = 'ACME-3';
export const EPIC = {
  key: EPIC_KEY,
  title: issue(EPIC_KEY).title,
  cards: SPRINT_ISSUES.filter(card => parentOf(card.key) === EPIC_KEY).length,
};
export const PRIORITIES: Priority[] = (['Critical', 'Major', 'Normal', 'Minor'] as Priority[]).filter(priority =>
  SPRINT_ISSUES.some(issue => issue.priority === priority),
);

export const TOTAL_POINTS = SPRINT_ISSUES.reduce((sum, issue) => sum + issue.points, 0);

const previous = burndown(PREVIOUS_NAME);
const previousFinal = previous[previous.length - 1];
const planned = issuesInSprint(PLANNED_NAME);
const plannedPoints = sumPoints(planned);

export const PLANNED_SPRINT = {
  name: PLANNED_NAME,
  goal: sprint(PLANNED_NAME).goal ?? '',
  dates: formatSprintDates(PLANNED_NAME),
};

export const LIFECYCLE = [
  {
    state: 'Planned',
    sprint: PLANNED_NAME,
    dates: PLANNED_SPRINT.dates,
    note: `${planned.length} issues, ${plannedPoints} points. Waiting for its start.`,
  },
  {
    state: 'Active',
    sprint: SPRINT_NAME,
    dates: SPRINT.dates,
    note: `${SPRINT.daysLeft} days left. One active sprint per project.`,
  },
  {
    state: 'Completed',
    sprint: PREVIOUS_NAME,
    dates: formatSprintDates(PREVIOUS_NAME),
    note: `${previousFinal?.completed} of ${previousFinal?.scope} points resolved. ${SPRINT_07_CARRIED_OVER.join(', ')} moved on to ${SPRINT_NAME}.`,
  },
];

export interface BacklogRow {
  key: string;
  title: string;
  points: number | null;
  type: IssueType;
}

const toRow = (candidate: Issue): BacklogRow => ({
  key: candidate.key,
  title: candidate.title,
  points: pointsOf(candidate.key),
  type: candidate.type as IssueType,
});

export const PLANNED_SPRINT_ROWS: BacklogRow[] = planned.map(toRow);

const backlog = backlogAt();
// The backlog view lists its four newest issues and counts the rest.
export const BACKLOG_ROWS: BacklogRow[] = backlog
  .filter(candidate => candidate.type !== 'Epic')
  .slice(-4)
  .map(toRow);

export const BACKLOG_TOTAL = { issues: backlog.length, points: sumPoints(backlog) };

export type MoveId = 'start' | 'fix';

export interface DemoMove {
  id: MoveId;
  key: string;
  to: ColumnId;
}

// What the visitor tries next on today's board; neither move has happened in the sample.
export const DEMO_MOVES: DemoMove[] = [
  { id: 'start', key: 'ACME-14', to: 'in-progress' },
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
  {
    id: 'sprint-09',
    name: PLANNED_NAME,
    detail: `Planned, ${PLANNED_SPRINT.dates}`,
    issues: planned.length,
    points: plannedPoints,
  },
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
  iso: string;
  date: string;
  remaining: number;
  ideal: number;
  scopeAdded: number;
  completed: number;
}

const previousCommitted = previous[0]?.scope ?? 0;

export const PREVIOUS_SPRINT = PREVIOUS_NAME;

export const BURNDOWN: BurndownDay[] = previous.map(day => ({
  iso: day.date,
  date: formatDayMonth(day.date),
  remaining: day.remaining ?? 0,
  ideal: day.ideal,
  scopeAdded: (day.scope ?? 0) - previousCommitted,
  completed: day.completed ?? 0,
}));

export const BURNDOWN_MAX = 30;

const WEEKDAY_NAMES: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};
export const weekdayName = (iso: string) => WEEKDAY_NAMES[weekday(iso)] ?? '';

const COUNT_WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
];
export const countWord = (count: number) => COUNT_WORDS[count] ?? String(count);

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

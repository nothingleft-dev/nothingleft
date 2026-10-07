import type { FaqEntry } from '@lib/faq';

export const REPORTS_MANUAL_PATH = '/docs/manual/reports';

// The organisation's calendar for durations: the default 8-hour day and 5-day week.
const WORKDAY_MINUTES = 480;
const WORKWEEK_DAYS = 5;

export function durationText(minutes: number): string {
  if (minutes === 0) return '0m';
  const weekMinutes = WORKDAY_MINUTES * WORKWEEK_DAYS;
  const parts: [number, string][] = [
    [Math.floor(minutes / weekMinutes), 'w'],
    [Math.floor((minutes % weekMinutes) / WORKDAY_MINUTES), 'd'],
    [Math.floor((minutes % WORKDAY_MINUTES) / 60), 'h'],
    [minutes % 60, 'm'],
  ];
  return parts
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value}${unit}`)
    .join(' ');
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const shareOf = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : 0);

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
const csvLine = (cells: (string | number | boolean | null)[]) => cells.map(csvCell).join(',');

export const SPRINT = {
  name: 'Sprint 08',
  goal: 'Make invitations clearer',
  start: '4 Oct 2026',
  end: '17 Oct 2026',
};

export interface BurndownDay {
  iso: string;
  date: string;
  short: string;
  working: boolean;
  remaining: number | null;
  ideal: number;
  scope: number | null;
  completed: number | null;
  live: boolean;
}

const SPRINT_DAYS: { day: number; weekday: string; scope: number | null; completed: number | null }[] = [
  { day: 4, weekday: 'Sun', scope: 31, completed: 0 },
  { day: 5, weekday: 'Mon', scope: 34, completed: 0 },
  { day: 6, weekday: 'Tue', scope: 34, completed: 3 },
  { day: 7, weekday: 'Wed', scope: 34, completed: 8 },
  { day: 8, weekday: 'Thu', scope: 34, completed: 11 },
  { day: 9, weekday: 'Fri', scope: 34, completed: 16 },
  { day: 10, weekday: 'Sat', scope: 34, completed: 16 },
  { day: 11, weekday: 'Sun', scope: 34, completed: 16 },
  { day: 12, weekday: 'Mon', scope: 34, completed: 18 },
  { day: 13, weekday: 'Tue', scope: 34, completed: 21 },
  { day: 14, weekday: 'Wed', scope: null, completed: null },
  { day: 15, weekday: 'Thu', scope: null, completed: null },
  { day: 16, weekday: 'Fri', scope: null, completed: null },
  { day: 17, weekday: 'Sat', scope: null, completed: null },
];
const TODAY = 13;

function buildBurndown(): BurndownDay[] {
  const first = SPRINT_DAYS[0];
  const startRemaining = (first?.scope ?? 0) - (first?.completed ?? 0);
  const isWorking = (weekday: string) => weekday !== 'Sat' && weekday !== 'Sun';
  const planned = SPRINT_DAYS.slice(1).filter(d => isWorking(d.weekday)).length;
  let elapsed = 0;
  return SPRINT_DAYS.map((d, index) => {
    const working = isWorking(d.weekday);
    if (index > 0 && working) elapsed += 1;
    const last = index === SPRINT_DAYS.length - 1;
    return {
      iso: `2026-10-${String(d.day).padStart(2, '0')}`,
      date: `${d.day} Oct 2026`,
      short: `${d.weekday} ${d.day}`,
      working,
      remaining: d.scope === null || d.completed === null ? null : d.scope - d.completed,
      ideal: last ? 0 : round1(startRemaining * Math.max(0, 1 - elapsed / planned)),
      scope: d.scope,
      completed: d.completed,
      live: d.day === TODAY,
    };
  });
}

export const BURNDOWN = buildBurndown();

const startScope = BURNDOWN[0]?.scope ?? 0;
export const scopeAdded = (day: BurndownDay) => (day.scope === null ? null : day.scope - startScope);

const today = BURNDOWN.find(d => d.live);
export const BURNDOWN_SUMMARY = {
  committed: startScope,
  added: today?.scope === null || !today ? 0 : today.scope - startScope,
  completed: today?.completed ?? 0,
  remaining: today?.remaining ?? 0,
  scope: today?.scope ?? 0,
};

export const BURNDOWN_AXIS_MAX = 40;

export const BURNDOWN_CSV = [
  csvLine(['date', 'remaining', 'ideal', 'scope', 'scope_added', 'completed', 'live']),
  ...BURNDOWN.map(d => csvLine([d.iso, d.remaining, d.ideal, d.scope, scopeAdded(d), d.completed, d.live])),
].join('\n');

export interface SprintIssue {
  key: string;
  title: string;
  priority: 'Major' | 'Normal';
  assignees: string[];
  points: number;
  status: 'Open' | 'In Progress';
}

export const SCOPE_QUERY = 'sprint: {Sprint 08} #Unresolved';

export const OPEN_ISSUES: SprintIssue[] = [
  {
    key: 'ACME-10',
    title: 'Invite landing shows the inviter',
    priority: 'Normal',
    assignees: ['alex'],
    points: 3,
    status: 'In Progress',
  },
  {
    key: 'ACME-14',
    title: 'Invite email subject names the org',
    priority: 'Normal',
    assignees: ['casey'],
    points: 2,
    status: 'Open',
  },
  {
    key: 'ACME-15',
    title: 'Resend invite from the members list',
    priority: 'Normal',
    assignees: ['sam'],
    points: 1,
    status: 'Open',
  },
  {
    key: 'ACME-17',
    title: 'Invite expiry shown in the members list',
    priority: 'Major',
    assignees: ['alex', 'casey'],
    points: 2,
    status: 'In Progress',
  },
  {
    key: 'ACME-18',
    title: 'Pending invite count on the people page',
    priority: 'Normal',
    assignees: ['jordan'],
    points: 1,
    status: 'Open',
  },
  {
    key: 'ACME-19',
    title: 'Tell the inviter when an invite is accepted',
    priority: 'Normal',
    assignees: ['sam'],
    points: 2,
    status: 'Open',
  },
  {
    key: 'ACME-20',
    title: 'Accessible name for the invite dialog',
    priority: 'Normal',
    assignees: [],
    points: 2,
    status: 'Open',
  },
];

export const PEOPLE: Record<string, { name: string; initials: string }> = {
  alex: { name: 'Alex Lee', initials: 'AL' },
  casey: { name: 'Casey Kim', initials: 'CK' },
  jordan: { name: 'Jordan', initials: 'J' },
  sam: { name: 'Sam Ortiz', initials: 'SO' },
};

export interface AssigneeGroup {
  id: string;
  label: string;
  username: string | null;
  issues: SprintIssue[];
  count: number;
  share: number;
  query: string;
}

const UNASSIGNED = 'Unassigned';

function buildAssigneeGroups(): AssigneeGroup[] {
  const usernames = Object.keys(PEOPLE).sort((a, b) => (PEOPLE[a]?.name ?? a).localeCompare(PEOPLE[b]?.name ?? b));
  const raw = [
    ...usernames.map(username => ({
      id: username,
      label: PEOPLE[username]?.name ?? username,
      username: username as string | null,
      issues: OPEN_ISSUES.filter(issue => issue.assignees.includes(username)),
      clause: `assignee: @${username}`,
    })),
    {
      id: 'unassigned',
      label: UNASSIGNED,
      username: null,
      issues: OPEN_ISSUES.filter(issue => issue.assignees.length === 0),
      clause: `assignee: ${UNASSIGNED}`,
    },
  ].filter(group => group.issues.length > 0);
  const counted = raw.reduce((sum, group) => sum + group.issues.length, 0);
  return raw.map(group => ({
    id: group.id,
    label: group.label,
    username: group.username,
    issues: group.issues,
    count: group.issues.length,
    share: shareOf(group.issues.length, counted),
    query: `${SCOPE_QUERY} project: ACME ${group.clause}`,
  }));
}

export const ASSIGNEE_GROUPS = buildAssigneeGroups();

export const ASSIGNEE_TOTALS = {
  issues: OPEN_ISSUES.length,
  counted: ASSIGNEE_GROUPS.reduce((sum, group) => sum + group.count, 0),
  multi: OPEN_ISSUES.filter(issue => issue.assignees.length > 1).length,
  points: OPEN_ISSUES.reduce((sum, issue) => sum + issue.points, 0),
};

export const ASSIGNEE_AXIS_MAX = Math.max(...ASSIGNEE_GROUPS.map(group => group.count));

export const ASSIGNEE_CSV_NAME = 'acme-issues-per-assignee-2026-10-13.csv';

export const ASSIGNEE_CSV = [
  csvLine(['label', 'value', 'issues', 'share']),
  ...ASSIGNEE_GROUPS.map(group => csvLine([group.label, group.username, group.count, group.share])),
  csvLine(['Total', null, ASSIGNEE_TOTALS.issues, null]),
].join('\n');

const mdRow = (cells: string[]) => `| ${cells.join(' | ')} |`;

export const RUN_REPORT_CALL = `run_report {
  "report": "issues-per-assignee",
  "query": "${SCOPE_QUERY}",
  "projects": ["ACME"]
}`;

export const RUN_REPORT_ANSWER = [
  `**Issues per assignee** — in ACME, for \`${SCOPE_QUERY}\``,
  '',
  mdRow(['Group', 'Issues', 'Share', 'Series', 'Search with']),
  '|---|---|---|---|---|',
  ...ASSIGNEE_GROUPS.map((group, index) =>
    mdRow([group.label, String(group.count), `${group.share}%`, String(index + 1), `\`${group.query}\``]),
  ),
  '',
  `${ASSIGNEE_TOTALS.issues} issues; ${ASSIGNEE_TOTALS.multi} has more than one value, so the groups add up to ${ASSIGNEE_TOTALS.counted}.`,
  '',
  `Chart: series 1–${ASSIGNEE_GROUPS.length}, the ${ASSIGNEE_GROUPS.length} largest in their own order. The table is the series.`,
].join('\n');

export const EMPTY_STATE = {
  query: 'sprint: {Sprint 08} priority: Critical',
  message: 'No issues match sprint: {Sprint 08}, priority: Critical, in ACME.',
  widen: ['Drop sprint: {Sprint 08}', 'Drop priority: Critical', 'Every project'],
};

export const TIME_PERIOD = '5 Oct – 11 Oct 2026';

const TIME_BY_WORK_TYPE: { label: string; minutes: number }[] = [
  { label: 'Development', minutes: 1350 },
  { label: 'Testing', minutes: 480 },
  { label: 'Investigation', minutes: 270 },
  { label: 'Documentation', minutes: 150 },
];

const timeTotal = TIME_BY_WORK_TYPE.reduce((sum, row) => sum + row.minutes, 0);

export const TIME_ROWS = TIME_BY_WORK_TYPE.map(row => ({
  ...row,
  spent: durationText(row.minutes),
  share: shareOf(row.minutes, timeTotal),
}));

export const TIME_TOTAL = { minutes: timeTotal, spent: durationText(timeTotal) };

export const TIMESHEET_DAYS = [
  { label: 'Mon', date: '5', working: true },
  { label: 'Tue', date: '6', working: true },
  { label: 'Wed', date: '7', working: true },
  { label: 'Thu', date: '8', working: true },
  { label: 'Fri', date: '9', working: true },
  { label: 'Sat', date: '10', working: false },
  { label: 'Sun', date: '11', working: false },
];

const TIMESHEET_MINUTES: { username: string; minutes: number[] }[] = [
  { username: 'alex', minutes: [150, 180, 120, 195, 75, 0, 0] },
  { username: 'casey', minutes: [120, 150, 90, 120, 150, 0, 0] },
  { username: 'jordan', minutes: [60, 0, 120, 90, 120, 0, 0] },
  { username: 'sam', minutes: [90, 120, 90, 120, 90, 0, 0] },
];

export const TIMESHEET_ROWS = TIMESHEET_MINUTES.map(row => ({
  username: row.username,
  name: PEOPLE[row.username]?.name ?? row.username,
  cells: row.minutes.map(minutes => (minutes === 0 ? '' : durationText(minutes))),
  total: durationText(row.minutes.reduce((sum, minutes) => sum + minutes, 0)),
}));

const dayMinutes = TIMESHEET_DAYS.map((_, index) =>
  TIMESHEET_MINUTES.reduce((sum, row) => sum + (row.minutes[index] ?? 0), 0),
);
const timesheetTotal = dayMinutes.reduce((sum, minutes) => sum + minutes, 0);

export const TIMESHEET_DAY_TOTALS = dayMinutes.map(minutes => (minutes === 0 ? '' : durationText(minutes)));
export const TIMESHEET_TOTAL = durationText(timesheetTotal);
export const TIME_MATCHES_TIMESHEET = timesheetTotal === timeTotal;

export const DRILL_CELL = { username: 'alex', dayIndex: 3, date: '8 Oct 2026' };

export const DRILL_ENTRIES = [
  { key: 'ACME-12', title: 'Invite link blank after it expires', minutes: 85, type: 'Development' },
  { key: 'ACME-10', title: 'Invite landing shows the inviter', minutes: 80, type: 'Development' },
  { key: 'ACME-17', title: 'Invite expiry shown in the members list', minutes: 30, type: 'Testing' },
].map(entry => ({ ...entry, spent: durationText(entry.minutes) }));

export const DRILL_TOTAL = durationText(DRILL_ENTRIES.reduce((sum, entry) => sum + entry.minutes, 0));

export interface ReportFamily {
  name: string;
  question: string;
  reports: { name: string; detail: string }[];
  link: { href: string; label: string };
}

export const REPORT_FAMILIES: ReportFamily[] = [
  {
    name: 'Delivery',
    question: 'Will the sprint land, and what is holding it up?',
    reports: [
      {
        name: 'Burndown',
        detail:
          'Remaining work across a sprint, in story points, issue count or remaining estimate, against an ideal line that falls only on working days. Added scope is its own line.',
      },
      {
        name: 'Gantt chart',
        detail:
          'Issues from start date to due date, grouped by epic or assignee, with an arrow for every dependency. Issues missing a date are listed underneath, never dropped.',
      },
      {
        name: 'Average issue age',
        detail: 'How long issues have been open, per field value, in days, naming the oldest issue in each group.',
      },
    ],
    link: { href: '/features/sprints-kanban-boards', label: 'Sprints and boards' },
  },
  {
    name: 'Distribution',
    question: 'Where is the work, and who has it?',
    reports: [
      {
        name: 'Issues per assignee',
        detail: 'An issue with two assignees counts once for each, and the report says how many did.',
      },
      { name: 'Issues per project', detail: 'How issues spread over the organisation’s projects.' },
      {
        name: 'Issues per field',
        detail:
          'Status, priority, type, tag, sprint, due date or a custom field. Statuses named differently across projects add up by category.',
      },
      {
        name: 'Matrix',
        detail: 'Two fields at once, such as status by assignee. Every cell opens the issues with both values.',
      },
    ],
    link: { href: '/features/search-saved-views', label: 'Search and saved views' },
  },
  {
    name: 'Time',
    question: 'Where did the hours go?',
    reports: [
      {
        name: 'Time report',
        detail:
          'Time logged over a period by work type, person, issue, project or a work item attribute, against the estimate when grouped by issue or project.',
      },
      {
        name: 'Timesheet',
        detail: 'People as rows, days as columns, totals both ways. Open a cell for the time entries behind it.',
      },
    ],
    link: { href: '/features/time-tracking', label: 'Time tracking' },
  },
];

export const PROJECT_REPORTS_FAQ: FaqEntry[] = [
  {
    question: 'Can the chart, the table and the CSV disagree?',
    answer: [
      'No. Each report is defined once on the server, and the chart, its table, the CSV and the agent’s answer all read that one result. The CSV writes durations as 1w 1d 1h 1m with your organisation’s working day and week, and closes with the totals.',
    ],
    link: { href: REPORTS_MANUAL_PATH, label: 'Reports manual' },
  },
  {
    question: 'Who can see a report?',
    answer: [
      'Every role can open reports and export them. A report never counts an issue you could not open yourself: projects you are not a member of and deleted issues are left out before anything is counted. An agent is further limited to the projects its access token allows, and needs the issues:read scope.',
    ],
  },
  {
    question: 'Are the figures live?',
    answer: [
      'A report is worked out when you open it and shows the time it was worked out. It does not refresh on its own. A result is kept for at most five minutes, and any change in your organisation means the next request computes a fresh one.',
      'The burndown records each day’s figures overnight and when the sprint starts and finishes, so later edits do not rewrite how the sprint went; today’s point is read when you open it.',
    ],
  },
  {
    question: 'Why can the bars add up to more than the number of issues?',
    answer: [
      'An issue assigned to two people, or carrying two tags, counts once under each. The report states both numbers, as in "7 issues; 1 has more than one assignee, so the bars add up to 8", and the CSV’s total row counts each issue once.',
    ],
  },
  {
    question: 'Can an agent run the same reports?',
    answer: [
      'Yes. The run_report tool takes the report’s name and the same choices by name, such as a query, a saved view, a project key or a sprint name. It answers with the table and series the chart is drawn from, and when a report is empty it is told which filter to drop.',
    ],
    link: { href: '/features/mcp-ai-agents', label: 'MCP and AI agents' },
  },
];

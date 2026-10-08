import { OUR_SELF_HOSTING } from '@lib/compare';
import {
  assigneesOf,
  backlogAt,
  burndown,
  daysLeft,
  entriesFor,
  formatDate,
  formatDayMonth,
  formatDuration,
  formatMoment,
  formatSprintDates,
  HISTORY,
  isResolvedAt,
  issuesInSprint,
  NOW,
  ORG,
  person,
  pointsOf,
  sprint,
  sprintSummary,
  statusOf,
  subtasksOf,
  updatedAt,
  type Issue,
  type Moment,
  type SprintName,
  type Status,
} from '@data/sample';
import type { Comparison } from '@lib/compare';
import type { FaqEntry } from '@lib/faq';

export const LAST_VERIFIED = '2026-10-08';

export const PATHS = {
  tour: '/features/sprints-kanban-boards',
  pricing: '/pricing',
  agile: '/docs/agile',
  issues: '/docs/issues',
  statuses: '/docs/issues#statuses-and-resolution',
  timeTracking: '/docs/issues#time-tracking',
  search: '/docs/search',
  reports: '/docs/reports',
  customFields: '/docs/custom-fields',
  mcp: '/docs/mcp',
  permissions: '/docs/permissions',
  notImplemented: '/docs/permissions#deliberately-not-implemented',
  limits: '/docs/limits-and-billing',
  selfHosting: '/docs/limits-and-billing#self-hosting',
  mcpFeature: '/features/mcp-ai-agents',
} as const;

export const JIRA = {
  features: 'https://www.atlassian.com/software/jira/features',
  agile: 'https://www.atlassian.com/software/jira/agile',
  pricing: 'https://www.atlassian.com/software/jira/pricing',
  editions: 'https://www.atlassian.com/software/jira/guides/more/jira-editions',
  workItems: 'https://www.atlassian.com/software/jira/guides/issues',
  plans: 'https://support.atlassian.com/jira-software-cloud/docs/what-is-advanced-roadmaps/',
  jql: 'https://support.atlassian.com/jira-software-cloud/docs/what-is-advanced-search-in-jira-cloud/',
  timeTracking: 'https://support.atlassian.com/jira-software-cloud/docs/log-time-on-an-issue/',
  customFields: 'https://support.atlassian.com/jira-cloud-administration/docs/create-a-custom-field/',
  mcp: 'https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/',
  automation: 'https://www.atlassian.com/software/jira/guides/automation/overview',
  marketplace: 'https://marketplace.atlassian.com/',
  permissions: 'https://support.atlassian.com/jira-cloud-administration/docs/manage-project-permissions/',
  workflows: 'https://support.atlassian.com/jira-cloud-administration/docs/configure-advanced-issue-workflows/',
  hosting: 'https://www.atlassian.com/software/jira/guides/more/jira-hosting',
  dataCenter: 'https://www.atlassian.com/licensing/data-center-end-of-life',
  csvExport: 'https://support.atlassian.com/jira-software-cloud/docs/export-search-results/',
} as const;

const doc = (label: string, href: string) => ({ label, href });
const atlassian = (label: string, href: string) => ({ label, href });

export const JIRA_COMPARISON: Comparison = {
  competitor: 'Jira',
  lastVerified: LAST_VERIFIED,
  rows: [
    {
      group: 'planning',
      capability: 'Issue structure',
      ours: {
        support: 'yes',
        note: 'Bug, Feature, Task and Epic by default, up to three levels deep, with links, tags and attachments. Project Admins rename or add types.',
        source: doc('Issues manual', PATHS.issues),
      },
      theirs: {
        support: 'yes',
        note: 'Epics, stories, tasks, bugs and subtasks; Jira admins create custom work types. Levels above epic come with Plans on Premium and Enterprise.',
        source: atlassian('Jira work items guide', JIRA.workItems),
      },
    },
    {
      group: 'planning',
      capability: 'Boards and sprints',
      ours: {
        support: 'yes',
        note: 'Backlog, one running sprint per project, story points, boards by status, priority or type, swimlanes and WIP warnings.',
        source: doc('Sprints and boards manual', PATHS.agile),
      },
      theirs: {
        support: 'yes',
        note: 'Scrum and kanban boards, sprint planning from the backlog, estimation and customisable board workflows.',
        source: atlassian('Jira agile page', JIRA.agile),
      },
    },
    {
      group: 'planning',
      capability: 'Cross-team planning',
      ours: {
        support: 'no',
        note: 'Sprints and boards belong to one project. Reports and searches can span projects, but there is no multi-team plan, capacity view or dependency timeline.',
        source: doc('Reports manual', PATHS.reports),
      },
      theirs: {
        support: 'yes',
        note: 'Plans, on Premium and Enterprise, combine work from several teams and spaces with dependencies, capacity and what-if scenarios.',
        source: atlassian('Plans in Jira Premium', JIRA.plans),
      },
    },
    {
      group: 'planning',
      capability: 'Custom fields',
      ours: {
        support: 'yes',
        note: 'Per project, from select and user to date and duration, each searchable and in the CSV export. Project Admins add them.',
        source: doc('Custom fields manual', PATHS.customFields),
      },
      theirs: {
        support: 'yes',
        note: 'Jira admins create fields of many types, then place them through field configurations and contexts.',
        source: atlassian('Create a custom field', JIRA.customFields),
      },
    },
    {
      group: 'planning',
      capability: 'Permissions',
      ours: {
        support: 'limited',
        note: 'Five fixed roles from Observer to Org Owner. No custom roles, permission schemes or per-comment visibility.',
        source: doc('Permission matrix', PATHS.permissions),
      },
      theirs: {
        support: 'yes',
        note: 'Permission schemes grant capabilities through space roles and can be shared across spaces. Not available on Free sites.',
        source: atlassian('Manage space permissions', JIRA.permissions),
      },
    },
    {
      group: 'delivery',
      capability: 'Query language',
      ours: {
        support: 'yes',
        note: 'One readable language, such as assignee: me #Unresolved, in the search bar, saved views, board filters, reports and agent tools.',
        source: doc('Search manual', PATHS.search),
      },
      theirs: {
        support: 'yes',
        note: 'JQL builds structured searches from fields, operators and values in advanced search.',
        source: atlassian('Advanced search with JQL', JIRA.jql),
      },
    },
    {
      group: 'delivery',
      capability: 'Reports',
      ours: {
        support: 'yes',
        note: 'Nine reports, including burndown, time, Gantt and timesheet, each with a table under the chart and CSV export. No velocity or cumulative flow chart.',
        source: doc('Reports manual', PATHS.reports),
      },
      theirs: {
        support: 'yes',
        note: 'Burndown, velocity, cumulative flow and sprint reports for agile teams.',
        source: atlassian('Jira agile page', JIRA.agile),
      },
    },
    {
      group: 'delivery',
      capability: 'Time logs',
      ours: {
        support: 'yes',
        note: 'Log time on the issue against its estimate, with work types; subtasks roll up into the parent, and timesheets read the same entries.',
        source: doc('Time tracking manual', PATHS.timeTracking),
      },
      theirs: {
        support: 'yes',
        note: 'Original estimate, logged time and time remaining on the work item, in weeks, days, hours and minutes.',
        source: atlassian('Log time in Jira Cloud', JIRA.timeTracking),
      },
    },
    {
      group: 'delivery',
      capability: 'Automation',
      ours: {
        support: 'no',
        note: 'No rules engine and no transition rules: any status can follow any status. An agent can run repeated edits through the tools, when asked.',
        source: doc('Statuses manual', PATHS.statuses),
      },
      theirs: {
        support: 'yes',
        note: 'A no-code rule builder of triggers, conditions and actions, with branches; usage limits vary by plan.',
        source: atlassian('Jira automation overview', JIRA.automation),
      },
    },
    {
      group: 'delivery',
      capability: 'Integrations',
      ours: {
        support: 'no',
        note: 'No source-control, chat or webhook integrations yet. MCP, the REST API and CSV export are the ways in and out.',
        source: doc('MCP manual', PATHS.mcp),
      },
      theirs: {
        support: 'yes',
        note: 'Connections to tools such as GitHub and Slack, plus apps from the Atlassian Marketplace.',
        source: atlassian('Atlassian Marketplace', JIRA.marketplace),
      },
    },
    {
      group: 'agents',
      capability: 'MCP and agents',
      ours: {
        support: 'yes',
        note: 'An MCP server on the same public API as the app, over HTTP or stdio. A scoped personal token acts as you, within your role.',
        source: doc('MCP manual', PATHS.mcp),
      },
      theirs: {
        support: 'yes',
        note: 'The Atlassian Rovo MCP Server lets external AI clients search, create and update work items, with OAuth 2.1 or an API token.',
        source: atlassian('Rovo MCP Server docs', JIRA.mcp),
      },
    },
    {
      group: 'hosting',
      capability: 'Hosting',
      ours: OUR_SELF_HOSTING,
      theirs: {
        support: 'limited',
        note: 'Cloud, hosted by Atlassian. Self-managed Data Center closed to new customers on 30 Mar 2026 and reaches end of life on 28 Mar 2029.',
        source: atlassian('Data Center end of life', JIRA.dataCenter),
      },
    },
    {
      group: 'hosting',
      capability: 'Plan',
      ours: {
        support: 'yes',
        note: 'No subscription for any team size during beta; the first 20 members stay free when billing arrives. 5 GB of storage, or your own bucket.',
        source: doc('Limits and billing', PATHS.limits),
      },
      theirs: {
        support: 'yes',
        note: 'A Free plan for up to 10 users, then Standard, Premium and Enterprise. Current prices are on Atlassian’s pricing page.',
        source: atlassian('Jira plans', JIRA.editions),
      },
    },
  ],
};

export const ROLES = [
  { role: 'Observer', can: 'Reads issues, boards, reports and articles. Changes nothing.' },
  { role: 'Contributor', can: 'Files and edits issues, comments, logs time and moves issues into sprints.' },
  { role: 'Project Admin', can: 'Also runs sprints, shapes boards, statuses and fields, and manages project members.' },
  { role: 'Org Admin', can: 'Project Admin on every project, plus people, invitations and organisation settings.' },
  { role: 'Org Owner', can: 'Everything an Org Admin can, plus transferring ownership and deleting the organisation.' },
];

export const ROLE_LIMITS = [
  'No custom roles and no permission schemes. Each role means the same thing in every project.',
  'No field- or comment-level visibility: everyone who can open an issue sees all of it.',
  'No transition conditions. Who may move an issue is decided by role, not by workflow.',
];

const SEARCH_AT: Moment = '2026-10-07 09:00';
const BACKLOG_AT: Moment = '2026-10-03 10:20';
const BOARD_AT: Moment = '2026-10-08 16:40';
const SPRINT_NAME: SprintName = 'Sprint 08';

const spentBefore = (key: string, at: Moment): number =>
  entriesFor({ issue: key })
    .filter(entry => entry.date < at.slice(0, 10))
    .reduce((total, entry) => total + entry.minutes, 0) +
  subtasksOf(key, at).reduce((total, child) => total + spentBefore(child.key, at), 0);

const backlogRow = (item: Issue, at: Moment) => ({
  key: item.key,
  title: item.title,
  points: pointsOf(item.key, at),
});

const searchRows = issuesInSprint(SPRINT_NAME, SEARCH_AT)
  .filter(item => item.type === 'Bug' && !isResolvedAt(item.key, SEARCH_AT))
  .sort((a, b) => updatedAt(b.key, SEARCH_AT).localeCompare(updatedAt(a.key, SEARCH_AT)))
  .map(item => {
    const spent = spentBefore(item.key, SEARCH_AT);
    return {
      key: item.key,
      title: item.title,
      priority: item.priority,
      assignees: assigneesOf(item.key, SEARCH_AT).map(person => person.name),
      spent: spent > 0 ? formatDuration(spent) : '—',
      status: statusOf(item.key, SEARCH_AT),
    };
  });

const BOARD_COLUMNS: { name: string; statuses: Status[]; resolved?: true }[] = [
  { name: 'Open', statuses: ['Open', 'Reopened'] },
  { name: 'In Progress', statuses: ['In Progress'] },
  { name: 'Fixed', statuses: ['Fixed'], resolved: true },
];

const boardIssues = issuesInSprint(SPRINT_NAME, BOARD_AT);
const s08 = sprint(SPRINT_NAME);
const days = burndown(SPRINT_NAME);
const summary = sprintSummary(SPRINT_NAME);
const recorded = days.filter(day => day.remaining !== null);
const plannedIssues = issuesInSprint(SPRINT_NAME, BACKLOG_AT);
const startDay = days[0];

const historyBy = (key: string, what: string) => {
  const found = HISTORY.find(entry => entry.key === key && entry.what.startsWith(what));
  if (!found) throw new Error(`${key} has no history entry starting "${what}"`);
  return person(found.by);
};

export const PROJECT_DEFAULTS = [
  {
    label: 'Statuses',
    value: 'Submitted, Open, In Progress, Reopened, Can’t Reproduce, Duplicate, Fixed, Won’t fix, Obsolete, Closed',
  },
  { label: 'Priorities', value: 'Show-stopper, Critical, Major, Normal, Minor' },
  { label: 'Types', value: 'Bug, Feature, Task, Epic' },
  { label: 'Board', value: 'To do, In progress and Done, with a row per epic' },
  { label: 'Time tracking', value: 'On, with Development as the default work type' },
  { label: 'Roles', value: 'Observer, Contributor, Project Admin, Org Admin, Org Owner' },
];

export const WALKTHROUGH = {
  project: { name: 'Acme', key: ORG.project },
  planner: historyBy('ACME-12', 'Sprint:'),
  mover: historyBy('ACME-12', 'Status: In Progress → Fixed'),
  sprint: {
    name: SPRINT_NAME,
    goal: s08.goal ?? '',
    dates: formatSprintDates(SPRINT_NAME),
    ends: formatDate(s08.end),
  },
  backlog: {
    when: formatMoment(BACKLOG_AT),
    planned: plannedIssues.map(item => backlogRow(item, BACKLOG_AT)),
    plannedPoints: plannedIssues.reduce((total, item) => total + (pointsOf(item.key, BACKLOG_AT) ?? 0), 0),
    backlog: backlogAt(BACKLOG_AT).map(item => backlogRow(item, BACKLOG_AT)),
  },
  search: {
    when: formatMoment(SEARCH_AT),
    query: `#{${SPRINT_NAME}} type: Bug #Unresolved sort by: updated desc`,
    rows: searchRows,
  },
  board: {
    when: formatMoment(BOARD_AT),
    columns: BOARD_COLUMNS.map(column => {
      const cards = boardIssues
        .filter(item => column.statuses.includes(statusOf(item.key, BOARD_AT)))
        .map(item => ({
          key: item.key,
          title: item.title,
          points: pointsOf(item.key, BOARD_AT),
          assignees: assigneesOf(item.key, BOARD_AT),
        }));
      return { ...column, cards, points: cards.reduce((total, card) => total + (card.points ?? 0), 0) };
    }),
  },
  burndown: {
    asOf: formatMoment(NOW),
    days: days.map(day => ({
      ...day,
      label: formatDayMonth(day.date),
      added: day.scope === null ? null : day.scope - summary.committed,
    })),
    max: Math.max(...recorded.map(day => day.scope ?? 0), startDay?.remaining ?? 0),
    summary,
    daysLeft: daysLeft(SPRINT_NAME),
    addedOn: formatDate(days.find(day => (day.scope ?? 0) > summary.committed)?.date ?? s08.start),
  },
};

export const EVALUATE_FIRST = [
  {
    title: 'Workflow rules',
    body: 'List the transitions, conditions, validators and post functions your team relies on. None of them carry over: here any status can follow any status, so a rule that blocks or triggers a move becomes a team habit or an agent request.',
    source: { label: 'Jira workflow configuration', href: JIRA.workflows },
  },
  {
    title: 'Add-ons and automation',
    body: 'Write down what each Marketplace app and automation rule does for you. There is no rules engine or app directory here yet, so decide which jobs you can drop and which would keep you on Jira.',
    source: { label: 'Jira automation overview', href: JIRA.automation },
  },
  {
    title: 'Custom field mappings',
    body: 'Match every field you use to a field type here, per project. Options, people and dates map by name; anything with no equivalent goes into the description or is left behind.',
    source: { label: 'Custom fields manual', href: PATHS.customFields },
  },
  {
    title: 'Historical data',
    body: 'Decide how much history you need. Issues created here start their own history on the day they arrive, so past transitions and long comment threads are best left in Jira or quoted in the description.',
    source: { label: 'Issue history manual', href: `${PATHS.issues}#history` },
  },
];

export const AGENT_PROMPT =
  'Find the unresolved work items in our Jira space WEB, propose how people, statuses, types and fields map to the ACME project, and wait for my approval before you create anything.';

export const AGENT_STEPS = [
  {
    title: 'Connect both',
    body: 'An agent that reaches Jira through a connector you already use, and Nothing Left through a personal access token.',
  },
  {
    title: 'Review the mapping',
    body: 'People to @handles, statuses and types by name, fields by type. Nothing is created until you approve it.',
  },
  {
    title: 'Create and check',
    body: 'The agent creates issues, tags and links as you, then lists what it made. Spot-check them before you tell the team.',
  },
];

export const CHOOSE_JIRA = [
  {
    text: 'Several teams plan together and need a shared timeline with dependencies, capacity and scenarios.',
    source: { label: 'Plans in Jira Premium', href: JIRA.plans },
  },
  {
    text: 'Automation rules, Marketplace apps or source-control connections already run part of your process.',
    source: { label: 'Atlassian Marketplace', href: JIRA.marketplace },
  },
  {
    text: 'You need permission schemes, workflow conditions and validators to control exactly who can do what, and when.',
    source: { label: 'Jira workflow configuration', href: JIRA.workflows },
  },
  {
    text: 'Velocity and cumulative flow charts are part of how you plan.',
    source: { label: 'Jira agile page', href: JIRA.agile },
  },
];

export const CHOOSE_US = [
  'One or a few product teams want issues, a backlog, sprints, time logs and reports without an administrator to configure them.',
  'Five fixed roles cover who may read, edit and plan, and any status may follow any status.',
  'People and AI agents should share one query language and one public API, with no extra layer between them.',
  'You want the code under AGPL-3.0 and a path to running the same build yourself.',
];

export const JIRA_FAQ: FaqEntry[] = [
  {
    question: 'Can we import our Jira issues?',
    answer: [
      'Generic CSV import arrives at launch. Export your work items from a Jira search as CSV, map its columns to issue fields in Nothing Left, run a dry run, and read the per-row errors before anything is created. There is no native Jira importer, and none is built today.',
    ],
    link: { href: JIRA.csvExport, label: 'Export search results in Jira', external: true },
  },
  {
    question: 'What can an agent carry over from a connected Jira account?',
    answer: [
      'If one agent can reach your Jira site and Nothing Left, it can read unresolved work items there and use Nothing Left’s tools to create the project, invite members, create tags and create issues with title, description, type, priority, status, assignees, story points, estimate, sprint, parent, links and custom field values.',
      'It works with your access on both sides and creates everything as you. Treat it as a guided move you review, not a one-click import.',
    ],
    link: { href: PATHS.mcp, label: 'Connecting an agent' },
  },
  {
    question: 'What needs manual review?',
    answer: [
      'Who is who across the two accounts, how statuses, types and fields map, duplicates, and attachments, which have to be uploaded again. Original reporters, creation dates, comments’ authors and the change history do not transfer as data; the agent can quote them in the description if you ask.',
      'Workflow rules, automation and app data have no equivalent and stay behind.',
    ],
  },
  {
    question: 'Do our Jira workflows come across?',
    answer: [
      'No. Status names can match, but transitions, conditions, validators and post functions are not modelled: any status can follow any status. Plan the move around that rather than expecting the rules to be rebuilt.',
    ],
    link: { href: PATHS.statuses, label: 'Statuses and resolution' },
  },
  {
    question: 'Will five roles replace our permission schemes?',
    answer: [
      'Only if your needs are simple. The roles decide who reads, edits, plans and administers, the same way in every project. If you rely on custom roles, field or comment visibility, or conditions on who may move work, those are deliberately not built.',
    ],
    link: { href: PATHS.permissions, label: 'The permission matrix' },
  },
];

export const FAQ_CHECKED = formatDate(LAST_VERIFIED);

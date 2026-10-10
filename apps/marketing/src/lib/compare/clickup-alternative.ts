import { OUR_SELF_HOSTING } from '@lib/compare';
import type { Comparison } from '@lib/compare';
import type { FaqEntry } from '@lib/faq';
import { TOOL_REFERENCE_PATH } from '@lib/mcp';
import { GITHUB_URL, LICENSE_URL } from '@lib/site';
import {
  assigneesOf,
  backlogAt,
  burndown,
  entriesFor,
  formatClock,
  formatDate,
  formatDuration,
  formatMoment,
  formatSprintDates,
  isResolvedAt,
  issue,
  ISSUES,
  issuesInSprint,
  person,
  pointsOf,
  severityOf,
  sprint,
  sprintOf,
  statusOf,
  sumPoints,
  type Moment,
  type Status,
} from '@data/sample';

export const COMPETITOR = 'ClickUp';
export const LAST_VERIFIED = '2026-10-08';

export const ENGINEERING_PATH = '/solutions/engineering-teams';
export const SELF_HOSTING_PATH = '/solutions/self-hosting';
export const PRICING_PATH = '/pricing';
export const TOUR_PATH = '/#demo-figure';
export const SEARCH_MANUAL_PATH = '/docs/search';
export const AGILE_MANUAL_PATH = '/docs/agile';
export const ISSUES_MANUAL_PATH = '/docs/issues';
export const TIME_MANUAL_PATH = '/docs/issues#time-tracking';
export const KB_MANUAL_PATH = '/docs/knowledge-base';
export const REPORTS_MANUAL_PATH = '/docs/reports';
export const MCP_MANUAL_PATH = '/docs/mcp';
export const LIMITS_PATH = '/docs/limits-and-billing';
export { GITHUB_URL, LICENSE_URL, TOOL_REFERENCE_PATH };

export const CLICKUP = {
  features: 'https://clickup.com/features',
  compare: 'https://clickup.com/compare',
  pricing: 'https://clickup.com/pricing',
  taskTypes: 'https://help.clickup.com/hc/en-us/articles/17564381376919-Custom-task-types',
  sprints: 'https://help.clickup.com/hc/en-us/articles/6303974210071-Intro-to-Sprints',
  sprintCards: 'https://help.clickup.com/hc/en-us/articles/6303806686231-Legacy-sprint-reporting-cards',
  time: 'https://clickup.com/project-time-tracking',
  docs: 'https://clickup.com/features/docs',
  views: 'https://help.clickup.com/hc/en-us/articles/6329880717719-Intro-to-views',
  chat: 'https://clickup.com/features/chat',
  whiteboards: 'https://clickup.com/features/whiteboards',
  automations: 'https://clickup.com/features/automations',
  ai: 'https://clickup.com/ai',
  superAgents: 'https://help.clickup.com/hc/en-us/articles/31010910371991-What-are-Super-Agents',
  mcpTools: 'https://developer.clickup.com/docs/mcp-tools',
  mcpConnect: 'https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server',
  hosting: 'https://help.clickup.com/hc/en-us/articles/15999383444247-Data-hosting',
  importer: 'https://help.clickup.com/hc/en-us/articles/6310834724247-Use-the-Spreadsheets-Importer',
  terms: 'https://clickup.com/terms',
} as const;

const cu = (label: string, href: string) => ({ label: `${COMPETITOR}: ${label}`, href });
const ours = (label: string, href: string) => ({ label, href });

export const CLICKUP_COMPARISON: Comparison = {
  competitor: COMPETITOR,
  lastVerified: LAST_VERIFIED,
  rows: [
    {
      group: 'planning',
      capability: 'Issue triage',
      ours: {
        support: 'yes',
        note: 'Issues with keys, types, priorities, statuses and custom fields. One search language filters lists, boards, reports and agent searches.',
        source: ours('Search manual', SEARCH_MANUAL_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'Tasks with custom task types, statuses set per Space, Folder or List, four fixed priority levels and Custom Fields; lists sort, group and filter.',
        source: cu('custom task types', CLICKUP.taskTypes),
      },
    },
    {
      group: 'planning',
      capability: 'Agile planning',
      ours: {
        support: 'yes',
        note: 'Sprints, an ordered backlog, boards by status, priority or type, story points and a burndown recorded every night.',
        source: ours('Sprints manual', AGILE_MANUAL_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'The Sprints ClickApp adds Sprint Folders and Sprint Points; dashboard cards chart burndown, burnup and velocity.',
        source: cu('intro to Sprints', CLICKUP.sprints),
      },
    },
    {
      group: 'planning',
      capability: 'Project knowledge',
      ours: {
        support: 'yes',
        note: 'A private knowledge base per project: markdown articles in a tree, linked to issues. No public publishing.',
        source: ours('Knowledge base manual', KB_MANUAL_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'Docs with nested pages, live co-editing, comments and links to tasks; a Doc can serve as a wiki.',
        source: cu('Docs', CLICKUP.docs),
      },
    },
    {
      group: 'planning',
      capability: 'Cross-functional content: docs, chat, whiteboards, views',
      ours: {
        support: 'limited',
        note: 'Project articles, the issue list, backlog, boards and a Gantt report. No chat, whiteboards, calendar, workload or mind-map views.',
        source: ours('Reports manual', REPORTS_MANUAL_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'List, Board, Calendar, Gantt, Timeline, Workload, Table and Mind Map views, plus Chat channels and Whiteboards in the same workspace.',
        source: cu('intro to views', CLICKUP.views),
      },
    },
    {
      group: 'delivery',
      capability: 'Time logs',
      ours: {
        support: 'yes',
        note: 'Logged on the issue with a work type, against its estimate, also over a date range; a timesheet and a time report. No running timer.',
        source: ours('Time tracking manual', TIME_MANUAL_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'Timers and manual entries, billable flags, weekly timesheets that managers approve, and reports that export to CSV.',
        source: cu('time tracking', CLICKUP.time),
      },
    },
    {
      group: 'delivery',
      capability: 'Reports',
      ours: {
        support: 'yes',
        note: 'Nine reports, from burndown to timesheet, each scoped by a query, readable by an agent and exportable as CSV.',
        source: ours('Reports manual', REPORTS_MANUAL_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'Dashboards with cards for sprint burndown, burnup, velocity, cumulative flow, cycle time and lead time.',
        source: cu('sprint reporting cards', CLICKUP.sprintCards),
      },
    },
    {
      group: 'delivery',
      capability: 'Automation',
      ours: {
        support: 'no',
        note: 'No workflow automation or transition rules: any status may follow any status. Bulk updates handle repeated edits.',
        source: ours('Statuses and resolution', `${ISSUES_MANUAL_PATH}#statuses-and-resolution`),
      },
      theirs: {
        support: 'yes',
        note: 'A library of prebuilt trigger-and-action automations, and a builder that drafts one from plain language for you to edit.',
        source: cu('automations', CLICKUP.automations),
      },
    },
    {
      group: 'agents',
      capability: 'MCP server',
      ours: {
        support: 'yes',
        note: 'A hosted /mcp endpoint, or a local stdio shim. A scoped personal access token; the tools call the public REST API, acting as you.',
        source: ours('MCP setup guide', MCP_MANUAL_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'A hosted remote server with tools for tasks, comments, time tracking, Docs and Chat. Sign-in is OAuth; API tokens are not accepted.',
        source: cu('MCP tools', CLICKUP.mcpTools),
      },
    },
    {
      group: 'agents',
      capability: 'AI inside the product',
      ours: {
        support: 'no',
        note: 'No built-in model or agent. Bring the MCP client you already use; it gets ready-made prompts such as a sprint report.',
        source: ours('MCP tool reference', TOOL_REFERENCE_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'Brain and Super Agents: AI teammates that run multi-step workflows, plus AI search, fields, automations and a meeting notetaker.',
        source: cu('Super Agents', CLICKUP.superAgents),
      },
    },
    {
      group: 'hosting',
      capability: 'Self-hosting',
      ours: OUR_SELF_HOSTING,
      theirs: {
        support: 'no',
        note: 'A cloud service hosted on AWS. Enterprise plans can choose a data region; no self-hosted edition is offered.',
        source: cu('data hosting', CLICKUP.hosting),
      },
    },
    {
      group: 'hosting',
      capability: 'Source code',
      ours: {
        support: 'yes',
        note: 'Open source under AGPL-3.0, the same code as the hosted service.',
        source: ours('AGPL-3.0 licence', LICENSE_URL),
      },
      theirs: {
        support: 'no',
        note: 'Proprietary. The terms grant a licence to use the service, not its source.',
        source: cu('terms', CLICKUP.terms),
      },
    },
    {
      group: 'hosting',
      capability: 'Plan',
      ours: {
        support: 'yes',
        note: 'Beta: no subscription for any team size. The first 20 members stay free when billing arrives.',
        source: ours('Limits and billing', LIMITS_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'A Free Forever plan and paid tiers. Prices change; read them on its own page.',
        source: cu('pricing', CLICKUP.pricing),
      },
    },
  ],
};

export interface Strength {
  name: string;
  theirs: string;
  ours: string;
  source: { label: string; href: string };
}

export const CLICKUP_STRENGTHS: Strength[] = [
  {
    name: 'Views',
    theirs: 'List, Board, Calendar, Gantt, Timeline, Workload, Table and Mind Map views over the same tasks.',
    ours: 'The issue list, backlog and boards, with a Gantt report. No calendar, workload or mind-map views.',
    source: { label: 'Intro to views', href: CLICKUP.views },
  },
  {
    name: 'Docs and wiki',
    theirs: 'Docs with nested pages and live co-editing, for any team in the workspace.',
    ours: 'A private knowledge base inside each project, for runbooks and decisions next to the issues.',
    source: { label: 'Docs', href: CLICKUP.docs },
  },
  {
    name: 'Chat',
    theirs: 'Channels, direct messages and threads, with a message turned into a task in one step.',
    ours: 'Comments on issues and articles only. Keep the chat tool you have.',
    source: { label: 'Chat', href: CLICKUP.chat },
  },
  {
    name: 'Whiteboards',
    theirs: 'A shared canvas whose shapes become tasks, with live tasks and Docs embedded.',
    ours: 'None. Sketch elsewhere and link the issue.',
    source: { label: 'Whiteboards', href: CLICKUP.whiteboards },
  },
  {
    name: 'Automation',
    theirs: 'Prebuilt trigger-and-action automations, and a builder that drafts new ones from plain language.',
    ours: 'None. Any status may follow any status, and bulk updates cover the repetitive edits.',
    source: { label: 'Automations', href: CLICKUP.automations },
  },
  {
    name: 'Agents and MCP',
    theirs: 'Super Agents inside the product, and a hosted MCP server for outside assistants.',
    ours: 'An MCP surface only: your own agent, a scoped token, the same rules as the web app.',
    source: { label: 'MCP tools', href: CLICKUP.mcpTools },
  },
];

export const CHOOSE_CLICKUP = [
  'Several departments, not only product and engineering, plan their work in one workspace.',
  'People need many ways to see the same work: calendar, workload, timeline, mind map, table.',
  'You want chat, whiteboards and company-wide docs next to the tasks rather than in separate tools.',
  'You rely on rule-based automations or AI agents that run inside the tracker.',
  'Timesheet approval and billable time are part of how you work.',
];

export const CHOOSE_NOTHING_LEFT = [
  'Your team ships software and mostly needs issues, sprints, time on the issue and project notes.',
  'You want a short setup: lists of statuses, priorities and types, five fixed roles, no rules engine.',
  'Your agent should work through a documented API with a scoped token, as the person who connected it.',
  'Open source matters, or you may want to run the same build on your own infrastructure.',
];

const MONDAY = '2026-10-05';
const FILTER_AT: Moment = `${MONDAY} 09:15`;
const PLAN_AT: Moment = `${MONDAY} 16:00`;
const LOG_AT: Moment = `${MONDAY} 17:05`;
const ASK_AT: Moment = `${MONDAY} 17:30`;
const RUNNING = 'Sprint 08';
const PLANNED = 'Sprint 09';
const LOGGED_KEY = 'ACME-10';

const developer = person('alex');
const PRIORITY_ORDER = ['Critical', 'Major', 'Normal', 'Minor'];

const issueRow = (key: string, at: Moment) => {
  const found = issue(key);
  return {
    key,
    title: found.title,
    priority: found.priority,
    points: pointsOf(key, at),
    status: statusOf(key, at),
    assignees: assigneesOf(key, at),
  };
};

const filtered = ISSUES.filter(
  candidate => candidate.type === 'Bug' && candidate.created <= FILTER_AT && !isResolvedAt(candidate.key, FILTER_AT),
)
  .sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority))
  .map(candidate => issueRow(candidate.key, FILTER_AT));

const plannedIssues = issuesInSprint(PLANNED, PLAN_AT);
const runningAtPlan = issuesInSprint(RUNNING, PLAN_AT);
const backlogAfterPlan = backlogAt(PLAN_AT);

const logEntries = entriesFor({ issue: LOGGED_KEY }).filter(entry => entry.date <= MONDAY);
const todayEntry = logEntries.find(entry => entry.date === MONDAY && entry.author === developer.handle);
if (!todayEntry) throw new Error(`${developer.name} logged nothing on ${LOGGED_KEY} on ${MONDAY}`);
const spentByMonday = logEntries.reduce((total, entry) => total + entry.minutes, 0);
const loggedIssue = issue(LOGGED_KEY);

const day = burndown(RUNNING).find(entry => entry.date === MONDAY);
const committed = burndown(RUNNING)[0]?.scope ?? 0;
const runningAtAsk = issuesInSprint(RUNNING, ASK_AT);
const addedAfterStart = runningAtAsk.filter(
  candidate => (sprintOf(candidate.key, `${sprint(RUNNING).start} 23:59`) ?? '') !== RUNNING,
);
const statusCounts = (['Open', 'In Progress', 'Reopened', 'Fixed'] as Status[])
  .map(status => ({
    status,
    count: runningAtAsk.filter(candidate => statusOf(candidate.key, ASK_AT) === status).length,
  }))
  .filter(entry => entry.count > 0);
const outsideSprint = backlogAt(ASK_AT)
  .filter(
    candidate => candidate.type === 'Bug' && ['Critical', 'High'].includes(severityOf(candidate.key, ASK_AT) ?? ''),
  )
  .map(candidate => issueRow(candidate.key, ASK_AT));

export const MONDAY_STORY = {
  day: formatDate(MONDAY),
  developer,
  filter: {
    when: formatMoment(FILTER_AT),
    query: 'type: Bug #Unresolved',
    rows: filtered,
  },
  plan: {
    when: formatMoment(PLAN_AT),
    running: {
      name: RUNNING,
      goal: sprint(RUNNING).goal ?? '',
      issues: runningAtPlan.length,
      points: sumPoints(runningAtPlan, PLAN_AT),
      ends: formatDate(sprint(RUNNING).end),
    },
    planned: {
      name: PLANNED,
      goal: sprint(PLANNED).goal ?? '',
      dates: formatSprintDates(PLANNED),
      rows: plannedIssues.map(candidate => issueRow(candidate.key, PLAN_AT)),
      points: sumPoints(plannedIssues, PLAN_AT),
    },
    backlog: backlogAfterPlan.slice(0, 3).map(candidate => issueRow(candidate.key, PLAN_AT)),
    backlogMore: Math.max(0, backlogAfterPlan.length - 3),
  },
  log: {
    when: formatMoment(LOG_AT),
    key: LOGGED_KEY,
    title: loggedIssue.title,
    type: loggedIssue.type,
    priority: loggedIssue.priority,
    status: statusOf(LOGGED_KEY, LOG_AT),
    sprint: sprintOf(LOGGED_KEY, LOG_AT),
    points: pointsOf(LOGGED_KEY, LOG_AT),
    logged: formatDuration(todayEntry.minutes),
    workType: todayEntry.workType,
    spent: formatDuration(spentByMonday),
    estimate: formatDuration(loggedIssue.estimate ?? 0),
    spentShare: Math.round((spentByMonday / (loggedIssue.estimate ?? 1)) * 100),
    clock: formatClock(LOG_AT),
  },
  ask: {
    when: formatMoment(ASK_AT),
    sprint: RUNNING,
    goal: sprint(RUNNING).goal ?? '',
    ends: formatDate(sprint(RUNNING).end),
    completed: day?.completed ?? 0,
    scope: day?.scope ?? 0,
    committed,
    added: (day?.scope ?? 0) - committed,
    addedKeys: addedAfterStart.map(candidate => candidate.key),
    issues: runningAtAsk.length,
    statusCounts,
    inProgress: runningAtAsk
      .filter(candidate => statusOf(candidate.key, ASK_AT) === 'In Progress')
      .map(candidate => issueRow(candidate.key, ASK_AT)),
    outsideSprint,
  },
};

export const MONDAY_STEPS = [
  {
    id: 'filter',
    title: 'Filter the bugs',
    who: `${developer.name}, 9:15am`,
    body: 'One query lists every unresolved bug in the project.',
  },
  {
    id: 'plan',
    title: 'Plan the next sprint',
    who: 'The team, 4:00pm',
    body: `${PLANNED} gets a goal, dates and four issues from the backlog.`,
  },
  {
    id: 'log',
    title: 'Log the work',
    who: `${developer.name}, ${formatClock(LOG_AT)}`,
    body: 'Time goes on the issue, against its estimate.',
  },
  {
    id: 'ask',
    title: 'Ask an agent for status',
    who: `${developer.name}’s agent, ${formatClock(ASK_AT)}`,
    body: `The agent reads ${RUNNING} through MCP and answers.`,
  },
];

export const CLICKUP_FAQ: FaqEntry[] = [
  {
    question: 'Does Nothing Left have docs like ClickUp Docs?',
    answer: [
      'It has a knowledge base inside each project: markdown articles in a tree, up to three levels deep, linked to the issues they explain and readable by an agent. Drafts are private until published, and only the project’s members can read them.',
      'It is not a company-wide wiki and has no public publishing. If several departments write together in ClickUp Docs today, keep a docs tool for that and use the project knowledge base for runbooks and decisions.',
    ],
    link: { href: KB_MANUAL_PATH, label: 'Knowledge base manual' },
  },
  {
    question: 'Can we track time the way we do in ClickUp?',
    answer: [
      'You log time on the issue with a duration, a date or a date range, and a work type. The issue shows spent time against its estimate, an epic adds up its subtasks, and the timesheet and time report export to CSV.',
      'There is no running timer and no timesheet approval; ClickUp has both. A project can add its own attributes to each time entry, such as Billable, but a team that invoices from approved timesheets should check that gap first.',
    ],
    link: { href: TIME_MANUAL_PATH, label: 'Time tracking manual' },
  },
  {
    question: 'ClickUp has AI agents and an MCP server. What is different here?',
    answer: [
      'ClickUp runs AI inside the product, including Super Agents, and offers a hosted MCP server that assistants sign in to with OAuth. Nothing Left has no built-in model. It gives the agent you already use an MCP surface with a personal access token that you scope and can revoke.',
      'Every tool calls the same public REST API as the web app, so an agent cannot do anything the API does not allow, and its changes appear under your name. Clients that only accept OAuth connectors cannot connect yet.',
    ],
    link: { href: MCP_MANUAL_PATH, label: 'Connect an agent' },
  },
  {
    question: 'What would we give up by moving from ClickUp?',
    answer: [
      'Chat, whiteboards, forms, rule-based automations, in-product AI, and calendar, workload, timeline and mind-map views. Nothing Left does not try to replace those. It also has no native importer from ClickUp.',
      'What it keeps in one place is the engineering loop: issues, sprints, boards, time on the issue, reports and project notes, with the same capabilities available to an agent.',
    ],
  },
  {
    question: 'Can we bring our ClickUp tasks across?',
    answer: [
      'The dependable route is a generic CSV import: you map the columns, review the rows it could not read and import. There is no ClickUp importer.',
      'If your agent can reach both ClickUp’s MCP server and Nothing Left’s, it can read your unresolved tasks and recreate them as issues with tags and assignees. That is a guided migration, not a one-click transfer: you check the field mapping, duplicates, attachments and who each person becomes before it runs.',
    ],
  },
];

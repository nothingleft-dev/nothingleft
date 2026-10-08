import { OUR_SELF_HOSTING } from '@lib/compare';
import {
  ARTICLES,
  articlePath,
  articleUri,
  assigneesOf,
  burndown,
  daysLeft,
  dependsOnOf,
  formatDate,
  formatDayMonth,
  formatDuration,
  formatMoment,
  formatSprintDates,
  issue,
  issuesInSprint,
  NOW,
  ORG,
  parentOf,
  person,
  pointsOf,
  resolvedAt,
  severityOf,
  spentOn,
  sprint,
  sprintOf,
  sprintSummary,
  statusOf,
  type Status,
} from '@data/sample';
import type { Comparison } from '@lib/compare';
import type { FaqEntry } from '@lib/faq';

export const COMPETITOR = 'Notion Projects';
export const LAST_VERIFIED = '2026-10-08';

export const KB_FEATURE_PATH = '/features/project-knowledge-base';
export const SPRINTS_FEATURE_PATH = '/features/sprints-kanban-boards';
export const PRICING_PATH = '/pricing';
export const KB_MANUAL_PATH = '/docs/manual/knowledge-base';
export const MCP_MANUAL_PATH = '/docs/manual/mcp';

export const NOTION = {
  projects: 'https://www.notion.com/product/projects',
  sprints: 'https://www.notion.com/help/sprints',
  mcp: 'https://www.notion.com/help/notion-mcp',
  pricing: 'https://www.notion.com/pricing',
  uniqueId: 'https://www.notion.com/help/unique-id',
  dependencies: 'https://www.notion.com/help/tasks-and-dependencies',
  views: 'https://www.notion.com/help/views-filters-and-sorts',
  properties: 'https://www.notion.com/help/database-properties',
  charts: 'https://www.notion.com/help/charts',
  wikis: 'https://www.notion.com/help/wikis-and-verified-pages',
  publishing: 'https://www.notion.com/help/public-pages-and-web-publishing',
  ai: 'https://www.notion.com/help/guides/everything-you-can-do-with-notion-ai',
  automations: 'https://www.notion.com/help/database-automations',
  permissions: 'https://www.notion.com/help/sharing-and-permissions',
  export: 'https://www.notion.com/help/export-your-content',
} as const;

const notionSource = (label: string, href: string) => ({ label: `Notion: ${label}`, href });
const docsSource = (label: string, href: string) => ({ label, href });

export const NOTION_COMPARISON: Comparison = {
  competitor: COMPETITOR,
  lastVerified: LAST_VERIFIED,
  rows: [
    {
      group: 'planning',
      capability: 'Issue keys',
      ours: {
        support: 'yes',
        note: 'Every issue gets its project key and the next number, such as ACME-12, on creation. The number never changes and the key is the issue’s address in the app, the API and the agent tools.',
        source: docsSource('Issues manual: keys', '/docs/manual/issues#keys'),
      },
      theirs: {
        support: 'yes',
        note: 'Add an ID property to a database and every item is numbered from 1. With a prefix, an item also opens at an address such as TASK-123.',
        source: notionSource('unique ID', NOTION.uniqueId),
      },
    },
    {
      group: 'planning',
      capability: 'Links, subtasks and dependencies',
      ours: {
        support: 'yes',
        note: 'Relates to, depends on, duplicates and subtask of, each read from both ends. A depends-on loop is refused, and a key typed in any text becomes a link.',
        source: docsSource('Issues manual: links', '/docs/manual/issues#subtasks-and-links'),
      },
      theirs: {
        support: 'yes',
        note: 'Sub-items and dependencies are switched on per database. Dependencies can shift dates on a timeline when one item moves.',
        source: notionSource('sub-items and dependencies', NOTION.dependencies),
      },
    },
    {
      group: 'planning',
      capability: 'Sprint state',
      ours: {
        support: 'yes',
        note: 'A sprint is planned, active, then completed, with one active sprint per project. Finishing it asks where unfinished issues go, and resolved ones stay with the sprint.',
        source: docsSource('Agile manual', '/docs/manual/agile'),
      },
      theirs: {
        support: 'yes',
        note: 'The sprints setup adds a sprint board and a sprints database with current, next and last sprints. Complete sprint moves them along and asks where incomplete tasks go.',
        source: notionSource('sprints', NOTION.sprints),
      },
    },
    {
      group: 'planning',
      capability: 'Configurable databases and views',
      ours: {
        support: 'limited',
        note: 'Issues have a fixed shape. Admins set statuses, priorities, types and custom fields, and saved views filter the list, backlog and board. You do not design your own databases or layouts.',
        source: docsSource('Custom fields manual', '/docs/manual/custom-fields'),
      },
      theirs: {
        support: 'yes',
        note: 'Any database with properties you choose, shown as a table, board, timeline, calendar, list, gallery or chart, with nested AND/OR filters.',
        source: notionSource('views, filters and sorts', NOTION.views),
      },
    },
    {
      group: 'planning',
      capability: 'Permissions',
      ours: {
        support: 'yes',
        note: 'Five built-in roles: two for the organisation, three per project. There are no custom roles and no per-page sharing.',
        source: docsSource('Permissions', '/docs/permissions'),
      },
      theirs: {
        support: 'yes',
        note: 'Access levels per page, such as Full access, Can edit and Can edit content. Teamspaces have their own members, and guests are invited by email.',
        source: notionSource('sharing and permissions', NOTION.permissions),
      },
    },
    {
      group: 'delivery',
      capability: 'Time logs against an estimate',
      ours: {
        support: 'yes',
        note: 'Log a date, a duration and a work type. Spent time shows against the estimate and includes subtasks, and timesheets and a time report add the logs up.',
        source: docsSource('Issues manual: time tracking', '/docs/manual/issues#time-tracking'),
      },
      theirs: {
        support: 'limited',
        note: 'There is no time-log property among the documented property types. Teams record time in number, date or formula properties they add.',
        source: notionSource('database properties', NOTION.properties),
      },
    },
    {
      group: 'delivery',
      capability: 'Sprint burndown',
      ours: {
        support: 'yes',
        note: 'Remaining work per day against an ideal line, recorded nightly. Scope added after the start is its own line.',
        source: docsSource('Reports manual: burndown', '/docs/manual/reports#burndown'),
      },
      theirs: {
        support: 'limited',
        note: 'The sprints guide describes no burndown. A line chart view with Cumulative on can plot a count or sum over time from one database.',
        source: notionSource('charts', NOTION.charts),
      },
    },
    {
      group: 'delivery',
      capability: 'Reports scoped by a query',
      ours: {
        support: 'yes',
        note: 'Nine reports, each scoped by a search query, a saved view or projects. Every bar opens the issues it counts, and each report exports to CSV.',
        source: docsSource('Reports manual', '/docs/manual/reports'),
      },
      theirs: {
        support: 'yes',
        note: 'Chart views draw bar, line and donut charts from a database, using the view’s filters. Drilling into a chart opens the items as a table.',
        source: notionSource('charts', NOTION.charts),
      },
    },
    {
      group: 'delivery',
      capability: 'Docs and wiki',
      ours: {
        support: 'limited',
        note: 'Each project has a private knowledge base of markdown articles, readable only by its members. An issue key in an article links both ways. It is not a company-wide wiki and cannot publish to the web.',
        source: docsSource('Knowledge base manual', KB_MANUAL_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'Pages and wikis across the whole workspace, with page owners and verified pages. Pages can also be published to the web.',
        source: notionSource('wikis and verified pages', NOTION.wikis),
      },
    },
    {
      group: 'agents',
      capability: 'Agent access over MCP',
      ours: {
        support: 'yes',
        note: 'An MCP server over HTTP. The agent acts as the person who connected it, within their role and the token’s scopes and projects.',
        source: docsSource('MCP manual', MCP_MANUAL_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'Notion MCP lets assistants such as Claude, ChatGPT and Cursor read and write pages and databases with the connecting person’s permissions.',
        source: notionSource('Notion MCP', NOTION.mcp),
      },
    },
    {
      group: 'agents',
      capability: 'Built-in AI assistant',
      ours: {
        support: 'no',
        note: 'There is no assistant inside the app. You bring your own agent and connect it over MCP.',
        source: docsSource('MCP manual', MCP_MANUAL_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'Notion AI drafts and reformats pages, answers from the workspace and connected apps, builds databases from a description and takes meeting notes.',
        source: notionSource('Notion AI', NOTION.ai),
      },
    },
    {
      group: 'hosting',
      capability: 'Hosting',
      ours: OUR_SELF_HOSTING,
      theirs: {
        support: 'no',
        note: 'A cloud service. Its plans page lists no self-hosted edition.',
        source: notionSource('plans', NOTION.pricing),
      },
    },
    {
      group: 'hosting',
      capability: 'Plan',
      ours: {
        support: 'yes',
        note: 'No subscription for any team size during beta, and the first 20 members stay free permanently. 5 GB of storage per organisation, unless you connect your own bucket.',
        source: docsSource('Limits and billing', '/docs/limits-and-billing'),
      },
      theirs: {
        support: 'yes',
        note: 'A free plan and paid plans per member. Full Notion AI comes with Business and Enterprise, and Free and Plus get a limited trial. Prices are on its pricing page.',
        source: notionSource('pricing', NOTION.pricing),
      },
    },
  ],
};

const KEY = 'ACME-12';
const SPRINT_NAME = 'Sprint 08';
const bug = issue(KEY);
const decision = ARTICLES.find(candidate => candidate.references.includes(KEY));
if (!decision) throw new Error(`No article references ${KEY}`);
const runbook = ARTICLES.find(candidate => candidate.kind === 'Runbook');

const card = (key: string) => {
  const found = issue(key);
  return {
    key,
    title: found.title,
    points: pointsOf(key) ?? 0,
    assignees: assigneesOf(key).map(who => who.name),
  };
};

const BOARD_STATUSES: { name: string; holds: Status[]; done: boolean }[] = [
  { name: 'Open', holds: ['Open', 'Reopened'], done: false },
  { name: 'In Progress', holds: ['In Progress'], done: false },
  { name: 'Fixed', holds: ['Fixed'], done: true },
];
const BOARD_SHOWN = 3;

const sprintIssues = issuesInSprint(SPRINT_NAME);
const summary = sprintSummary(SPRINT_NAME);
const days = burndown(SPRINT_NAME);
const recorded = days.filter(day => day.remaining !== null);

const resolved = resolvedAt(KEY) ?? '';
const spent = spentOn(KEY);

export const FLOW = {
  key: KEY,
  project: ORG.project,
  issue: {
    title: bug.title,
    type: bug.type,
    priority: bug.priority,
    severity: severityOf(KEY) ?? '',
    status: statusOf(KEY),
    resolved: formatMoment(resolved),
    reporter: person(bug.reporter).name,
    assignee: assigneesOf(KEY).map(who => who.name)[0] ?? '',
    initials: assigneesOf(KEY).map(who => who.initials)[0] ?? '',
    sprint: sprintOf(KEY) ?? '',
    points: pointsOf(KEY) ?? 0,
    estimate: formatDuration(bug.estimate ?? 0),
    spent: formatDuration(spent),
    spentShare: Math.min(100, Math.round((spent / (bug.estimate ?? spent)) * 100)),
    parent: (() => {
      const key = parentOf(KEY);
      return key ? { key, title: issue(key).title } : null;
    })(),
    dependsOn: dependsOnOf(KEY).map(key => ({ key, title: issue(key).title, status: statusOf(key) })),
  },
  sprint: {
    name: SPRINT_NAME,
    goal: sprint(SPRINT_NAME).goal ?? '',
    dates: formatSprintDates(SPRINT_NAME),
    daysLeft: daysLeft(SPRINT_NAME),
    issues: sprintIssues.length,
    completed: summary.completed,
    scope: summary.scope,
    added: summary.added,
    columns: BOARD_STATUSES.map(column => {
      const cards = sprintIssues.filter(candidate => column.holds.includes(statusOf(candidate.key)));
      const ordered = [
        ...cards.filter(candidate => candidate.key === KEY),
        ...cards.filter(candidate => candidate.key !== KEY),
      ];
      return {
        name: column.name,
        done: column.done,
        count: cards.length,
        cards: ordered.slice(0, BOARD_SHOWN).map(candidate => card(candidate.key)),
        more: Math.max(0, cards.length - BOARD_SHOWN),
      };
    }),
  },
  report: {
    today: formatDate(NOW),
    days: days.map(day => ({
      iso: day.date,
      label: formatDayMonth(day.date),
      working: day.working,
      remaining: day.remaining,
      ideal: day.ideal,
      scope: day.scope,
      added: day.scope === null ? null : day.scope - summary.committed,
      completed: day.completed,
      live: day.live,
    })),
    recordedDays: recorded.length,
    committed: summary.committed,
    remaining: summary.remaining,
    max: Math.max(...days.map(day => Math.max(day.scope ?? 0, day.ideal))),
  },
  article: {
    title: decision.title,
    kind: decision.kind,
    folder: decision.folder,
    author: person(decision.author).name,
    published: formatDate(decision.published),
    tags: decision.tags,
    path: articlePath(decision.slug),
    uri: articleUri(decision.slug),
    runbook: runbook ? { title: runbook.title, folder: runbook.folder } : null,
  },
};

export const NOTION_PROJECTS_FAQ: FaqEntry[] = [
  {
    question: 'Does Notion Projects have sprints, AI and MCP?',
    answer: [
      'Yes. Notion’s sprints setup has current, next and last sprints with a Complete sprint button, Notion AI is built in, and Notion MCP lets an assistant read and write a workspace. This page does not claim otherwise. The difference is that an issue tracker builds keys, links, sprint state, burndown and time logs into every issue, where a general workspace builds them from databases the team sets up.',
    ],
    link: { href: NOTION.sprints, label: 'Notion’s sprint guide', external: true },
  },
  {
    question: 'Can Nothing Left replace our Notion wiki?',
    answer: [
      'No, and it does not try to. Each project has a private knowledge base for runbooks, decision records and write-ups, readable only by that project’s members. It has no company-wide wiki, no public pages and no free-form databases. Keep the wiki where it is.',
    ],
    link: { href: KB_MANUAL_PATH, label: 'Knowledge base manual' },
  },
  {
    question: 'Can we use both?',
    answer: [
      'Yes. A team can keep broad shared docs in Notion and run bugs and sprints in Nothing Left. There is no built integration between the two: link from one to the other by address, and keep project runbooks next to the issues they name if you want the issue to point back to them.',
    ],
  },
  {
    question: 'How do we move tasks across from Notion?',
    answer: [
      'There is no native Notion importer. Notion can export a database as CSV, and Nothing Left’s generic CSV import arrives at launch. You can also connect one agent to both through their MCP servers and have it carry tasks across, with you reviewing the field mapping, duplicates, attachments and people before anything is created.',
    ],
    link: { href: NOTION.export, label: 'Notion’s export guide', external: true },
  },
  {
    question: 'Does Nothing Left have a built-in AI assistant?',
    answer: [
      'No. It has an MCP server, so the agent you already use reads and changes issues, sprints, reports and articles as you, within your role and the scopes of the token you give it.',
    ],
    link: { href: MCP_MANUAL_PATH, label: 'Connecting an agent' },
  },
  {
    question: 'What does it cost next to Notion?',
    answer: [
      'Nothing during beta, for a team of any size; the first 20 members stay free permanently once billing exists. Notion’s own prices are on its pricing page, and the calculator above links there rather than copying them.',
    ],
    link: { href: PRICING_PATH, label: 'Pricing' },
  },
];

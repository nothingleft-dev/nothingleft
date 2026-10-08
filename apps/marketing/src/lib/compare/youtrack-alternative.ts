import {
  ARTICLES,
  articlePath,
  articleUri,
  assigneesOf,
  entriesFor,
  existsAt,
  formatDate,
  formatDuration,
  formatMoment,
  HISTORY,
  isResolvedAt,
  issue,
  ISSUES,
  person,
  resolvedAt,
  statusOf,
  type Moment,
} from '@data/sample';
import type { Comparison, MatrixSource } from '@lib/compare';
import type { FaqEntry } from '@lib/faq';
import { TOOL_REFERENCE_PATH } from '@lib/mcp';
import { GITHUB_URL, LICENSE_URL } from '@lib/site';

export const COMPETITOR = 'YouTrack';
export const VERIFIED = '2026-10-08';

const YT = 'https://www.jetbrains.com/youtrack';
const YT_HELP = 'https://www.jetbrains.com/help/youtrack/cloud';

export const YOUTRACK_LINKS = {
  features: `${YT}/features/`,
  issues: `${YT}/features/issue_tracking.html`,
  agile: `${YT}/features/agile_project_management.html`,
  mcp: `${YT_HELP}/model-context-protocol-server.html`,
  buy: `${YT}/buy/`,
} as const;

const yt = (label: string, href: string): MatrixSource => ({ label, href });

const YT_SOURCES = {
  issues: yt('YouTrack: task tracking', YOUTRACK_LINKS.issues),
  agile: yt('YouTrack: agile boards', YOUTRACK_LINKS.agile),
  time: yt('YouTrack: time tracking', `${YT}/features/time_tracking.html`),
  reports: yt('YouTrack Help: reports', `${YT_HELP}/youtrack-reports.html`),
  articleAccess: yt('YouTrack Help: access to articles', `${YT_HELP}/manage-access-to-articles.html`),
  mcp: yt('YouTrack Help: MCP server', YOUTRACK_LINKS.mcp),
  workflows: yt('YouTrack Help: workflow constructor', `${YT_HELP}/workflow-constructor.html`),
  helpdesk: yt('YouTrack Help: helpdesk projects', `${YT_HELP}/helpdesk-projects.html`),
  vcs: yt('YouTrack Help: VCS integrations', `${YT_HELP}/integration-with-version-control-systems.html`),
  ide: yt('YouTrack Help: IDE integration', `${YT_HELP}/integration-with-ide.html`),
  server: yt(
    'YouTrack Server: installation',
    'https://www.jetbrains.com/help/youtrack/server/installation-and-upgrade.html',
  ),
  buy: yt('YouTrack: pricing and licensing', YOUTRACK_LINKS.buy),
  search: yt('YouTrack Help: search for issues', `${YT_HELP}/search-for-issues.html`),
  queryReference: yt('YouTrack Help: search query reference', `${YT_HELP}/search-and-command-attributes.html`),
  workItems: yt('YouTrack Help: add spent time', `${YT_HELP}/add-edit-work-items.html`),
  mentions: yt('YouTrack Help: issue mentions', `${YT_HELP}/issue-mentions.html`),
};

export const DOCS = {
  issues: '/docs/manual/issues',
  search: '/docs/manual/search',
  agile: '/docs/manual/agile',
  reports: '/docs/manual/reports',
  knowledgeBase: '/docs/manual/knowledge-base',
  mcp: '/docs/manual/mcp',
  tools: TOOL_REFERENCE_PATH,
  permissions: '/docs/permissions',
  limits: '/docs/limits-and-billing',
  mcpDesign: `${GITHUB_URL}/blob/main/docs/mcp.md`,
  license: LICENSE_URL,
  selfHosting: '/solutions/self-hosting',
  pricing: '/pricing',
} as const;

const nl = (label: string, href: string): MatrixSource => ({ label, href });

export const YOUTRACK_COMPARISON: Comparison = {
  competitor: COMPETITOR,
  lastVerified: VERIFIED,
  rows: [
    {
      group: 'planning',
      capability: 'Issues and search',
      ours: {
        support: 'yes',
        note: 'Issues with subtasks, links, custom fields and attachments. One query language for the search bar, saved views, board filters, reports and the agent’s search tool.',
        source: nl('Search manual', DOCS.search),
      },
      theirs: {
        support: 'yes',
        note: 'Custom fields with input validation, a query language with suggestions, saved and shared searches, commands, bulk editing and field-level permissions.',
        source: YT_SOURCES.issues,
      },
    },
    {
      group: 'planning',
      capability: 'Agile boards',
      ours: {
        support: 'yes',
        note: 'Sprints, backlog and boards with columns by status, priority or type, swimlanes, WIP limits and a sprint burndown.',
        source: nl('Sprints, backlog and boards', DOCS.agile),
      },
      theirs: {
        support: 'yes',
        note: 'Scrum and Kanban presets or custom boards, swimlanes, WIP limits, sprint planning, burndown and cumulative flow.',
        source: YT_SOURCES.agile,
      },
    },
    {
      group: 'planning',
      capability: 'Knowledge base',
      ours: {
        support: 'yes',
        note: 'A private, markdown knowledge base per project. Issue keys in an article link both ways. No public or anonymous access.',
        source: nl('Knowledge base manual', DOCS.knowledgeBase),
      },
      theirs: {
        support: 'yes',
        note: 'Articles per project with access settings per article; a knowledge base can be opened to anonymous readers through the guest account.',
        source: YT_SOURCES.articleAccess,
      },
    },
    {
      group: 'delivery',
      capability: 'Time tracking',
      ours: {
        support: 'yes',
        note: 'Estimates and spent time on the issue, subtasks rolled up, date ranges, work types, a timesheet and a time report. No timer.',
        source: nl('Time tracking', `${DOCS.issues}#time-tracking`),
      },
      theirs: {
        support: 'yes',
        note: 'Estimates and spent time, timesheets, three preconfigured time reports, logging from JetBrains IDEs and integrations with time-tracking apps.',
        source: YT_SOURCES.time,
      },
    },
    {
      group: 'delivery',
      capability: 'Reports',
      ours: {
        support: 'yes',
        note: 'Nine reports over issues and logged time, each exportable as CSV and readable by an agent with the same numbers.',
        source: nl('Reports manual', DOCS.reports),
      },
      theirs: {
        support: 'yes',
        note: '20 configurable reports across issue distribution, timelines, time management and state transitions, plus Gantt charts.',
        source: YT_SOURCES.reports,
      },
    },
    {
      group: 'delivery',
      capability: 'Workflow scripting',
      ours: {
        support: 'no',
        note: 'Deliberately left out: there are no transition rules and any status can follow any status.',
        source: nl('Issues manual', DOCS.issues),
      },
      theirs: {
        support: 'yes',
        note: 'A no-code workflow constructor and JavaScript workflows, with on-change, on-schedule and action rules.',
        source: YT_SOURCES.workflows,
      },
    },
    {
      group: 'delivery',
      capability: 'Helpdesk',
      ours: {
        support: 'no',
        note: 'No ticket intake from email or web forms, and no external reporters.',
      },
      theirs: {
        support: 'yes',
        note: 'Helpdesk projects take tickets from email and online forms, with support agents, SLAs and two-way notifications to external reporters.',
        source: YT_SOURCES.helpdesk,
      },
    },
    {
      group: 'delivery',
      capability: 'VCS integration',
      ours: {
        support: 'no',
        note: 'No commit, branch or pull-request links on issues today. Google and GitHub sign-in is not source-control integration.',
      },
      theirs: {
        support: 'yes',
        note: 'GitHub, GitLab, Bitbucket and more: commits and branches link to issues, commit messages can carry commands, pull-request status shows on the issue.',
        source: YT_SOURCES.vcs,
      },
    },
    {
      group: 'agents',
      capability: 'MCP server',
      ours: {
        support: 'yes',
        note: 'Built in. The server is a client of the public REST API, so every capability in the web app has a tool. Personal access tokens with scopes.',
        source: nl('MCP tool reference', DOCS.tools),
      },
      theirs: {
        support: 'yes',
        note: 'Cloud and Server 2026.2: search, create and update issues, comments, articles and work items as the signed-in user, by OAuth or a permanent token.',
        source: YT_SOURCES.mcp,
      },
    },
    {
      group: 'hosting',
      capability: 'Hosting',
      ours: {
        support: 'yes',
        note: 'Hosted service, or self-host the same AGPL-3.0 build. The install guide ships with launch.',
        source: nl('Self-hosting', DOCS.selfHosting),
      },
      theirs: {
        support: 'yes',
        note: 'Cloud, or Server installed from a ZIP archive or Docker image. A Cloud team can move to Server.',
        source: YT_SOURCES.server,
      },
    },
    {
      group: 'hosting',
      capability: 'Free seats',
      ours: {
        support: 'yes',
        note: 'Beta: no subscription charge for any team size. The first 20 members of every organisation stay free permanently once billing exists.',
        source: nl('Limits and billing', DOCS.limits),
      },
      theirs: {
        support: 'yes',
        note: 'Free for up to 10 users, with 3 helpdesk agents, on Cloud and Server. Larger teams buy user packs.',
        source: YT_SOURCES.buy,
      },
    },
  ],
};

const KEY = 'ACME-12';
const bug = issue(KEY);

const historyAt = (what: string) => {
  const found = HISTORY.find(entry => entry.key === KEY && entry.what.startsWith(what));
  if (!found) throw new Error(`${KEY} has no history entry starting "${what}"`);
  return found;
};

const LOG_DATE = '2026-10-08';
const logged = historyAt('logged 1h 25m');
const entry = entriesFor({ issue: KEY, date: LOG_DATE })[0];
if (!entry) throw new Error(`${KEY} has no time entry on ${LOG_DATE}`);
const spentAfter = entriesFor({ issue: KEY })
  .filter(candidate => candidate.date <= LOG_DATE)
  .reduce((total, candidate) => total + candidate.minutes, 0);
const fixedAt = resolvedAt(KEY) ?? '';
const decision = ARTICLES.find(candidate => candidate.references.includes(KEY));
if (!decision) throw new Error(`No article references ${KEY}`);

// Alex starts the day of the fix by looking for open invitation work; time is logged at the end of a day.
const SEARCH_AT: Moment = '2026-10-08 09:10';
const minutesBefore = (key: string, day: string) =>
  entriesFor({ issue: key })
    .filter(candidate => candidate.date < day)
    .reduce((total, candidate) => total + candidate.minutes, 0);
const SEARCH_TAG = 'invitations';

export const QUERY = `tag: ${SEARCH_TAG} #Unresolved`;

export const STORY = {
  key: KEY,
  title: bug.title,
  type: bug.type,
  priority: bug.priority,
  estimate: formatDuration(bug.estimate ?? 0),
  developer: person(entry.author),
  search: {
    when: formatMoment(SEARCH_AT),
    rows: ISSUES.filter(
      candidate =>
        candidate.tags?.includes(SEARCH_TAG) &&
        existsAt(candidate.key, SEARCH_AT) &&
        !isResolvedAt(candidate.key, SEARCH_AT),
    ).map(candidate => ({
      key: candidate.key,
      title: candidate.title,
      priority: candidate.priority,
      assignees: assigneesOf(candidate.key, SEARCH_AT),
      status: statusOf(candidate.key, SEARCH_AT),
      spent: minutesBefore(candidate.key, SEARCH_AT.slice(0, 10)),
    })),
  },
  log: {
    when: formatMoment(logged.at),
    date: formatDate(entry.date),
    spent: formatDuration(entry.minutes),
    workType: entry.workType,
    spentAfter: formatDuration(spentAfter),
    spentShare: Math.min(100, Math.round((spentAfter / (bug.estimate ?? spentAfter)) * 100)),
    status: statusOf(KEY, logged.at),
  },
  kb: {
    title: decision.title,
    kind: decision.kind,
    folder: decision.folder,
    author: person(decision.author),
    published: formatDate(decision.published),
    path: articlePath(decision.slug),
    uri: articleUri(decision.slug),
    resolved: formatMoment(fixedAt),
  },
};

export interface DocumentedStep {
  text: string;
  code?: string;
  after?: string;
  source: MatrixSource;
}

export interface WorkflowStage {
  id: string;
  label: string;
  heading: string;
  ours: string[];
  theirs: DocumentedStep[];
}

export const WORKFLOW: WorkflowStage[] = [
  {
    id: 'search',
    label: 'Search',
    heading: `Find the open ${SEARCH_TAG} work`,
    ours: [
      'Press / and type the query into the search bar above the issue list.',
      'Save it as a view and it becomes a tab with its own count.',
      'An agent runs the same text through search_issues.',
    ],
    theirs: [
      { text: 'Use the search box at the top of the Issues list.', source: YT_SOURCES.search },
      {
        text: 'Type the same query: ',
        code: QUERY,
        after: '. Both keywords are in the documented query reference.',
        source: YT_SOURCES.queryReference,
      },
      { text: 'Save the search to return to it, and share it with the team.', source: YT_SOURCES.issues },
    ],
  },
  {
    id: 'time',
    label: 'Log time',
    heading: `Log the afternoon on ${KEY}`,
    ours: [
      'Choose Add spent time below the comment box or beside Spent time in the sidebar.',
      'Write the time the way you would say it, pick the date and keep the project’s default work type.',
      'An agent with the time:write scope does the same through log_time.',
    ],
    theirs: [
      {
        text: 'Choose Add spent time on the issue, or add a work item from your timesheet.',
        source: YT_SOURCES.workItems,
      },
      {
        text: 'Enter the spent time as ',
        code: STORY.log.spent,
        after: ', the work date and the work type.',
        source: YT_SOURCES.workItems,
      },
      {
        text: 'Or type a command in the documented shape ',
        code: 'add work Testing Today 2h 45m',
        after: ', or log from a JetBrains IDE.',
        source: YT_SOURCES.time,
      },
    ],
  },
  {
    id: 'kb',
    label: 'KB reference',
    heading: 'Tie the fix to the decision behind it',
    ours: [
      `Write ${KEY} anywhere in the article and it links to the issue, struck through once the issue is resolved.`,
      `${KEY} lists the article under Referenced by, even if the article came first.`,
      `An agent attaches the article as ${STORY.kb.uri}.`,
    ],
    theirs: [
      {
        text: 'Type the issue ID in an article; a matching ID becomes a link to the issue.',
        source: YT_SOURCES.mentions,
      },
      { text: 'The issue lists the article under Inward Mentions.', source: YT_SOURCES.mentions },
      {
        text: 'If customers should read it too, grant the guest account read access to articles.',
        source: YT_SOURCES.articleAccess,
      },
    ],
  },
];

export interface AnglePoint {
  title: string;
  body: string;
  link: { href: string; label: string; external?: boolean };
}

export const ANGLE: AnglePoint[] = [
  {
    title: 'Restrained setup',
    body: 'A new project starts with statuses, priorities, types, work types and a board. There are no transition rules to design and no workflows to maintain: any status can follow any status.',
    link: { href: DOCS.issues, label: 'Issues manual' },
  },
  {
    title: 'Fixed roles',
    body: 'Org Owner, Org Admin, Project Admin, Contributor and Observer. No role editor and no permission schemes, so who can do what is the same in every project, and every cell of the matrix is tested.',
    link: { href: DOCS.permissions, label: 'The permission matrix' },
  },
  {
    title: 'Markdown first',
    body: 'Descriptions, comments, time notes and articles are stored as markdown. The editor shows a formatted view or the source, and an agent reads and writes the same text.',
    link: { href: DOCS.issues, label: 'Issues manual' },
  },
  {
    title: 'Documented parity',
    body: 'The MCP server is a client of the public REST API, and its tool reference is generated from the code. A capability missing from the API is missing from the tools too, so the gap shows instead of hiding.',
    link: { href: DOCS.tools, label: 'MCP tool reference' },
  },
  {
    title: 'AGPL-3.0 code',
    body: 'The source is public and the hosted service runs the same build you can run yourself. Plans are limit presets, not feature gates.',
    link: { href: DOCS.license, label: 'AGPL-3.0 licence', external: true },
  },
  {
    title: 'Free while it is in beta',
    body: 'No subscription charge for any team size during beta. When billing arrives, the first 20 members of every organisation stay free forever, with notice before any charge beyond them.',
    link: { href: DOCS.pricing, label: 'Pricing' },
  },
];

export const MIGRATION_PROMPT = `Read the unresolved issues in my YouTrack project (#Unresolved). Before you create anything in Nothing Left, show me:
- the project you would create, with its key
- each YouTrack user mapped to a Nothing Left member, or an invitation and its role
- how states, priorities, types and custom fields map, and which have no match
- the tags you would create or reuse
- any issue that already exists in Nothing Left with the same title or YouTrack ID
Wait for my approval. Then create the issues in batches of 20, put the YouTrack ID at the top of each description, and list everything you skipped and why.`;

export const SWITCH_STEPS = [
  {
    title: 'Connect one agent to both',
    body: 'YouTrack’s MCP server on one side; a Nothing Left personal access token on the other, with only the scopes the move needs.',
  },
  {
    title: 'Read the unresolved work',
    body: 'The agent lists what is still open in YouTrack, with its states, fields, tags and people.',
  },
  {
    title: 'Review the field mapping',
    body: 'States, priorities, types and custom fields are proposed side by side. Anything without a match is named, not guessed.',
  },
  {
    title: 'Check for duplicates',
    body: 'Issues already in Nothing Left, by title or by the YouTrack ID carried in the description, are flagged before anything is created.',
  },
  {
    title: 'Review permissions',
    body: 'Each person lands in one of five fixed roles. You approve who becomes a Project Admin, a Contributor or an Observer.',
  },
  {
    title: 'Create, then report',
    body: 'Projects, invitations, tags and issues are created through the documented tools, as you. The agent reports what it skipped.',
  },
];

export const SWITCH_TOOLS = ['create_project', 'invite_member', 'create_issue', 'add_tags', 'search_issues'];

export const STAY_WITH_YOUTRACK = [
  'Your process runs on scripted workflows: on-change rules, schedules and JavaScript automation.',
  'You run a helpdesk with external reporters, email intake and SLAs in the same tool.',
  'Commits, branches and pull requests should update issues, and your developers work from JetBrains IDEs.',
  'Customers read a public knowledge base that lives beside your issues.',
  'You rely on richer reporting: 20 configurable reports, state-transition analysis and Gantt charts.',
];

export const CHOOSE_NOTHING_LEFT = [
  'You use issues, boards, time and a knowledge base, and want fewer settings to keep in shape.',
  'Five fixed roles and no transition rules are a relief, not a limit.',
  'Your descriptions and articles should stay plain markdown that people and agents edit alike.',
  'Agents should reach everything the web app does, with tokens you scope and revoke.',
  'You want AGPL-3.0 code you can run yourself, the same build as the hosted service.',
];

export const YOUTRACK_FAQ: FaqEntry[] = [
  {
    question: 'YouTrack has an MCP server too. What is different?',
    answer: [
      'Both let an agent work as a signed-in person. YouTrack’s server, in Cloud and Server 2026.2, covers issues, comments, articles, projects, users and work items. Nothing Left’s server is a client of its own public REST API, so every capability in the web app has a tool, and personal access tokens narrow it by scope and project.',
    ],
    link: { href: DOCS.tools, label: 'MCP tool reference' },
  },
  {
    question: 'Can we bring our YouTrack issues across?',
    answer: [
      'Yes, with review. An agent connected to both can read your unresolved issues and recreate projects, members, tags and issues through MCP once you approve the mapping. Issues are created by you, now; their full history stays in YouTrack.',
      'Generic CSV import arrives at launch as the bulk fallback. There is no native YouTrack importer.',
    ],
  },
  {
    question: 'Can our knowledge base stay public?',
    answer: [
      'Not in Nothing Left. Every project’s knowledge base is private to its members, with no public or anonymous access. If customers read articles in YouTrack today, keep that part where it is.',
    ],
    link: { href: DOCS.knowledgeBase, label: 'Knowledge base manual' },
  },
  {
    question: 'We use workflows and commit commands. What would we lose?',
    answer: [
      'Both. Nothing Left has no workflow engine, no commands in commit messages and no source-control links on issues today. Any status can follow any status, and changes are made by people or by agents acting as them. If those automations carry your process, YouTrack is the better fit.',
    ],
  },
  {
    question: 'YouTrack is free for small teams. Is price the reason to switch?',
    answer: [
      'It should not be the only one. YouTrack is free for up to 10 users; Nothing Left charges no subscription during beta for any team size, and its first 20 members stay free when billing arrives. Compare the work first, then the bill.',
    ],
    link: { href: DOCS.pricing, label: 'Pricing' },
  },
  {
    question: 'Can we self-host, as with YouTrack Server?',
    answer: [
      'Yes. The code is AGPL-3.0, and a self-hosted install runs the same build as the hosted service, MCP included. Seat and storage limits are settings you choose. The install guide ships with launch.',
    ],
    link: { href: DOCS.selfHosting, label: 'Self-hosting' },
  },
];

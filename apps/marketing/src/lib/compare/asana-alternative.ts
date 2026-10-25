import { OUR_SELF_HOSTING } from '@lib/compare';
import {
  ARTICLES,
  burndown,
  comment,
  dependsOnOf,
  formatDate,
  formatDuration,
  formatMoment,
  formatSprintDates,
  HISTORY,
  issue,
  person,
  resolvedAt,
  sprint,
  subtasksOf,
  TIME_ENTRIES,
  articleUri,
  type Article,
  type HistoryEntry,
  type Moment,
} from '@data/sample';
import type { Comparison } from '@lib/compare';
import type { FaqEntry } from '@lib/faq';

export const COMPETITOR = 'Asana';
export const LAST_VERIFIED = '2026-10-08';

export const PATHS = {
  pricing: '/pricing',
  engineering: '/solutions/engineering-teams',
  selfHosting: '/solutions/self-hosting',
  issues: '/features/issue-tracking',
  sprints: '/features/sprints-kanban-boards',
  reports: '/features/project-reports',
  knowledge: '/features/project-knowledge-base',
  mcp: '/features/mcp-ai-agents',
  issuesManual: '/docs/issues',
  agileManual: '/docs/agile',
  reportsManual: '/docs/reports',
  knowledgeManual: '/docs/knowledge-base',
  mcpManual: '/docs/mcp',
  automationsManual: '/docs/automations',
  permissions: '/docs/permissions',
  limits: '/docs/limits-and-billing',
} as const;

export const ASANA = {
  engineering: 'https://asana.com/teams/engineering',
  productTeams: 'https://asana.com/teams/product-managers',
  agile: 'https://asana.com/uses/agile-management',
  mcp: 'https://developers.asana.com/docs/mcp-server',
  mcpUsing: 'https://developers.asana.com/docs/using-asanas-mcp-server',
  pricing: 'https://asana.com/pricing',
  portfolios: 'https://asana.com/features/goals-reporting/portfolios',
  goals: 'https://asana.com/features/goals-reporting/goals',
  reporting: 'https://asana.com/features/goals-reporting/reporting-dashboards',
  forms: 'https://asana.com/features/workflow-automation/forms',
  rules: 'https://asana.com/features/workflow-automation/rules',
  workload: 'https://asana.com/features/resource-management/workload',
  ai: 'https://asana.com/product/ai',
  aiStudio: 'https://asana.com/product/ai/ai-studio',
  enterprise: 'https://asana.com/enterprise',
  idFields: 'https://help.asana.com/s/article/id-custom-fields',
  projectBrief: 'https://asana.com/inside-asana/clarity-through-context',
  csvExport: 'https://asana.com/inside-asana/export-to-csv',
} as const;

export const ASANA_COMPARISON: Comparison = {
  competitor: COMPETITOR,
  lastVerified: LAST_VERIFIED,
  rows: [
    {
      group: 'planning',
      capability: 'Issue keys and links',
      ours: {
        support: 'yes',
        note: 'Every issue gets a key such as ACME-12 that never changes. Links read from both ends: relates to, depends on, duplicates, subtask of.',
        source: { label: 'Issues manual', href: PATHS.issuesManual },
      },
      theirs: {
        support: 'yes',
        note: 'Readable IDs come from an ID custom field with a prefix you choose, numbered for tasks and one level of subtasks. Tasks connect through blocking and blocked-by dependencies.',
        source: { label: 'ID custom fields', href: ASANA.idFields },
      },
    },
    {
      group: 'planning',
      capability: 'Sprints and backlog',
      ours: {
        support: 'yes',
        note: 'Sprints are planned, started and finished with a goal and dates. An ordered backlog, story points, and a choice of where unfinished issues go when a sprint ends.',
        source: { label: 'Sprints manual', href: PATHS.agileManual },
      },
      theirs: {
        support: 'limited',
        note: 'Sprint templates and board views, with story points as a custom number field and backlogs sorted through saved views and rules.',
        source: { label: 'Agile management', href: ASANA.agile },
      },
    },
    {
      group: 'planning',
      capability: 'Portfolios',
      ours: {
        support: 'no',
        note: 'No layer above projects. Reports can span projects, but there is no portfolio to group and track them.',
        source: { label: 'Reports manual', href: PATHS.reportsManual },
      },
      theirs: {
        support: 'yes',
        note: 'Group projects to watch their status in one place, with dashboards and roll-ups such as time and budget. Advanced plan and up.',
        source: { label: 'Portfolios', href: ASANA.portfolios },
      },
    },
    {
      group: 'planning',
      capability: 'Cross-team goals',
      ours: {
        support: 'no',
        note: 'A sprint carries a goal. There are no organisation, team or personal goals.',
        source: { label: 'Sprints manual', href: PATHS.agileManual },
      },
      theirs: {
        support: 'yes',
        note: 'Company, team and personal goals with sub-goals, linked to projects and portfolios, updating as work moves. Advanced plan and up.',
        source: { label: 'Goals', href: ASANA.goals },
      },
    },
    {
      group: 'planning',
      capability: 'Intake forms',
      ours: {
        support: 'no',
        note: 'Members file issues in the app or through an agent. There are no forms for people outside the project.',
        source: { label: 'Issues manual', href: PATHS.issuesManual },
      },
      theirs: {
        support: 'yes',
        note: 'Forms with conditional questions that anyone with the link can submit; each response becomes a task. Starter plan and up.',
        source: { label: 'Forms', href: ASANA.forms },
      },
    },
    {
      group: 'planning',
      capability: 'Workload and capacity',
      ours: {
        support: 'limited',
        note: 'Estimates, logged time, a time report and an issues-per-assignee report. No capacity view.',
        source: { label: 'Reports manual', href: PATHS.reportsManual },
      },
      theirs: {
        support: 'yes',
        note: 'A workload view of each person’s effort across projects, with capacity limits and drag-to-rebalance. Advanced plan and up.',
        source: { label: 'Workload', href: ASANA.workload },
      },
    },
    {
      group: 'delivery',
      capability: 'Reports',
      ours: {
        support: 'yes',
        note: 'Nine reports, including a burndown recorded nightly, a Gantt chart, a time report and timesheets. Each exports as CSV.',
        source: { label: 'Reports manual', href: PATHS.reportsManual },
      },
      theirs: {
        support: 'yes',
        note: 'Project dashboards from Starter; portfolio dashboards and universal reporting from Advanced. Column, line, burn-up and other charts.',
        source: { label: 'Reporting', href: ASANA.reporting },
      },
    },
    {
      group: 'delivery',
      capability: 'Docs and project knowledge',
      ours: {
        support: 'yes',
        note: 'A private knowledge base per project: runbooks and decision records in a tree. An issue key in an article links both ways.',
        source: { label: 'Knowledge base manual', href: PATHS.knowledgeManual },
      },
      theirs: {
        support: 'limited',
        note: 'Each project has an Overview and a rich-text Project Brief for shared context, links and embeds.',
        source: { label: 'Project Overview and Brief', href: ASANA.projectBrief },
      },
    },
    {
      group: 'delivery',
      capability: 'Workflow automation',
      ours: {
        support: 'limited',
        note: 'Status rules fired by git events and resolved subtasks, not a general rules engine, and no transition rules: any status can follow any status. An agent can make bulk changes you ask for.',
        source: { label: 'Automations manual', href: PATHS.automationsManual },
      },
      theirs: {
        support: 'yes',
        note: 'Rules with triggers and actions from Starter, across projects and with apps; AI Studio adds no-code AI workflows.',
        source: { label: 'Rules', href: ASANA.rules },
      },
    },
    {
      group: 'agents',
      capability: 'MCP server',
      ours: {
        support: 'yes',
        note: 'Part of the API. The agent acts as the person who created its token, within their role, using keys and names rather than IDs.',
        source: { label: 'MCP manual', href: PATHS.mcpManual },
      },
      theirs: {
        support: 'yes',
        note: 'Generally available over OAuth for Claude, ChatGPT, Cursor, VS Code and other clients; reads and manages tasks and projects.',
        source: { label: 'MCP server', href: ASANA.mcpUsing },
      },
    },
    {
      group: 'agents',
      capability: 'AI inside the app',
      ours: {
        support: 'no',
        note: 'No built-in assistant. Bring the agent you already use and connect it over MCP.',
        source: { label: 'MCP manual', href: PATHS.mcpManual },
      },
      theirs: {
        support: 'yes',
        note: 'AI Teammates, AI Studio for no-code AI workflows, and Asana Dash.',
        source: { label: 'Asana AI', href: ASANA.ai },
      },
    },
    {
      group: 'hosting',
      capability: 'Self-hosting and source',
      ours: OUR_SELF_HOSTING,
      theirs: {
        support: 'no',
        note: 'Cloud service. Its pricing page says it does not plan to offer an internally hosted version; data residency is an enterprise option.',
        source: { label: 'Pricing FAQ', href: ASANA.pricing },
      },
    },
    {
      group: 'hosting',
      capability: 'Admin and governance',
      ours: {
        support: 'limited',
        note: 'Five fixed roles, scoped agent tokens and two-factor sign-in. No custom roles and no admin console.',
        source: { label: 'Permissions', href: PATHS.permissions },
      },
      theirs: {
        support: 'yes',
        note: 'SAML, SCIM, audit log, admin app management and SIEM APIs on enterprise plans.',
        source: { label: 'Enterprise', href: ASANA.enterprise },
      },
    },
    {
      group: 'hosting',
      capability: 'Plan and price',
      ours: {
        support: 'yes',
        note: 'No subscription charge during beta, for any team size. The first 20 members stay free once billing exists.',
        source: { label: 'Pricing', href: PATHS.pricing },
      },
      theirs: {
        support: 'limited',
        note: 'A free Personal plan for one or two people; Starter, Advanced and Enterprise tiers are paid. Prices are on its pricing page.',
        source: { label: 'Pricing', href: ASANA.pricing },
      },
    },
  ],
};

export const NOT_IN_NOTHING_LEFT = [
  'Intake forms that people outside a project can submit',
  'Portfolios that group projects',
  'Organisation, team or personal goals',
  'A workload or capacity view',
  'General rules that change work automatically; automations here only set a status',
  'An AI assistant inside the app',
];

export interface Strength {
  title: string;
  body: string;
  source: { label: string; href: string };
}

export const ASANA_STRENGTHS: Strength[] = [
  {
    title: 'Cross-functional planning',
    body: 'Portfolios and timelines give one view of many projects, and its product-team pages tie roadmaps to strategy across departments.',
    source: { label: 'Asana for product teams', href: ASANA.productTeams },
  },
  {
    title: 'Goals that roll up',
    body: 'Company, team and personal goals link to the projects and portfolios behind them and update as work moves.',
    source: { label: 'Goals', href: ASANA.goals },
  },
  {
    title: 'Intake forms',
    body: 'Requests arrive through forms with conditional questions, from people inside or outside the organisation, and land as tasks.',
    source: { label: 'Forms', href: ASANA.forms },
  },
  {
    title: 'Workload',
    body: 'Capacity across people and projects, with limits and drag-to-rebalance, over days to years.',
    source: { label: 'Workload', href: ASANA.workload },
  },
  {
    title: 'Enterprise governance',
    body: 'SAML, SCIM, audit logs, service accounts, admin app management and data residency on enterprise tiers.',
    source: { label: 'Enterprise', href: ASANA.enterprise },
  },
  {
    title: 'Engineering workflows, AI and MCP',
    body: 'Bug tracking, sprint templates and integrations with GitHub, GitLab and Jira; AI Teammates and AI Studio; and a generally available MCP server.',
    source: { label: 'Asana for engineering', href: ASANA.engineering },
  },
];

export const ASANA_MCP_SOURCE = { label: 'Asana MCP server', href: ASANA.mcp };

const KEY = 'ACME-12';
const bug = issue(KEY);
const SPRINT_NAME = 'Sprint 08';
const sprint08 = sprint(SPRINT_NAME);

const historyFrom = (what: string) => {
  const found = HISTORY.find(entry => entry.key === KEY && entry.what.startsWith(what));
  if (!found) throw new Error(`${KEY} has no history entry starting "${what}"`);
  return found;
};

const filedBy = person(bug.reporter);
const assignedEntry = historyFrom('Assignee:');
const sprintEntry = historyFrom('Sprint:');
const dependsEntry = historyFrom('linked: depends on');
const severityEntry = historyFrom('Severity:');
const parentEntry = historyFrom('linked: parent for');
const startedEntry = historyFrom('Status: Open');
const fixedAt: Moment = resolvedAt(KEY) ?? '';
const developer = person('alex');

const spentBy = (at: Moment) =>
  TIME_ENTRIES.filter(entry => entry.issue === KEY && entry.date <= at.slice(0, 10)).reduce(
    (total, entry) => total + entry.minutes,
    0,
  );

const dependency = issue(dependsOnOf(KEY, startedEntry.at)[0] ?? '');
const subtask = subtasksOf(KEY, startedEntry.at)[0];
const fixDay = burndown(SPRINT_NAME).find(day => day.date === fixedAt.slice(0, 10));

const historyLine = (entry: HistoryEntry) => ({
  who: person(entry.by).name,
  what: entry.what,
  when: formatMoment(entry.at),
});

const decision = ARTICLES.find(candidate => candidate.references.includes(KEY)) as Article;
const runbook = ARTICLES.find(candidate => candidate.kind === 'Runbook') as Article;
const runbookIssue = issue(runbook.references[0] ?? '');

export const TOUR = {
  key: KEY,
  title: bug.title,
  type: bug.type,
  priority: bug.priority,
  filed: {
    by: filedBy,
    when: formatMoment(bug.created),
    severity: bug.severity?.[0]?.value ?? '',
  },
  planned: {
    when: formatMoment(sprintEntry.at),
    sprint: SPRINT_NAME,
    goal: sprint08.goal ?? '',
    dates: formatSprintDates(SPRINT_NAME),
    developer,
    estimate: formatDuration(bug.estimate ?? 0),
    due: formatDate(bug.due ?? ''),
    points: bug.points?.[0]?.value ?? 0,
    history: [assignedEntry, sprintEntry].map(historyLine),
  },
  worked: {
    when: formatMoment(startedEntry.at),
    dependency: { key: dependency.key, title: dependency.title },
    subtask: subtask ? { key: subtask.key, title: subtask.title } : null,
    note: comment(KEY, 'alex', startedEntry.at.slice(0, 10)),
    spent: formatDuration(spentBy(startedEntry.at)),
    history: [dependsEntry, severityEntry, parentEntry, startedEntry].map(historyLine),
  },
  fixed: {
    when: formatMoment(fixedAt),
    note: comment(KEY, 'alex', fixedAt.slice(0, 10)),
    spent: formatDuration(spentBy(fixedAt)),
    sprintCompleted: fixDay?.completed ?? 0,
    sprintScope: fixDay?.scope ?? 0,
    sprintDay: formatDate(fixedAt),
  },
  notes: {
    decision: {
      title: decision.title,
      kind: decision.kind,
      folder: decision.folder,
      author: person(decision.author),
      published: formatDate(decision.published),
      uri: articleUri(decision.slug),
    },
    runbook: {
      title: runbook.title,
      kind: runbook.kind,
      folder: runbook.folder,
      author: person(runbook.author),
      issueKey: runbookIssue.key,
      issueTitle: runbookIssue.title,
    },
  },
};

export interface TourStep {
  id: string;
  title: string;
  body: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'filed',
    title: 'Filed',
    body: `${filedBy.name} files the bug with steps to reproduce. It gets a key at once, ${KEY}.`,
  },
  {
    id: 'planned',
    title: 'Planned into a sprint',
    body: `It joins ${SPRINT_NAME} with story points, an owner, an estimate and a due date.`,
  },
  {
    id: 'worked',
    title: 'Linked and worked',
    body: 'A dependency, a subtask and a severity change, each in the history.',
  },
  {
    id: 'fixed',
    title: 'Fixed inside the sprint',
    body: 'Fixed is a done status, so the sprint counts its points.',
  },
  {
    id: 'notes',
    title: 'The notes behind it',
    body: 'The decision record sits in the project’s knowledge base, next to the runbooks.',
  },
];

export const CHOOSE_ASANA = [
  'You plan organisation-wide programs that span marketing, operations, design and engineering.',
  'Non-technical departments need intake forms, approvals and goals in the same tool as the developers.',
  'Leadership tracks portfolios and company goals across many teams.',
  'You need SAML, SCIM, audit logs and data residency on day one.',
  'You want AI built into the app and rule-based automation without writing anything.',
];

export const CHOOSE_NOTHING_LEFT = [
  'The work is mostly bugs, features and sprints, and engineers want keys they can type.',
  'Sprints, backlog order, story points and a nightly burndown should be built in, not assembled from templates.',
  'Runbooks and decision records should live beside the issues they explain.',
  'Your team uses its own AI agent and wants it to work through the same permissions as a person.',
  'You want the source under AGPL-3.0 and the option to run it on your own infrastructure.',
];

export interface SwitchStep {
  title: string;
  body: string;
  source?: { label: string; href: string };
}

export const SWITCH_STEPS: SwitchStep[] = [
  {
    title: 'Export from Asana',
    body: 'Asana exports a project as CSV from its project actions menu: names, assignees, dates, tags, notes and parent tasks.',
    source: { label: 'Export to CSV', href: ASANA.csvExport },
  },
  {
    title: 'Import the CSV',
    body: 'Generic CSV import is the dependable bulk path. There is no native Asana importer.',
  },
  {
    title: 'Or let an agent carry it across',
    body: 'An agent connected to both tools can read open tasks and create projects, tags and issues here through MCP. You review the field mapping, duplicates, attachments and people before it writes.',
  },
];

export const SELF_HOSTING_FACTS = [
  {
    title: 'What you run',
    body: 'The web app and one API process that also serves MCP, with PostgreSQL, Redis and S3-compatible storage beside them.',
  },
  {
    title: 'What stays the same',
    body: 'The same AGPL-3.0 build as the hosted service. Seat and storage limits are environment settings you can change.',
  },
  {
    title: 'What is yours to keep running',
    body: 'Upgrades and migrations, backups of the database and buckets, email delivery, sign-in apps, security patches and uptime.',
  },
];

export const ASANA_FAQ: FaqEntry[] = [
  {
    question: 'Is Nothing Left a full replacement for Asana?',
    answer: [
      'Not for every team. It has no intake forms, portfolios, goals, workload view, rules or built-in AI. It is a tracker for engineering and product work: issues with keys and links, sprints and a backlog, reports, project knowledge and an MCP server.',
    ],
    link: { href: '#matrix', label: 'See the comparison' },
  },
  {
    question: 'Does Asana have an MCP server too?',
    answer: [
      'Yes. Asana documents a generally available MCP server that clients such as Claude, ChatGPT and Cursor connect to over OAuth. In Nothing Left, MCP is part of the API, and every tool acts as the person who created the token, within their role.',
    ],
    link: { href: ASANA.mcpUsing, label: 'Asana’s MCP documentation', external: true },
  },
  {
    question: 'Can we self-host Nothing Left?',
    answer: [
      'Yes. The code is AGPL-3.0 and a self-hosted install runs the same build as the hosted service. Your team runs and maintains it: upgrades, backups, email and uptime. Install guides cover Docker Compose and AWS.',
    ],
    link: { href: PATHS.selfHosting, label: 'Self-hosting' },
  },
  {
    question: 'How do we move our work from Asana?',
    answer: [
      'Use the generic CSV import. An agent connected to both tools can also carry open tasks across through MCP, with you reviewing the mapping. There is no native Asana importer.',
    ],
  },
  {
    question: 'Can engineering use Nothing Left while the rest of the company stays in Asana?',
    answer: [
      'Yes. Nothing Left does not need the whole organisation, and it does not sync with Asana. The engineering team keeps its issues, sprints and runbooks here; programs and goals stay where they are.',
    ],
    link: { href: PATHS.engineering, label: 'For engineering teams' },
  },
  {
    question: 'What does it cost?',
    answer: [
      'No subscription charge during beta, for any team size. When billing arrives, the first 20 members of every organisation stay free, and we will give notice before charging for more.',
    ],
    link: { href: PATHS.pricing, label: 'Pricing' },
  },
];

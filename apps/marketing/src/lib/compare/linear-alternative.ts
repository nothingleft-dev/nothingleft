import { OUR_SELF_HOSTING } from '@lib/compare';
import {
  assigneesOf,
  formatDate,
  formatDayMonth,
  formatDuration,
  formatMoment,
  HISTORY,
  issue,
  person,
  pointsOf,
  sprintOf,
  statusOf,
  type HistoryEntry,
  type Moment,
} from '@data/sample';
import type { Comparison, MatrixSource } from '@lib/compare';
import type { FaqEntry } from '@lib/faq';
import { GITHUB_URL } from '@lib/site';

export const COMPETITOR = 'Linear';
export const LAST_VERIFIED = '2026-10-08';

export const ISSUES_FEATURE_PATH = '/features/issue-tracking';
export const TIME_FEATURE_PATH = '/features/time-tracking';
export const MCP_FEATURE_PATH = '/features/mcp-ai-agents';
export const GIT_FEATURE_PATH = '/features/git-integration';
export const PRICING_PATH = '/pricing';
export const SELF_HOSTING_PATH = '/solutions/self-hosting';
export const ENGINEERING_PATH = '/solutions/engineering-teams';
export const ISSUES_MANUAL = '/docs/issues';
export const TIME_MANUAL = '/docs/issues#time-tracking';
export const AGILE_MANUAL = '/docs/agile';
export const REPORTS_MANUAL = '/docs/reports';
export const MCP_MANUAL = '/docs/mcp';
export const MCP_TOOLS_MANUAL = '/docs/mcp-tools';
export const LIMITS_DOC = '/docs/limits-and-billing';
export const PERMISSIONS_DOC = '/docs/permissions';

export const LINEAR = {
  features: { label: 'Linear features', href: 'https://linear.app/features' },
  docs: { label: 'Linear docs', href: 'https://linear.app/docs' },
  cycles: { label: 'Linear docs: Cycles', href: 'https://linear.app/docs/use-cycles' },
  projects: { label: 'Linear docs: Projects', href: 'https://linear.app/docs/projects' },
  initiatives: { label: 'Linear docs: Initiatives', href: 'https://linear.app/docs/initiatives' },
  triage: { label: 'Linear docs: Triage', href: 'https://linear.app/docs/triage' },
  insights: { label: 'Linear docs: Insights', href: 'https://linear.app/docs/insights' },
  github: { label: 'Linear docs: GitHub', href: 'https://linear.app/docs/github' },
  gitlab: { label: 'Linear docs: GitLab', href: 'https://linear.app/docs/gitlab' },
  mcp: { label: 'Linear docs: MCP server', href: 'https://linear.app/docs/mcp' },
  agents: { label: 'Linear docs: AI agents', href: 'https://linear.app/docs/agents-in-linear' },
  harvest: { label: 'Harvest integration for Linear', href: 'https://linear.app/integrations/harvest' },
  security: { label: 'Linear security', href: 'https://linear.app/security' },
  pricing: { label: 'Linear pricing', href: 'https://linear.app/pricing' },
  importing: { label: 'Linear docs: Import issues', href: 'https://linear.app/docs/import-issues' },
  exporting: { label: 'Linear docs: Exporting data', href: 'https://linear.app/docs/exporting-data' },
} satisfies Record<string, MatrixSource>;

const ours = (label: string, href: string): MatrixSource => ({ label, href });

export const LINEAR_COMPARISON: Comparison = {
  competitor: COMPETITOR,
  lastVerified: LAST_VERIFIED,
  rows: [
    {
      group: 'planning',
      capability: 'Issue tracking',
      ours: {
        support: 'yes',
        note: 'Keys like ACME-12, subtasks and links, custom fields, full history, search and saved views. Any status may follow any status.',
        source: ours('Issues manual', ISSUES_MANUAL),
      },
      theirs: {
        support: 'yes',
        note: 'Issues with configurable workflows, sub-issues and relations, and a Triage inbox for issues from integrations and other teams.',
        source: LINEAR.docs,
      },
    },
    {
      group: 'planning',
      capability: 'Cycles or sprints',
      ours: {
        support: 'yes',
        note: 'Sprints with a goal and dates, a ranked backlog and boards. Finishing one asks where each unfinished issue goes.',
        source: ours('Sprints manual', AGILE_MANUAL),
      },
      theirs: {
        support: 'yes',
        note: 'Cycles repeat on a 1 to 8 week schedule with optional cooldowns, and open issues roll over automatically.',
        source: LINEAR.cycles,
      },
    },
    {
      group: 'planning',
      capability: 'Product planning above the issue',
      ours: {
        support: 'limited',
        note: 'Epics add up the points and time beneath them, and the Gantt report groups by epic. No initiatives, milestones or project updates.',
        source: ours('Reports manual', REPORTS_MANUAL),
      },
      theirs: {
        support: 'yes',
        note: 'Projects with milestones and a timeline, grouped under initiatives that carry status updates and target dates.',
        source: LINEAR.initiatives,
      },
    },
    {
      group: 'delivery',
      capability: 'Time logged on the issue',
      ours: {
        support: 'yes',
        note: 'Log a duration by date or range with a work type. Spent time sits against the estimate and adds up from subtasks.',
        source: ours('Time tracking manual', TIME_MANUAL),
      },
      theirs: {
        support: 'limited',
        note: 'Through partner integrations. Harvest’s, built by Harvest, adds a Start timer button to the issue sidebar and links its time entry to the issue.',
        source: LINEAR.harvest,
      },
    },
    {
      group: 'delivery',
      capability: 'Reporting',
      ours: {
        support: 'yes',
        note: 'Nine reports, among them burndown, time, Gantt and timesheet. Each exports to CSV with the numbers the chart shows.',
        source: ours('Reports manual', REPORTS_MANUAL),
      },
      theirs: {
        support: 'yes',
        note: 'Insights charts issue count, effort, cycle, lead and triage time, with burn-up and cumulative flow, on Business and Enterprise plans.',
        source: LINEAR.insights,
      },
    },
    {
      group: 'delivery',
      capability: 'Source-control experience',
      ours: {
        support: 'yes',
        note: 'GitHub and GitLab: branches, commits and pull requests link to issues by key, with review and CI state on the issue, and status rules move the issue on a branch, a pull request or a merge. Read-only towards the provider, with no issue sync.',
        source: ours('GitHub and GitLab', GIT_FEATURE_PATH),
      },
      theirs: {
        support: 'yes',
        note: 'Pull requests and commits link to issues, issues move as the work is opened and merged, and GitHub Issues can sync both ways.',
        source: LINEAR.github,
      },
    },
    {
      group: 'agents',
      capability: 'MCP server',
      ours: {
        support: 'yes',
        note: 'Hosted over HTTP with a personal access token whose scopes narrow it. It calls the same public API as the web app.',
        source: ours('MCP manual', MCP_MANUAL),
      },
      theirs: {
        support: 'yes',
        note: 'Hosted, with OAuth or an API key. Tools find, create and update issues, projects and comments; a read-only endpoint exists.',
        source: LINEAR.mcp,
      },
    },
    {
      group: 'agents',
      capability: 'Agents you assign work to',
      ours: {
        support: 'no',
        note: 'An agent works as the person who connected it, under their name and role. It is not a member issues are assigned to.',
        source: ours('MCP manual', MCP_MANUAL),
      },
      theirs: {
        support: 'yes',
        note: 'Agents install as workspace members. Delegate an issue to one and the human assignee stays responsible for it.',
        source: LINEAR.agents,
      },
    },
    {
      group: 'hosting',
      capability: 'Self-hosting',
      ours: OUR_SELF_HOSTING,
      theirs: {
        support: 'no',
        note: 'No self-hosted edition is listed on its pricing or security pages. A workspace stores its data in the EU or the US.',
        source: LINEAR.security,
      },
    },
    {
      group: 'hosting',
      capability: 'A public plan to start on',
      ours: {
        support: 'yes',
        note: 'No subscription for any team size during beta. The first 20 members of every organisation stay free permanently.',
        source: ours('Limits and billing', LIMITS_DOC),
      },
      theirs: {
        support: 'yes',
        note: 'A Free plan with unlimited members and limits on teams and issues; paid plans lift them and add features.',
        source: LINEAR.pricing,
      },
    },
  ],
};

const KEY = 'ACME-12';
const bug = issue(KEY);
const reporter = person(bug.reporter);
const developer = assigneesOf(KEY)[0] ?? person('alex');

const historyAt = (what: string): HistoryEntry => {
  const found = HISTORY.find(entry => entry.key === KEY && entry.what.startsWith(what));
  if (!found) throw new Error(`${KEY} has no history entry starting "${what}"`);
  return found;
};

const planned = historyAt('Sprint:');
const started = historyAt('Status: Open');
const firstLog = historyAt('logged 20m');
const secondLog = historyAt('logged 1h');
const fixed = historyAt('Status: In Progress');

const loggedMinutes = (entry: HistoryEntry) =>
  Number(entry.what.match(/(\d+)h/)?.[1] ?? 0) * 60 + Number(entry.what.match(/(\d+)m/)?.[1] ?? 0);
const spentAt = (at: Moment) =>
  HISTORY.filter(entry => entry.key === KEY && entry.at <= at && entry.what.startsWith('logged ')).reduce(
    (total, entry) => total + loggedMinutes(entry),
    0,
  );

const estimate = formatDuration(bug.estimate ?? 0);
const sprint = sprintOf(KEY) ?? '';
const points = pointsOf(KEY);
const dev = developer.name.split(' ')[0] ?? developer.name;
const rep = reporter.name.split(' ')[0] ?? reporter.name;

const activityLine = (entry: HistoryEntry) => ({
  text: `${person(entry.by).name} ${entry.what.startsWith('Status:') ? `changed ${entry.what}` : entry.what}`,
  when: formatMoment(entry.at),
  iso: entry.at.replace(' ', 'T'),
});

export const STORY = {
  key: KEY,
  title: bug.title,
  type: bug.type,
  priority: bug.priority,
  reporter,
  developer,
  status: statusOf(KEY),
  sprint,
  points,
  estimate,
  due: formatDate(bug.due ?? ''),
  spent: formatDuration(spentAt(fixed.at)),
  spentShare: Math.min(100, Math.round((spentAt(fixed.at) / (bug.estimate ?? 1)) * 100)),
  agent: {
    when: formatMoment(started.at),
    prompt: `Start ${KEY} and log ${formatDuration(loggedMinutes(firstLog))} of Development on it.`,
    calls: [
      { tool: 'update_issue', args: `${KEY}, status: In Progress` },
      { tool: 'log_time', args: `${KEY}, ${formatDuration(loggedMinutes(firstLog))}, Development` },
    ],
    answer: `${KEY} is In Progress, with ${formatDuration(spentAt(firstLog.at))} of ${estimate} spent. Both changes are in its history under your name.`,
  },
  activity: [started, firstLog, secondLog, fixed].map(activityLine),
};

export interface Sourced {
  text: string;
  sources: MatrixSource[];
}

export interface WorkflowStep {
  id: string;
  title: string;
  when: string;
  ours: string;
  theirs: Sourced;
}

export const WORKFLOW: WorkflowStep[] = [
  {
    id: 'report',
    title: 'Report the bug',
    when: formatDayMonth(bug.created),
    ours: `${rep} files ${KEY}, “${bug.title}”, as a ${bug.priority} ${bug.type.toLowerCase()} with the steps in Markdown. It lands in the project’s issue list, unassigned.`,
    theirs: {
      text: 'A bug filed by another team or arriving from an integration lands in Triage, where rules and a responsible person route it. On Business and Enterprise, Triage Intelligence suggests its properties and possible duplicates.',
      sources: [LINEAR.triage],
    },
  },
  {
    id: 'plan',
    title: 'Plan it',
    when: formatDayMonth(planned.at),
    ours: `${rep} puts it in ${sprint} with ${points} story points, assigns ${developer.name}, sets a ${estimate} estimate and a due date of ${formatDayMonth(bug.due ?? '')}. Each change is a line in the issue’s history.`,
    theirs: {
      text: 'The team’s next cycle already exists, because cycles are created on a schedule, and anything left open rolls into the one after. Wider work sits in a project with milestones, under an initiative.',
      sources: [LINEAR.cycles, LINEAR.projects],
    },
  },
  {
    id: 'agent',
    title: 'Start it with an agent',
    when: formatDayMonth(started.at),
    ours: `${dev} asks an agent to start the issue and log the first ${formatDuration(loggedMinutes(firstLog))}. It calls update_issue and log_time with ${dev}’s token, so both changes are recorded as ${developer.name} and stay within ${dev}’s role.`,
    theirs: {
      text: `${dev} can delegate the issue to an installed agent, such as a coding agent, and stays its assignee. Any MCP client can also find and update the issue through Linear’s MCP server.`,
      sources: [LINEAR.agents, LINEAR.mcp],
    },
  },
  {
    id: 'fix',
    title: 'Fix it and record the time',
    when: formatDayMonth(fixed.at),
    ours: `${dev} logs ${formatDuration(loggedMinutes(secondLog))} more and moves the card to Fixed: ${formatDuration(spentAt(fixed.at))} spent against the ${estimate} estimate, on the issue, the timesheet and the time report. The merged pull request shows on the issue; with Close on merge switched on, the merge would have moved the card for ${dev}.`,
    theirs: {
      text: 'The pull request or merge request links back to the issue, which moves as the work is opened and merged. Hours go to a partner time tracker, such as Harvest, from a button in the issue sidebar.',
      sources: [LINEAR.github, LINEAR.gitlab, LINEAR.harvest],
    },
  },
];

export const LINEAR_STRENGTHS: Sourced[] = [
  {
    text: 'Product planning above the issue: projects with milestones and a timeline, initiatives that roll them up, and status updates leadership can read.',
    sources: [LINEAR.initiatives],
  },
  {
    text: 'Deeper code workflows: branch names from the issue and two-way GitHub Issues sync, beside pull and merge requests that move it.',
    sources: [LINEAR.github],
  },
  {
    text: 'Agents as teammates: delegate an issue to a coding or triage agent while a person stays responsible, plus a hosted MCP server.',
    sources: [LINEAR.agents],
  },
];

export const OUR_STRENGTHS = [
  {
    text: 'Time logs built into the issue, the timesheet and the time report, with no second service to connect.',
    href: TIME_FEATURE_PATH,
    label: 'Time tracking',
  },
  {
    text: 'One documented surface: the MCP server calls the same public API as the web app, and every tool is listed with what it changes.',
    href: MCP_TOOLS_MANUAL,
    label: 'MCP tool reference',
  },
  {
    text: 'Open code under AGPL-3.0, run as the hosted service or on your own servers from the same build.',
    href: GITHUB_URL,
    label: 'Source on GitHub',
    external: true,
  },
  {
    text: 'Five fixed roles and no permission schemes to design. An agent never does more than its person’s role allows.',
    href: PERMISSIONS_DOC,
    label: 'Permissions',
  },
];

export interface SwitchStep {
  title: string;
  body: string;
}

export const CSV_STEPS: SwitchStep[] = [
  {
    title: 'Export from Linear',
    body: 'A workspace admin exports the workspace’s issues to CSV, or anyone exports a view of the issues worth keeping.',
  },
  {
    title: 'Map the columns',
    body: 'Decide which column becomes which field: title, description, status, priority, assignee. Note any status or person with no match in Nothing Left.',
  },
  {
    title: 'Import, then review',
    body: 'Import into one project, then check a sample of issues against Linear before the team moves over.',
  },
];

export const AGENT_STEPS: SwitchStep[] = [
  {
    title: 'Connect both',
    body: 'Connect the same agent to Linear’s MCP server and to Nothing Left with a personal access token.',
  },
  {
    title: 'Agree the mapping first',
    body: 'Ask it to read your unresolved Linear issues and propose a mapping: teams to projects, workflow states to statuses, labels to tags, people to members.',
  },
  {
    title: 'Create in small batches',
    body: 'It creates the project, invites members and creates issues with their context. Attachments, full history and authorship need a person to check.',
  },
  {
    title: 'Review before you switch',
    body: 'Compare counts and spot-check issues in both, and look for duplicates. Every write is in the activity log under your name.',
  },
];

export const CHOOSE_LINEAR = [
  'You plan across many projects and quarters and want initiatives, milestones and project updates in the tracker.',
  'You want GitHub Issues kept in sync with the tracker both ways.',
  'You want to assign or delegate issues to coding and triage agents as members of the workspace.',
  'A hosted service with a choice of EU or US data storage suits you.',
];

export const CHOOSE_US = [
  'You want time logged on the issue it explains, adding up into timesheets and a time report.',
  'You want agents to work as the person who connected them, through one documented API surface.',
  'You want the source, and the option to run it on your own servers under AGPL-3.0.',
  'Sprints, a backlog, boards and five fixed roles cover how your team plans.',
];

export const LINEAR_FAQ: FaqEntry[] = [
  {
    question: 'Can we import our Linear workspace directly?',
    answer: [
      'There is no native Linear importer. Export your issues to CSV from Linear and import them with the generic CSV importer, mapping columns and reviewing before anything is written. If you connect one agent to both trackers, it can carry unresolved issues across with you reviewing the mapping.',
    ],
    link: { href: MCP_MANUAL, label: 'Connecting an agent' },
  },
  {
    question: 'Does Nothing Left connect to GitHub or GitLab like Linear does?',
    answer: [
      'Yes, for the core of it. Name the issue in a branch, a commit message or a pull request and the issue shows that work with its review and CI state. Automations move the status when a branch is created, a pull request opens or the fix merges. The connection only reads: it does not comment on pull requests or sync GitHub Issues, and deployment status is not built.',
    ],
    link: { href: GIT_FEATURE_PATH, label: 'GitHub and GitLab' },
  },
  {
    question: 'Linear has an MCP server too. What is different here?',
    answer: [
      'Both trackers publish a hosted MCP server. In Nothing Left the server is a client of the same public API as the web app, the agent acts as the person whose token it holds, and the tool reference marks each tool as reading only or changing data. Linear adds agents you can delegate issues to as workspace members.',
    ],
    link: { href: MCP_TOOLS_MANUAL, label: 'MCP tool reference' },
  },
  {
    question: 'How is time tracking different?',
    answer: [
      'In Nothing Left, time is a record on the issue: a duration, a date, a work type and a note, adding up from subtasks into the parent and into the timesheet and time report. Linear connects to partner time trackers, which keep the time entry in their own service.',
    ],
    link: { href: TIME_FEATURE_PATH, label: 'Time tracking' },
  },
  {
    question: 'Can we run it on our own servers?',
    answer: [
      'Yes. The code is AGPL-3.0 and the hosted service runs the same build. On your own install, the seat and storage limits are environment settings you choose.',
    ],
    link: { href: SELF_HOSTING_PATH, label: 'Self-hosting' },
  },
  {
    question: 'What does it cost compared with Linear?',
    answer: [
      'Nothing during beta, for any team size, and the first 20 members of every organisation stay free permanently once billing exists. Linear’s current plans are on its own pricing page; the calculator above links to it and uses only the figure you enter.',
    ],
    link: { href: PRICING_PATH, label: 'Pricing' },
  },
];

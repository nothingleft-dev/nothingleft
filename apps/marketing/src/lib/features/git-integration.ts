import {
  assigneesOf,
  developmentOf,
  formatMoment,
  issue,
  issuesInSprint,
  person,
  pullRequest,
  REPOSITORY,
  statusOf,
  type Development,
  type Moment,
  type PullRequest,
  type Status,
} from '@data/sample';
import type { FaqEntry } from '@lib/faq';

export const GIT_MANUAL_PATH = '/docs/git';
export const AUTOMATIONS_MANUAL_PATH = '/docs/automations';
export const SEARCH_MANUAL_PATH = '/docs/search';
export const LIMITS_PATH = '/docs/limits-and-billing';
export const MCP_FEATURE_PATH = '/features/mcp-ai-agents';
export const SELF_HOSTING_GUIDE_PATH = '/docs/self-hosting#connect-github-and-gitlab';

export type BadgeTone = 'green' | 'red' | 'yellow' | 'gray' | 'orange';

export const DEVELOPMENT_BADGES: Record<Development, { label: string; tone: BadgeTone }> = {
  merged: { label: 'Merged', tone: 'green' },
  ci_failing: { label: 'CI failing', tone: 'red' },
  changes_requested: { label: 'Changes requested', tone: 'red' },
  approved: { label: 'Approved', tone: 'green' },
  in_review: { label: 'In review', tone: 'yellow' },
  draft: { label: 'Draft', tone: 'gray' },
  branch_active: { label: 'Branch active', tone: 'yellow' },
  reverted: { label: 'Reverted', tone: 'orange' },
};

export const prReference = (number: number) => `${REPOSITORY}#${number}`;

const OPEN_PR = pullRequest(45);
const PANEL_KEY = OPEN_PR.issue;

export const REFERENCE_PLACES = [
  {
    where: 'A branch name',
    example: OPEN_PR.branch,
    body: 'Create the branch the way you already do. Its first push links it to the issue.',
  },
  {
    where: 'A commit message',
    example: `${PANEL_KEY}: show the inviter’s name and avatar`,
    body: 'Every pushed commit that names the key is listed on the issue, under the pull request it belongs to.',
  },
  {
    where: 'A pull request’s title or description',
    example: `Closes ${PANEL_KEY}`,
    body: 'A closing word such as Fixes, Closes or Resolves before the key marks the pull request as the one that closes the issue. Without one, it only mentions it.',
  },
];

const PR_STATE_LABELS: Record<PullRequest['state'], string> = {
  open: 'Open',
  draft: 'Draft',
  merged: 'Merged',
  closed: 'Closed',
};
const REVIEW_LABELS: Record<NonNullable<PullRequest['review']>, string> = {
  approved: 'Approved',
  changes_requested: 'Changes requested',
  review_requested: 'Review requested',
};
const CI_LABELS: Record<NonNullable<PullRequest['ci']>, string> = {
  passing: 'CI passing',
  failing: 'CI failing',
  running: 'CI running',
};

export function prFacts(pr: PullRequest) {
  return {
    reference: prReference(pr.number),
    number: pr.number,
    title: pr.title,
    author: person(pr.author),
    branch: pr.branch,
    state: PR_STATE_LABELS[pr.state],
    review: pr.review ? REVIEW_LABELS[pr.review] : null,
    ci: pr.ci ? CI_LABELS[pr.ci] : null,
    closes: pr.closes,
    commits: pr.commits,
  };
}

const panelIssue = issue(PANEL_KEY);
const panelBadge = developmentOf(PANEL_KEY);

export const PANEL = {
  key: PANEL_KEY,
  title: panelIssue.title,
  status: statusOf(PANEL_KEY),
  repository: REPOSITORY,
  badge: panelBadge ? DEVELOPMENT_BADGES[panelBadge] : null,
  pullRequest: prFacts(OPEN_PR),
};

export interface DevelopmentRow {
  key: string;
  title: string;
  status: Status;
  assignee: { name: string; initials: string } | null;
  development: { label: string; tone: BadgeTone } | null;
}

const LIST_SPRINT = 'Sprint 08';

export const SPRINT_LIST_QUERY = `sprint: {${LIST_SPRINT}} has: development sort by: key`;

const keyNumber = (key: string) => Number(key.split('-')[1]);

export const SPRINT_LIST: DevelopmentRow[] = issuesInSprint(LIST_SPRINT)
  .filter(candidate => developmentOf(candidate.key) !== null)
  .sort((a, b) => keyNumber(a.key) - keyNumber(b.key))
  .map(candidate => {
    const badge = developmentOf(candidate.key);
    const assignee = assigneesOf(candidate.key)[0];
    return {
      key: candidate.key,
      title: candidate.title,
      status: statusOf(candidate.key),
      assignee: assignee ? { name: assignee.name, initials: assignee.initials } : null,
      development: badge ? DEVELOPMENT_BADGES[badge] : null,
    };
  });

export const CI_FAILING_KEYS = SPRINT_LIST.filter(row => row.development?.label === 'CI failing').map(row => row.key);

export const SEARCH_EXAMPLES = [
  { query: 'development: {CI failing}', means: 'Issues whose pull request has a failing check' },
  { query: 'pull request: Open assignee: me', means: 'Your issues with a pull request still open' },
  { query: 'repository: acme/web #Unresolved', means: 'Open work linked to one repository' },
  { query: 'has: -development #Resolved', means: 'Resolved issues nothing in git ever named' },
];

export const TRIGGERS = [
  'Branch created',
  'Commit pushed',
  'Pull request opened',
  'Pull request ready for review',
  'Pull request merged',
  'Pull request closed',
  'Revert merged',
  'All subtasks resolved',
];

export const TEMPLATES = [
  {
    name: 'Start work on branch',
    does: 'A new branch for an issue that has not started moves it to your first started status, such as In Progress.',
  },
  {
    name: 'Review on pull request',
    does: 'A pull request marked ready for review moves the issue to In Review, if your project has that status.',
  },
  {
    name: 'Close on merge',
    does: 'Merging the pull request that closes the issue, once all its pull requests are merged, moves it to your first done status, such as Fixed.',
  },
  {
    name: 'Reopen on revert',
    does: 'A merged revert moves a done issue to Reopened.',
  },
  {
    name: 'Resolve parent when subtasks are done',
    does: 'Resolving the last open subtask moves the parent to your first done status. No repository needed.',
  },
];

function statusBefore(key: string, at: Moment): Status {
  const earlier = issue(key).status.filter(change => change.at < at);
  return earlier.at(-1)?.value ?? 'Open';
}

function botLine(rule: string, number: number) {
  const pr = pullRequest(number);
  const at = pr.merged ?? pr.opened;
  const from = statusBefore(pr.issue, at);
  const to = statusOf(pr.issue, at);
  if (from === to) throw new Error(`${pr.issue} did not change status when ${prReference(number)} merged`);
  return {
    key: pr.issue,
    at: formatMoment(at),
    text: `Nothing Left Bot · ${rule} · Status: ${from} → ${to}, because ${prReference(number)} was merged by @${pr.author}`,
  };
}

export const BOT_LINES = [botLine('Close on merge', 38), botLine('Reopen on revert', 40)];

export const RULE_FACTS = [
  {
    title: 'One rule wins',
    body: 'Rules for the same trigger run top first. The first one that changes the issue ends it, so two rules never fight over one issue.',
  },
  {
    title: 'No chains',
    body: 'A change an automation makes never fires another rule. Resolve the last subtask by hand and the parent moves; let a merge resolve it and the parent stays.',
  },
  {
    title: 'A dry run first',
    body: 'Test a rule on one issue and read what it would do now, or why it would leave the issue alone. Nothing changes.',
  },
  {
    title: 'A run log',
    body: 'Every time a rule looked at an issue: what it changed, or why it did not. Kept for 90 days.',
  },
];

const merged = prFacts(pullRequest(42));
const mergedAt = pullRequest(42).merged ?? '';

export const AGENT = {
  prompt: `Did ${pullRequest(42).issue} merge? Is anything still open for it?`,
  call: { tool: 'get_issue_development', args: `issue: "${pullRequest(42).issue}"` },
  answer: `Yes. ${merged.reference} ${merged.title} was merged into main by ${merged.author.name} on ${formatMoment(mergedAt)}, approved and with CI passing. It closes ${pullRequest(42).issue}, which is ${statusOf(pullRequest(42).issue)}. No other pull request or branch is open for it.`,
};

export const AGENT_TOOLS = [
  { tool: 'get_issue_development', does: 'Branches, commits and pull requests for one issue, with review and CI.' },
  { tool: 'link_pull_request', does: 'Link a pull request that never named the issue, by its address.' },
  { tool: 'list_automations', does: 'The project’s rules, in the order they run.' },
  { tool: 'test_automation', does: 'A dry run of one rule on one issue.' },
  { tool: 'list_automation_runs', does: 'What each rule did, and why it skipped.' },
];

export const LIMITS = [
  { limit: 'Connected GitHub or GitLab accounts', value: '2 per organisation' },
  { limit: 'Linked repositories', value: '10 per project' },
  { limit: 'Automations', value: '10 per project' },
];

export const NOT_BUILT = [
  'Deployment status. Nothing reports which release or environment a change reached.',
  'Writing back to the provider. No comments on pull requests, no commit statuses, nothing pushed.',
  'Bitbucket. GitHub and GitLab only, including GitHub Enterprise and self-managed GitLab.',
  'A general rules engine. An automation sets a status, from a fixed list of git and subtask triggers.',
];

export const GIT_INTEGRATION_FAQ: FaqEntry[] = [
  {
    question: 'Does it change anything in our repositories?',
    answer: [
      'No. A connection only reads: it does not comment on pull requests, set commit statuses or push. Everything it learns comes from the provider’s webhooks and, when you first link a repository, the open pull requests and those updated in the last 90 days.',
    ],
    link: { href: GIT_MANUAL_PATH, label: 'Development in the manual' },
  },
  {
    question: 'Which providers and hosts work?',
    answer: [
      'GitHub through the GitHub App, or with a webhook you add yourself, and GitLab with a group or project access token. GitHub Enterprise and self-managed GitLab work at their own address. Bitbucket is not supported.',
    ],
  },
  {
    question: 'Do we have to turn automations on?',
    answer: [
      'Yes. The templates are offered and never switched on for you, and a project with no linked repository shows nothing about git at all. Each automation belongs to a project, and Project Admins create and change them.',
    ],
    link: { href: AUTOMATIONS_MANUAL_PATH, label: 'Automations in the manual' },
  },
  {
    question: 'How do we know an automation changed an issue?',
    answer: [
      'The change is in the issue’s history from Nothing Left Bot, with the rule’s name and the cause: which pull request, merged by whom. The run log also records each time a rule left an issue alone, and why.',
    ],
  },
  {
    question: 'Whose name is on a commit or pull request?',
    answer: [
      'A member’s, when the server can tell: their GitHub sign-in, a commit email they verified, or a login they claimed in their account settings. Otherwise the provider’s login shows, marked as not linked to a member.',
    ],
  },
  {
    question: 'What are the limits?',
    answer: [
      'On the hosted beta, each organisation connects up to 2 GitHub or GitLab accounts, and each project links up to 10 repositories and keeps up to 10 automations.',
    ],
    link: { href: LIMITS_PATH, label: 'Limits and billing' },
  },
];

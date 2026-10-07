import {
  article,
  formatDate,
  formatDayMonth,
  issue,
  person,
  pointsOf,
  resolvedAt,
  sprint,
  sprintOf,
  sprintSummary,
  statusOf,
  NOW,
  articleUri,
  type Moment,
} from '@data/sample';
import type { FaqEntry } from '@lib/faq';

export const SEARCH_FEATURE_PATH = '/features/search-saved-views';
export const ISSUES_FEATURE_PATH = '/features/issue-tracking';
export const KB_FEATURE_PATH = '/features/project-knowledge-base';
export const REPORTS_FEATURE_PATH = '/features/project-reports';
export const SPRINTS_FEATURE_PATH = '/features/sprints-kanban-boards';

export type IssueType = 'Bug' | 'Feature' | 'Task';
export type Priority = 'Major' | 'Normal' | 'Minor';
export type Impact = 'High' | 'Medium' | 'Low';
export type GroupBy = 'impact' | 'priority';

export interface Candidate {
  key: string;
  title: string;
  type: IssueType;
  priority: Priority;
  impact: Impact | null;
  points: number;
  picked: boolean;
}

export const IMPACT_OPTIONS: Impact[] = ['High', 'Medium', 'Low'];
export const IMPACT_EMPTY_LABEL = 'Not triaged';
export const PRIORITY_ORDER: Priority[] = ['Major', 'Normal', 'Minor'];

export const VIEW = {
  name: 'Invitation feedback',
  query: 'tag: invitations sprint: {No sprint} #Unresolved sort by: impact, priority',
};

const SPRINT_NAME = 'Sprint 08';

export const SPRINT = {
  name: SPRINT_NAME,
  goal: sprint(SPRINT_NAME).goal ?? '',
  ends: formatDate(sprint(SPRINT_NAME).end),
};

// The planning meeting, just before the picks were moved into the sprint.
export const PLANNED_AT: Moment = '2026-10-03 10:00';
export const PLANNING_DAY = formatDate(PLANNED_AT);

interface Pick {
  key: string;
  impact: Impact | null;
  picked: boolean;
}

// Impact is this team's own field; `picked` is the finished state the markup carries, and the script starts the visitor from an empty sprint.
const PICKS: Pick[] = [
  { key: 'ACME-12', impact: 'High', picked: true },
  { key: 'ACME-15', impact: 'High', picked: true },
  { key: 'ACME-14', impact: 'Medium', picked: true },
  { key: 'ACME-18', impact: 'Medium', picked: false },
  { key: 'ACME-16', impact: 'Low', picked: false },
  { key: 'ACME-19', impact: null, picked: false },
];

export const CANDIDATES: Candidate[] = PICKS.map(pick => {
  const found = issue(pick.key);
  if (pick.picked !== (sprintOf(pick.key) === SPRINT_NAME))
    throw new Error(`${pick.key} is picked only if it is in ${SPRINT_NAME}`);
  return {
    key: pick.key,
    title: found.title,
    type: found.type as IssueType,
    priority: found.priority as Priority,
    impact: pick.impact,
    points: pointsOf(pick.key) ?? 0,
    picked: pick.picked,
  };
});

export const impactLabel = (impact: Impact | null) => impact ?? IMPACT_EMPTY_LABEL;

export interface CandidateGroup {
  label: string;
  issues: Candidate[];
}

export function groupCandidates(by: GroupBy): CandidateGroup[] {
  const labels: string[] =
    by === 'impact' ? [...IMPACT_OPTIONS, IMPACT_EMPTY_LABEL] : PRIORITY_ORDER.map(priority => priority);
  return labels
    .map(label => ({
      label,
      issues: CANDIDATES.filter(issue => (by === 'impact' ? impactLabel(issue.impact) : issue.priority) === label),
    }))
    .filter(group => group.issues.length > 0);
}

export const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export const PICKED = CANDIDATES.filter(issue => issue.picked);
export const PICKED_POINTS = PICKED.reduce((sum, issue) => sum + issue.points, 0);

const summary = sprintSummary(SPRINT_NAME);
export const BURNDOWN_CHECK = {
  scope: summary.scope,
  added: summary.added,
  remaining: summary.remaining,
  on: formatDate(NOW),
};

const decision = article('invitation-links-and-expiry');
const lead = issue(decision.references[0] ?? '');
const waiting = CANDIDATES.filter(candidate => !candidate.picked).sort((a, b) => b.points - a.points)[0];

export const STORY = {
  lead: { key: lead.key, title: lead.title, reporter: person(lead.reporter), status: statusOf(lead.key, PLANNED_AT) },
  others: CANDIDATES.length - 1,
  decision: {
    title: decision.title,
    author: person(decision.author),
    updatedBy: person(decision.updatedBy).name,
    decided: formatDate(decision.decided ?? decision.published),
    updated: `${decision.folder} · ACME · updated ${formatDate(decision.updated)}`,
  },
  waiting: waiting && { key: waiting.key, points: waiting.points, sprint: sprintOf(waiting.key) },
  fixed: formatDayMonth(resolvedAt(lead.key) ?? NOW),
};

export interface WorkflowStep {
  title: string;
  body: string;
  detail: string;
  link: { href: string; label: string };
}

export const WORKFLOW: WorkflowStep[] = [
  {
    title: 'Start from feedback already filed',
    body: 'Whoever hears it first files it as an issue, with a type and a tag for the area it touches. One list is easier to compare than five inboxes.',
    detail: 'tag: invitations #Unresolved',
    link: { href: ISSUES_FEATURE_PATH, label: 'Issue tracking' },
  },
  {
    title: 'Group by priority or your own field',
    body: 'Priority is built in. Impact here is a select field the team added in Project settings, so its options mean what you agreed they mean.',
    detail: `${groupCandidates('impact')
      .map(group => `${group.label} ${group.issues.length}`)
      .join(' · ')}`,
    link: { href: ISSUES_FEATURE_PATH, label: 'Custom fields' },
  },
  {
    title: 'Save the view for the meeting',
    body: 'Save the search under a name and share it with the project. Everyone opens the same list, and a report can be scoped to it.',
    detail: '#{Invitation feedback}',
    link: { href: SEARCH_FEATURE_PATH, label: 'Search and saved views' },
  },
  {
    title: 'Move the picks into the sprint',
    body: 'On the Backlog page, drag each chosen issue into the planned sprint, or use Space and the arrow keys on its grip.',
    detail: `${SPRINT.name} · ${plural(PICKED.length, 'issue')} · ${PICKED_POINTS} points from the view`,
    link: { href: SPRINTS_FEATURE_PATH, label: 'Sprints and boards' },
  },
  {
    title: 'Check delivery against the plan',
    body: 'The burndown draws scope added after the start as its own line. Average issue age, grouped by Impact, names the oldest open issue in each group.',
    detail: `${BURNDOWN_CHECK.remaining} of ${BURNDOWN_CHECK.scope} points left · ${BURNDOWN_CHECK.added} added after the start`,
    link: { href: REPORTS_FEATURE_PATH, label: 'Project reports' },
  },
  {
    title: 'Write the decision beside the issues',
    body: 'A decision record in the project’s knowledge base names the issue keys. Each issue then lists it under Referenced by.',
    detail: articleUri(decision.slug),
    link: { href: KB_FEATURE_PATH, label: 'Knowledge base' },
  },
];

export const FIT_POINTS = [
  {
    title: 'Prioritization you can explain.',
    body: 'Priority is a list the project defines; add a field such as Impact for the second question. Group and sort by either, save the list as a view, and scope a report to it.',
    link: { href: SEARCH_FEATURE_PATH, label: 'Search and saved views' },
  },
  {
    title: 'Traceability from issue to reason.',
    body: 'A decision record names the keys, each issue lists it under Referenced by, and a resolved key is struck through in the text. A change such as Impact: Medium → High lands in the issue’s history with who and when.',
    link: { href: ISSUES_FEATURE_PATH, label: 'Issue tracking' },
  },
  {
    title: 'Clear ownership of the plan.',
    body: 'Each issue has its assignees and sits in one sprint at a time. Project Admins plan, start and finish sprints; Contributors move issues in and out; every move is recorded under whoever made it.',
    link: { href: SPRINTS_FEATURE_PATH, label: 'Sprints and boards' },
  },
  {
    title: 'Private project context.',
    body: 'Issues and articles are readable only by the project’s members. Stakeholders who only need to read can join as Observers: they read published articles and issues, and can star, watch and vote.',
    link: { href: KB_FEATURE_PATH, label: 'Knowledge base' },
  },
];

export const PRODUCT_TEAMS_FAQ: FaqEntry[] = [
  {
    question: 'Is there a roadmap view?',
    answer: [
      'Not a roadmap editor. Sprints plan the next few weeks, and the Gantt report draws a project’s issues from start date to due date, with an arrow for each depends-on link. It is a report: you change dates on the issues, and an issue missing either date is listed under the chart. There are no portfolio initiatives or roadmaps that span many products.',
    ],
    link: { href: REPORTS_FEATURE_PATH, label: 'Project reports' },
  },
  {
    question: 'Does it score or rank feature requests?',
    answer: [
      'No. Priority is a list your project defines, and fields such as Impact are ones you add. You can group and sort by them, and a report can count them, but nothing calculates a score or reorders the backlog for you. The order is whatever the team drags it into.',
    ],
  },
  {
    question: 'Can customers submit requests or vote on them?',
    answer: [
      'Not from outside. There is no public portal or request form: issues are filed by members of the organisation. Members of a project can vote for an issue, one vote each, with the count shown on the issue. Treat it as a signal for the conversation, not a ranking.',
    ],
  },
  {
    question: 'Can we share a decision record with customers?',
    answer: [
      'No. The knowledge base is private to the project: a published article is readable by every member, Observers included, and by nobody else. There is no public page or share link. Add a stakeholder as an Observer when they need to read along.',
    ],
    link: { href: KB_FEATURE_PATH, label: 'Knowledge base' },
  },
  {
    question: 'How does this work across several products?',
    answer: [
      'Give each product a project with its own sprints, fields and knowledge base. A sprint belongs to one project, but search and reports can cover several projects at once, and a view shared with the organisation gives every member the same list. Two projects can share a field slug, so impact: High searches both.',
    ],
  },
  {
    question: 'Can an AI agent help prepare the planning meeting?',
    answer: [
      'Yes, with your permissions and nothing more. It can run the saved view by name, count the result by a custom field, read the decision record and move an issue into a sprint. It does not decide what goes in; it saves you the gathering.',
    ],
    link: { href: '/features/mcp-ai-agents', label: 'MCP and AI agents' },
  },
];

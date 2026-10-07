import {
  assigneesOf,
  isResolved as isResolvedStatus,
  issue as sampleIssue,
  PEOPLE as SAMPLE_PEOPLE,
  statusOf,
  type Handle,
  type Moment,
  type Status,
} from '@data/sample';
import type { FaqEntry } from '@lib/faq';

export const SEARCH_MANUAL_PATH = '/docs/manual/search';

export type IssueType = 'Bug' | 'Feature' | 'Task';
export type Priority = 'Critical' | 'Major' | 'Normal' | 'Minor';
export type Username = Handle;

export interface Person {
  name: string;
  initials: string;
}

export const PEOPLE: Record<Username, Person> = Object.fromEntries(
  SAMPLE_PEOPLE.map(who => [who.handle, { name: who.name, initials: who.initials }]),
) as Record<Username, Person>;

export const SIGNED_IN: Username = 'alex';

export interface SampleIssue {
  key: string;
  title: string;
  type: IssueType;
  priority: Priority;
  assignee: Username | null;
  status: Status;
}

// The search demos run on 7 Oct, while ACME-12 is in progress and its subtask still open.
export const SEARCHED_AT: Moment = '2026-10-07 11:00';
const SHOWN_KEYS = [
  'ACME-15',
  'ACME-14',
  'ACME-13',
  'ACME-12',
  'ACME-11',
  'ACME-10',
  'ACME-9',
  'ACME-8',
  'ACME-7',
  'ACME-6',
  'ACME-5',
];

export const ISSUES: SampleIssue[] = SHOWN_KEYS.map(key => {
  const found = sampleIssue(key);
  return {
    key,
    title: found.title,
    type: found.type as IssueType,
    priority: found.priority,
    assignee: assigneesOf(key, SEARCHED_AT)[0]?.handle ?? null,
    status: statusOf(key, SEARCHED_AT),
  };
});

export const isResolved = (issue: SampleIssue) => isResolvedStatus(issue.status);

export const issueByKey = (key: string): SampleIssue => {
  const issue = ISSUES.find(candidate => candidate.key === key);
  if (!issue) throw new Error(`${key} is not in the sample data`);
  return issue;
};

export const PRIORITIES: Priority[] = ['Critical', 'Major', 'Normal', 'Minor'];
export const TYPE_CHOICES = ['any', 'Bug', 'Feature', 'Task'] as const;
export type TypeChoice = (typeof TYPE_CHOICES)[number];

// '@jordn' is the deliberate typo that shows the refusal and its suggestions.
export const ASSIGNEE_CHOICES = ['anyone', 'me', 'Unassigned', '@casey', '@jordan', '@jordn'] as const;
export const ASSIGNEE_VALID_VALUES = ['@alex', '@casey', '@jordan', '@sam'];

export interface BuilderState {
  type: TypeChoice;
  priorities: Priority[];
  assignee: string;
  unresolved: boolean;
}

export const DEFAULT_STATE: BuilderState = { type: 'Bug', priorities: [], assignee: 'me', unresolved: true };

export interface QueryProblem {
  value: string;
  attribute: string;
  message: string;
  validValues: string[];
}

export interface QueryResult {
  query: string;
  problem: QueryProblem | null;
  issues: SampleIssue[];
}

const assigneeUsername = (value: string): Username | null | undefined => {
  if (value === 'me') return SIGNED_IN;
  if (value === 'Unassigned') return null;
  const name = value.replace(/^@/, '');
  return name in PEOPLE ? (name as Username) : undefined;
};

export function buildQuery(state: BuilderState): string {
  const clauses: string[] = [];
  if (state.type !== 'any') clauses.push(`type: ${state.type}`);
  if (state.unresolved) clauses.push('#Unresolved');
  const priorities = PRIORITIES.filter(priority => state.priorities.includes(priority));
  if (priorities.length > 0) clauses.push(`priority: ${priorities.join(', ')}`);
  if (state.assignee !== 'anyone') clauses.push(`assignee: ${state.assignee}`);
  return clauses.join(' ');
}

export function runQuery(state: BuilderState): QueryResult {
  const query = buildQuery(state);
  const username = state.assignee === 'anyone' ? undefined : assigneeUsername(state.assignee);
  if (state.assignee !== 'anyone' && username === undefined) {
    return {
      query,
      issues: [],
      problem: {
        value: state.assignee,
        attribute: 'assignee',
        message: `${state.assignee} is not a valid value for assignee.`,
        validValues: ASSIGNEE_VALID_VALUES,
      },
    };
  }
  const issues = ISSUES.filter(
    issue =>
      (state.type === 'any' || issue.type === state.type) &&
      (!state.unresolved || !isResolved(issue)) &&
      (state.priorities.length === 0 || state.priorities.includes(issue.priority)) &&
      (state.assignee === 'anyone' || issue.assignee === username),
  );
  return { query, issues, problem: null };
}

const TYPE_NOUNS: Record<TypeChoice, string> = { any: 'issues', Bug: 'bugs', Feature: 'features', Task: 'tasks' };

export function viewName(state: BuilderState): string {
  const words: string[] = [];
  if (state.assignee === 'me') words.push('my');
  else if (state.assignee === 'Unassigned') words.push('unassigned');
  if (state.unresolved) words.push('open');
  const priorities = PRIORITIES.filter(priority => state.priorities.includes(priority)).map(p => p.toLowerCase());
  if (priorities.length > 0) words.push(priorities.join(' and '));
  words.push(TYPE_NOUNS[state.type]);
  const username = assigneeUsername(state.assignee);
  if (state.assignee.startsWith('@') && username) words.push(`for ${PEOPLE[username].name.split(' ')[0]}`);
  const name = words.join(' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export const issuesAddress = (query: string) => `/issues${query ? `?${new URLSearchParams({ q: query })}` : ''}`;
export const reportAddress = (query: string) =>
  `/reports/issues-per-assignee${query ? `?${new URLSearchParams({ q: query })}` : ''}`;

export const ASSIGNEE_BUCKETS: (Username | null)[] = ['alex', 'casey', 'sam', 'jordan', null];

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

export const perAssignee = (issues: SampleIssue[]) =>
  ASSIGNEE_BUCKETS.map(bucket => ({
    bucket,
    label: bucket ? PEOPLE[bucket].name : 'Unassigned',
    count: issues.filter(issue => issue.assignee === bucket).length,
  }));

export const countLabel = (count: number) => `${count} ${count === 1 ? 'issue' : 'issues'}`;

export const SEARCH_VIEWS_FAQ: FaqEntry[] = [
  {
    question: 'Do we have to learn a query language first?',
    answer: [
      'No. As you type, autocomplete offers attributes, values, saved views and recent searches, and Tab accepts the first suggestion. Words that are not filters search titles and descriptions. The syntax is there when you want precision, and the whole grammar fits on one manual page.',
    ],
    link: { href: SEARCH_MANUAL_PATH, label: 'Search manual' },
  },
  {
    question: 'Is this semantic or AI search?',
    answer: [
      'No. Filters match the names you see, such as statuses, people, tags and sprints, and free text is full-text search over titles and descriptions. Nothing is inferred, so a query means the same thing in the search bar, a report and an agent call.',
    ],
  },
  {
    question: 'Who can see a saved view?',
    answer: [
      'You choose when you save it: only you, everyone who can open one project, or the whole organisation. Anyone can keep private views; Contributors and Project Admins can share one with their project; anyone who is a Contributor somewhere can share one with the organisation. Whoever runs a shared view still sees only issues in projects they can open.',
    ],
  },
  {
    question: 'Can we search custom fields?',
    answer: [
      'Yes. Every custom field is an attribute named by its slug, such as severity: High or launch: {This month}, and its values follow the field’s type. Select options also answer the # shortcut, and the issue list can group by select, user and checkbox fields.',
    ],
  },
  {
    question: 'Can we export what a search finds?',
    answer: [
      'Yes. Export to CSV downloads the list exactly as searched and sorted, up to 10,000 issues, with the columns you choose. A report exports the numbers on screen, and both leave out anything you could not open yourself.',
    ],
  },
  {
    question: 'How does an agent use search?',
    answer: [
      'search_issues takes the same query as the search bar and returns a table. suggest_query gives the agent autocomplete, and search returns issues and articles in two groups, like the search box. Saved views are reachable by name, both as tools and as a view:// resource.',
    ],
    link: { href: '/features/mcp-ai-agents', label: 'MCP and AI agents' },
  },
];

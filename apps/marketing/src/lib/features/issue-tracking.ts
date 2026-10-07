import type { FaqEntry } from '@lib/faq';

export const ISSUES_MANUAL_PATH = '/docs/manual/issues';
export const CUSTOM_FIELDS_MANUAL_PATH = '/docs/manual/custom-fields';

export interface SampleRow {
  key: string;
  title: string;
  priority: { name: string; letter: string; className: string };
  assignee?: { initials: string; name: string };
  spent?: string;
  status: { name: string; dot?: 'started' | 'done' };
}

const MAJOR = { name: 'Major', letter: 'M', className: 'l-major' };
const CRITICAL = { name: 'Critical', letter: 'C', className: 'l-critical' };
const NORMAL = { name: 'Normal', letter: 'N', className: 'l-normal' };

export const SAMPLE_ISSUE: SampleRow = {
  key: 'ACME-12',
  title: 'Invite link blank after it expires',
  priority: MAJOR,
  assignee: { initials: 'AL', name: 'Alex Lee' },
  spent: '1h 45m',
  status: { name: 'Fixed', dot: 'done' },
};

export const BUG_LIST: SampleRow[] = [
  SAMPLE_ISSUE,
  {
    key: 'ACME-9',
    title: 'Upload stalls at 100% on slow links',
    priority: MAJOR,
    status: { name: 'Open' },
  },
  {
    key: 'ACME-8',
    title: 'Saved view count is stale',
    priority: NORMAL,
    assignee: { initials: 'SO', name: 'Sam Ortiz' },
    spent: '45m',
    status: { name: 'Reopened' },
  },
  {
    key: 'ACME-7',
    title: 'Burndown ignores late additions',
    priority: CRITICAL,
    assignee: { initials: 'CK', name: 'Casey Kim' },
    spent: '30m',
    status: { name: 'In Progress', dot: 'started' },
  },
];

export const OTHER_CRITICAL_BUGS: SampleRow[] = BUG_LIST.filter(row => row.key === 'ACME-9' || row.key === 'ACME-7');

export interface HistoryEntry {
  who: string;
  what: string;
  when: string;
}

export const HISTORY: HistoryEntry[] = [
  { who: 'Casey Kim', what: 'created the issue', when: '2 Oct 2026, 9:05am' },
  {
    who: 'Casey Kim',
    what: 'Assignee: Unassigned → Alex Lee, Estimation: 2h, Due date: 9 Oct 2026',
    when: '3 Oct 2026, 10:14am',
  },
  { who: 'Alex Lee', what: 'Severity: High → Critical', when: '5 Oct 2026, 11:30am' },
  { who: 'Alex Lee', what: 'linked: depends on ACME-4', when: '5 Oct 2026, 11:32am' },
  { who: 'Alex Lee', what: 'created subtask ACME-13', when: '5 Oct 2026, 11:34am' },
  { who: 'Alex Lee', what: 'Status: Open → In Progress', when: '6 Oct 2026, 9:20am' },
  { who: 'Alex Lee', what: 'attached invite-expired.log', when: '6 Oct 2026, 2:12pm' },
  { who: 'Alex Lee', what: 'logged 1h 25m, Development', when: '8 Oct 2026, 4:38pm' },
  { who: 'Alex Lee', what: 'Status: In Progress → Fixed', when: '8 Oct 2026, 4:40pm' },
];

export interface WorkflowStep {
  title: string;
  body: string;
  record: string;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    title: 'Casey files the bug.',
    body: 'Only a title is required. Status, priority and type start at the project’s defaults, so Casey writes the steps to reproduce in Markdown and raises the priority to Major.',
    record: 'Casey Kim created ACME-12 · Bug · Open · Major',
  },
  {
    title: 'Alex takes it.',
    body: 'Assignee, estimate and due date saved together make one history entry. Being assigned makes Alex a watcher, so new comments and status changes reach Alex’s inbox.',
    record: 'Assignee: Unassigned → Alex Lee · Estimation: 2h · Due date: 9 Oct 2026',
  },
  {
    title: 'It gets a subtask and a dependency.',
    body: 'Create subtask files ACME-13 under it. A depends on link to ACME-4 shows on both issues, in both histories, and can never loop back on itself.',
    record: 'ACME-12 parent for ACME-13 · depends on ACME-4',
  },
  {
    title: 'The log goes on the issue.',
    body: 'Drop the file onto the editor or paste a screenshot. Files are private: a link opens only for someone signed in who can open the issue.',
    record: 'Alex Lee attached invite-expired.log',
  },
  {
    title: 'The reproduction is discussed in place.',
    body: 'A comment mentions @casey, who is told in the inbox. ACME-4 typed in the text becomes a link, struck through once that issue is resolved.',
    record: '@casey reproduced with a ten-day-old link. The fix waits on ACME-4.',
  },
  {
    title: 'It is resolved, with the record intact.',
    body: 'Fixed is a done status, so the issue is marked resolved and the time recorded. Casey, who filed it, hears that it was resolved.',
    record: 'Status: In Progress → Fixed · resolved 8 Oct 2026, 4:40pm',
  },
];

export const DEFAULT_LISTS = [
  {
    list: 'Statuses',
    values: 'Submitted, Open, In Progress, Reopened, Can’t Reproduce, Duplicate, Fixed, Won’t fix, Obsolete, Closed',
  },
  { list: 'Priorities', values: 'Show-stopper, Critical, Major, Normal, Minor' },
  { list: 'Types', values: 'Bug, Feature, Task, Epic' },
];

export const SEVERITY_OPTIONS = ['Low', 'High', 'Critical'] as const;
export const SEVERITY_DEFAULT_VALUE = 'Critical';

export const SEVERITY_FIELD = [
  { term: 'Name', detail: 'Severity, renamed whenever you like' },
  { term: 'Slug', detail: 'severity, the name search uses; it never changes' },
  { term: 'Type', detail: 'Select, with Low, High and Critical' },
  { term: 'Applies to', detail: 'Bug only, so it never clutters an Epic' },
  { term: 'Required', detail: 'Yes, with High as the default' },
  { term: 'Empty label', detail: 'No Severity' },
];

export const CONNECTIONS = [
  {
    title: 'On the sprint board.',
    body: 'Planned into Sprint 08 with 3 story points, ACME-12 is a card with its key, title, priority, people, points and subtask progress. On a board by status, moving the card changes its status.',
    record: 'Sprint 08 · ACME-12 · 3 points · 1/1 subtasks done',
    href: '/features/sprints-kanban-boards',
    label: 'Sprints and boards',
  },
  {
    title: 'In the reports.',
    body: 'Issues per field, grouped by Severity, counts ACME-12 under Critical. Click the bar and the issue list opens with exactly the issues it counted.',
    record: 'Issues per field · Severity · Critical 3',
    href: '/features/project-reports',
    label: 'Project reports',
  },
  {
    title: 'Beside the decision.',
    body: 'The knowledge base article on invitation expiry mentions ACME-12, so the issue lists it under Referenced by. Whoever picks the bug up finds the reasoning.',
    record: 'article://ACME/invitation-links-and-expiry → ACME-12',
    href: '/features/project-knowledge-base',
    label: 'Knowledge base',
  },
  {
    title: 'In your agent.',
    body: 'Through MCP an agent reads, files and updates issues with the same keys, names and permission checks as the app, and every change is recorded under your name.',
    record: 'get_issue · search_issues · get_issue_activity',
    href: '/features/mcp-ai-agents',
    label: 'MCP and AI agents',
  },
];

export const ROLES = [
  {
    role: 'Observer',
    can: 'Reads the project’s issues, comments and files. Stars, watches and votes. Changes nothing.',
  },
  {
    role: 'Contributor',
    can: 'Creates and edits issues, comments, links, attaches files, logs time and sets custom field values.',
  },
  {
    role: 'Project Admin',
    can: 'Also deletes and restores issues, edits anyone’s comments and shapes the project’s lists and fields.',
  },
  { role: 'Org Admin', can: 'Project Admin on every project in the organisation, plus members and settings.' },
  { role: 'Org Owner', can: 'Everything an Org Admin can, plus transferring ownership.' },
];

export const ISSUE_TRACKING_FAQ: FaqEntry[] = [
  {
    question: 'Do we have to set up a workflow before filing the first bug?',
    answer: [
      'No. A new project starts with statuses, priorities and types you can use straight away, and a Project Admin edits them as lists. There are no transition rules: any status can follow any status. Moving an issue into a done or cancelled status marks it resolved.',
    ],
    link: { href: ISSUES_MANUAL_PATH, label: 'Statuses and resolution' },
  },
  {
    question: 'How do custom fields fit into search and export?',
    answer: [
      'Each field has a slug that search uses, such as severity: Critical. You can sort and group the issue list by it, add it as a column, count it in a report and include it in the CSV export. A project can have up to 50 active fields, in 13 types from text and dates to people and durations.',
    ],
    link: { href: CUSTOM_FIELDS_MANUAL_PATH, label: 'Custom fields' },
  },
  {
    question: 'What happens if someone deletes an issue by mistake?',
    answer: [
      'Only Project Admins can delete an issue, and they are asked to confirm. For 14 days it can be restored from the Undo that follows or from the project’s list of deleted issues. After that it is removed for good with its comments, time entries, attachments and history.',
    ],
  },
  {
    question: 'Can we bring our existing issues across?',
    answer: [
      'Issues export to CSV today, with the columns you choose. Generic CSV import arrives at launch. There is no native importer from another tracker; an agent connected to both trackers can help carry issues across, with you reviewing how people and fields map.',
    ],
    link: { href: '/features/mcp-ai-agents', label: 'Moving with an agent' },
  },
  {
    question: 'Who can open the files attached to an issue?',
    answer: [
      'Only people signed in who can open the issue. A file link pasted into a chat does not open for anyone else, and stops working for someone who loses access. A file can be up to 100 MB, and an issue can hold 50.',
    ],
  },
  {
    question: 'What happens to issues when someone leaves?',
    answer: [
      'Everything they did keeps their real name and picture, with a small Former member label. You can still search for their work, but they are no longer offered when you assign or mention someone.',
    ],
  },
];

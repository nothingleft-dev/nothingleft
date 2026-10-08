import { firstName, formatDate, issue } from '@data/sample';
import type { FaqEntry } from '@lib/faq';

export const LIMITS_PATH = '/docs/limits-and-billing';
export const MCP_MANUAL_PATH = '/docs/mcp';

export interface FirstRunStep {
  id: string;
  title: string;
  detail: string;
}

export const FIRST_RUN_STEPS: FirstRunStep[] = [
  {
    id: 'sign-up',
    title: 'Sign up',
    detail: 'Google, GitHub or an email address, then confirm your name and time zone.',
  },
  {
    id: 'organisation',
    title: 'Name the organisation',
    detail: `${firstName(issue('ACME-1').reporter)} types Acme. The ID is derived from the name and can be edited.`,
  },
  {
    id: 'project',
    title: 'Create the first project',
    detail: 'The one step that cannot be skipped. The key comes from the name.',
  },
  {
    id: 'invite',
    title: 'Invite people, or skip',
    detail: 'Skip for now sits in plain sight, for anyone trying it alone.',
  },
  {
    id: 'empty',
    title: 'Land on the issue list',
    detail: 'Empty, with Connect an agent level with Create issue.',
  },
  {
    id: 'issues',
    title: 'File the first issues',
    detail: 'A title is enough. Open, Normal and Bug fill themselves in.',
  },
];

export const WELCOME_RAIL = [
  { title: 'Your profile', body: 'Confirm your name and time zone.' },
  { title: 'Organisation', body: 'Name your team’s workspace.' },
  { title: 'First project', body: 'Create a place to track work.' },
  { title: 'Invite people', body: 'Add teammates, or skip for now.' },
];

export type StatusCategory = 'backlog' | 'unstarted' | 'started' | 'done' | 'cancelled';

export interface DefaultStatus {
  name: string;
  category: StatusCategory;
  isDefault?: true;
}

export const DEFAULT_STATUSES: DefaultStatus[] = [
  { name: 'Submitted', category: 'backlog' },
  { name: 'Open', category: 'unstarted', isDefault: true },
  { name: 'In Progress', category: 'started' },
  { name: 'Reopened', category: 'unstarted' },
  { name: 'Can’t Reproduce', category: 'cancelled' },
  { name: 'Duplicate', category: 'cancelled' },
  { name: 'Fixed', category: 'done' },
  { name: 'Won’t fix', category: 'cancelled' },
  { name: 'Obsolete', category: 'cancelled' },
  { name: 'Closed', category: 'done' },
];

export function isResolved(category: StatusCategory): boolean {
  return category === 'done' || category === 'cancelled';
}

export function statusDot(category: StatusCategory): 'started' | 'done' | undefined {
  if (category === 'started') return 'started';
  if (category === 'done') return 'done';
  return undefined;
}

export interface LabelValue {
  name: string;
  letter: string;
  tone: string;
  isDefault?: true;
}

export const DEFAULT_PRIORITIES: LabelValue[] = [
  { name: 'Show-stopper', letter: 'S', tone: 'red' },
  { name: 'Critical', letter: 'C', tone: 'critical' },
  { name: 'Major', letter: 'M', tone: 'major' },
  { name: 'Normal', letter: 'N', tone: 'normal', isDefault: true },
  { name: 'Minor', letter: 'M', tone: 'gray' },
];

export const DEFAULT_TYPES: LabelValue[] = [
  { name: 'Bug', letter: 'B', tone: 'bug', isDefault: true },
  { name: 'Feature', letter: 'F', tone: 'blue' },
  { name: 'Task', letter: 'T', tone: 'gray' },
  { name: 'Epic', letter: 'E', tone: 'pink' },
];

export const DEFAULT_WORK_TYPES = [
  'Development',
  'Documentation',
  'Implementation',
  'Investigation',
  'Maintenance',
  'Observation',
  'Testing',
];

export const DEFAULT_BOARD_COLUMNS: { name: string; categories: StatusCategory[] }[] = [
  { name: 'To do', categories: ['backlog', 'unstarted'] },
  { name: 'In progress', categories: ['started'] },
  { name: 'Done', categories: ['done', 'cancelled'] },
];

export function statusesIn(categories: StatusCategory[]): string[] {
  return DEFAULT_STATUSES.filter(status => categories.includes(status.category)).map(status => status.name);
}

export interface FirstIssue {
  key: string;
  title: string;
  type: string;
  typeTone: string;
  typeLetter: string;
  created: string;
}

const TYPE_LOOK: Record<string, { tone: string; letter: string }> = {
  Bug: { tone: 'bug', letter: 'B' },
  Feature: { tone: 'blue', letter: 'F' },
  Task: { tone: 'gray', letter: 'T' },
  Epic: { tone: 'pink', letter: 'E' },
};

// Only ACME-3 had a field changed from the defaults: its type, to Epic.
export const FIRST_ISSUES: FirstIssue[] = ['ACME-3', 'ACME-2', 'ACME-1'].map(key => {
  const found = issue(key);
  const look = TYPE_LOOK[found.type] ?? { tone: 'gray', letter: found.type.charAt(0) };
  return {
    key,
    title: found.title,
    type: found.type,
    typeTone: look.tone,
    typeLetter: look.letter,
    created: formatDate(found.created),
  };
});

export interface GrowthStep {
  when: string;
  title: string;
  body: string;
  href: string;
  label: string;
}

export const GROWTH_STEPS: GrowthStep[] = [
  {
    when: 'When a week needs a plan',
    title: 'Sprints, a backlog and the board',
    body: 'Plan a sprint, drag issues in from the backlog and start it. The board the project already has follows the running sprint, with story points and a burndown.',
    href: '/features/sprints-kanban-boards',
    label: 'Sprints and boards',
  },
  {
    when: 'When effort needs counting',
    title: 'Time on the issue',
    body: 'Time tracking is on in every new project. Log time where it was spent, set an estimate, and read the same entries in the timesheet.',
    href: '/features/time-tracking',
    label: 'Time tracking',
  },
  {
    when: 'When an issue needs one more fact',
    title: 'Custom fields',
    body: 'A Project Admin adds a Severity, a customer or a launch date. The field shows in the list, in search, in the CSV export and to agents.',
    href: '/features/issue-tracking',
    label: 'Issue tracking',
  },
  {
    when: 'When someone asks how it is going',
    title: 'Reports',
    body: 'Nine reports read the same issues and time, from burndown and issue age to the timesheet. Click any bar, slice or cell to open the issues it counts.',
    href: '/features/project-reports',
    label: 'Reports',
  },
];

export const STARTUPS_FAQ: FaqEntry[] = [
  {
    question: 'Do we need to design a workflow before we start?',
    answer: [
      'No. After a short profile check, onboarding asks for an organisation name and a first project; nothing else is configured. Statuses, priorities, types, work types and a board are already there. A Project Admin can rename, add or delete values later in the project’s settings.',
    ],
  },
  {
    question: 'Can I try it alone before inviting anyone?',
    answer: [
      'Yes. The invite step has a Skip for now button, and the project works the same with one member. Invite people by email or with a share link whenever you are ready.',
    ],
  },
  {
    question: 'Is there a team size this is meant for?',
    answer: [
      'No. During beta there is no subscription charge for any team size. When billing arrives the first 20 members of every organisation stay free forever, and invitations past the 20th keep working today. We will give notice before charging for additional seats.',
    ],
    link: { href: '/pricing', label: 'Pricing' },
  },
  {
    question: 'Can we bring issues from the tracker we use now?',
    answer: [
      'Generic CSV import arrives at launch; the empty project already shows where it will be. There are no native importers from other trackers. An agent connected to both your old tracker and this one can help carry issues across, with you reviewing the mapping.',
    ],
  },
  {
    question: 'What does connecting an agent involve?',
    answer: [
      'On the empty project, Connect an agent creates a personal access token with issue, comment and time scopes, then shows the config for your agent with the token filled in and one Copy button. It switches to Connected when the agent’s first call arrives. Your email address has to be verified first, and Settings → Access tokens revokes the token.',
    ],
    link: { href: MCP_MANUAL_PATH, label: 'Connecting an agent' },
  },
  {
    question: 'What happens when we fill 5 GB?',
    answer: [
      'Banners appear at 80% and 95%, and at 100% new uploads are refused with the two ways out: delete files from the storage screen, or connect your own Cloudflare R2 or AWS S3 bucket. The limit lifts as soon as the bucket is verified. Avatars never count.',
    ],
    link: { href: LIMITS_PATH, label: 'Limits and storage' },
  },
];

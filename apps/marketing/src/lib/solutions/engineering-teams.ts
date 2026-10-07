import type { FaqEntry } from '@lib/faq';
import { TOOL_REFERENCE_PATH } from '@lib/mcp';

export const ISSUES_FEATURE_PATH = '/features/issue-tracking';
export const SPRINTS_FEATURE_PATH = '/features/sprints-kanban-boards';
export const MCP_FEATURE_PATH = '/features/mcp-ai-agents';
export const REPORTS_FEATURE_PATH = '/features/project-reports';
export const KB_FEATURE_PATH = '/features/project-knowledge-base';
export const PRICING_PATH = '/pricing';
export const SHORTCUTS_MANUAL_PATH = '/docs/manual/keyboard-shortcuts';
export const PERMISSIONS_PATH = '/docs/permissions';
export { TOOL_REFERENCE_PATH };

export const STANDUP_PROMPT = '/mcp__nothingleft__standup-summary';

export interface WorkflowStep {
  id: string;
  title: string;
  who: string;
  body: string;
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'report',
    title: 'Report the bug',
    who: 'Casey Kim',
    body: 'Casey presses c, writes the steps in Markdown and sets Major.',
  },
  {
    id: 'triage',
    title: 'Triage with the query bar',
    who: 'Casey Kim, lead',
    body: 'One query lists every unassigned bug still open.',
  },
  {
    id: 'plan',
    title: 'Plan it and assign it',
    who: 'Casey Kim, lead',
    body: 'Into Sprint 08 with 3 points, owned by Alex, due 9 Oct.',
  },
  {
    id: 'develop',
    title: 'Link, reproduce, log time',
    who: 'Alex Lee, developer',
    body: 'A dependency on ACME-4, a reproduction note and 20 minutes.',
  },
  {
    id: 'board',
    title: 'Move it on the board',
    who: 'Alex Lee, developer',
    body: 'The card goes to Fixed and the status follows it.',
  },
  {
    id: 'agent',
    title: 'Ask the agent for a standup',
    who: 'Alex’s agent, as @alex',
    body: 'It reads ACME-12 and drafts the standup with documented tools.',
  },
];

export interface Shortcut {
  keys: string[];
  join?: 'then' | 'or' | 'chord';
  action: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: ['c'], action: 'Create an issue' },
  { keys: ['/'], action: 'Focus search, Tab to complete, ↵ to run' },
  { keys: ['g', 'i'], join: 'then', action: 'Go to the project’s issues' },
  { keys: ['g', 'b'], join: 'then', action: 'Go to the board' },
  { keys: ['a', 's'], join: 'or', action: 'Assignee or status picker on an issue' },
  { keys: ['⌘', '↵'], join: 'chord', action: 'Submit the comment (Ctrl ↵ elsewhere)' },
  { keys: ['Space'], action: 'Pick up a card or backlog row, arrows to move' },
  { keys: ['?'], action: 'Every shortcut, on any page' },
];

export const READABLE_NAMES = [
  { name: 'ACME-12', detail: 'Issue keys count up from 1 and never skip; acme-12 finds it too.' },
  { name: '@alex', detail: 'People by username, in comments, queries and agent calls.' },
  { name: 'In Progress', detail: 'Statuses, priorities and sprints by name, not by ID.' },
];

export const ROLES = [
  { role: 'Observer', can: 'Reads issues, boards and articles. Changes nothing.' },
  { role: 'Contributor', can: 'Files, edits, links, comments, logs time and moves issues into sprints.' },
  { role: 'Project Admin', can: 'Also plans, starts and finishes sprints and shapes boards, statuses and fields.' },
  { role: 'Org Admin', can: 'Project Admin on every project, plus people and settings.' },
  { role: 'Org Owner', can: 'Everything an Org Admin can, plus transferring ownership.' },
];

export const SCOPES = [
  { scope: 'issues:read', lets: 'Read projects, issues, members, and search' },
  { scope: 'issues:write', lets: 'Create and change issues, tags, links, files and shared saved views' },
  { scope: 'comments:write', lets: 'Comment' },
  { scope: 'time:write', lets: 'Log time' },
];

export const FITS = [
  'Engineering teams that file bugs, plan sprints and follow a board in one project or several.',
  'Developers who would rather press s than hunt for a status menu, and say ACME-12 instead of pasting a link.',
  'Teams that want an AI agent to read and update the tracker as the person who connected it, and no further.',
];

export const NOT_BUILT = [
  'Source-control status. Issues show no pull-request or branch badges, and commits do not change an issue.',
  'Deployment data. Nothing reports what is released where; Fixed means someone set it to Fixed.',
  'Automatic updates from Git. Cards move when a person moves them, or their agent does as them.',
];

export const ENGINEERING_TEAMS_FAQ: FaqEntry[] = [
  {
    question: 'Does it connect to our Git repository?',
    answer: [
      'Not today. Pull-request and deployment status on issues, and status changes from commits, are not built. Signing in with GitHub is only a way to sign in. An agent that works in your repository can still read an issue and update it for you, as you, through the MCP tools.',
    ],
  },
  {
    question: 'Can an agent change issues without anyone knowing?',
    answer: [
      'No. An agent connects with a personal access token, acts as the person who created it and can never do more than their role allows; the token’s scopes can narrow that further. Every change it makes is in the activity log under that person’s name. Deleting something, or changing roles and access, stops and asks the person in their agent app first.',
    ],
    link: { href: TOOL_REFERENCE_PATH, label: 'MCP tool reference' },
  },
  {
    question: 'Do we have to design a workflow and roles before the first sprint?',
    answer: [
      'No. A new project starts with statuses, priorities and types, and there are no transition rules: any status can follow any status. There are five built-in roles and no permission schemes to maintain. A Project Admin edits the lists when the team needs to.',
    ],
    link: { href: PERMISSIONS_PATH, label: 'Permissions' },
  },
  {
    question: 'Can developers work without the mouse?',
    answer: [
      'Mostly. c creates an issue, / focuses search, g then b opens the board, a and s open the assignee and status pickers on an issue, and ⌘ ↵ or Ctrl ↵ submits a comment. On the board and the backlog, Space picks up a card, the arrow keys move it and Space drops it. Press ? on any page for the full list.',
    ],
    link: { href: SHORTCUTS_MANUAL_PATH, label: 'Keyboard shortcuts' },
  },
  {
    question: 'What does the standup summary read, and does it change anything?',
    answer: [
      'It searches the issues you updated since yesterday and the ones still assigned to you, reads their history for status moves, comments and time, and lists your unread mentions, assignments and due dates. It changes nothing and marks nothing read, so a token with issues:read is enough.',
    ],
    link: { href: MCP_FEATURE_PATH, label: 'MCP and AI agents' },
  },
  {
    question: 'What does it cost an engineering team?',
    answer: [
      'Nothing during beta, for any team size. The first 20 members of every organisation stay free once billing exists. We will give notice before charging for seats beyond that; nothing is priced today.',
    ],
    link: { href: PRICING_PATH, label: 'Pricing' },
  },
];

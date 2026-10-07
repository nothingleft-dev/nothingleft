import { assigneesOf, ISSUES, isResolvedAt, severityOf, sprint } from '@data/sample';

export const MCP_URL = 'https://api.nothingleft.dev/mcp';
export const SETUP_GUIDE_PATH = '/docs/manual/mcp';
export const TOOL_REFERENCE_PATH = '/docs/manual/mcp-tools';

export interface ClientSetup {
  id: string;
  name: string;
  where: string;
  config: string;
}

export const CLIENTS: ClientSetup[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    where: 'Run in a terminal.',
    config: `claude mcp add --transport http nothingleft ${MCP_URL} \\
  --header "Authorization: Bearer nl_pat_…"`,
  },
  {
    id: 'codex',
    name: 'Codex',
    where: 'Add to ~/.codex/config.toml.',
    config: `[mcp_servers.nothingleft]
url = "${MCP_URL}"
http_headers = { Authorization = "Bearer nl_pat_…" }`,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    where: 'Add to ~/.cursor/mcp.json.',
    config: `{
  "mcpServers": {
    "nothingleft": {
      "url": "${MCP_URL}",
      "headers": { "Authorization": "Bearer nl_pat_…" }
    }
  }
}`,
  },
];

export const SCOPES = [
  { scope: 'issues:read', lets: 'Read projects, issues, members, and search' },
  { scope: 'issues:write', lets: 'Create and change issues, tags, links, files and shared saved views' },
  { scope: 'comments:write', lets: 'Comment' },
  { scope: 'time:write', lets: 'Log time' },
  { scope: 'admin:project', lets: "Change project settings, statuses and types, and project members' roles" },
  {
    scope: 'admin:org',
    lets: 'Create projects, invite and remove people, change organisation roles and settings, read the audit log',
  },
];

export interface ToolCall {
  tool: string;
  args?: string;
}

export interface AgentRequest {
  area: string;
  prompt: string;
  calls: ToolCall[];
  note?: string;
}

const CURRENT = sprint('Sprint 08');
const criticalBugs = ISSUES.filter(
  candidate => candidate.key !== 'ACME-12' && severityOf(candidate.key) === 'Critical',
).map(candidate => candidate.key);
const backlogBugs = ['ACME-20', 'ACME-21'];

export const REQUESTS: AgentRequest[] = [
  {
    area: 'Sprints',
    prompt: `Plan Sprint 10 in ACME for 2–13 Nov, put ${backlogBugs.join(' and ')} in it with ${backlogBugs[1]} on top, start it, and show me the board.`,
    calls: [{ tool: 'create_sprint' }, { tool: 'move_to_sprint' }, { tool: 'start_sprint' }, { tool: 'get_board' }],
  },
  {
    area: 'Custom fields',
    prompt: `Add a Severity select to ACME for Bugs with Low, High and Critical, set ${criticalBugs.join(' and ')} to Critical, and show me the critical bugs.`,
    calls: [{ tool: 'create_custom_field' }, { tool: 'set_field_values' }, { tool: 'search_issues' }],
  },
  {
    area: 'Knowledge base',
    prompt: 'What happened last time payments broke?',
    calls: [{ tool: 'search', args: 'tag: payment-outage' }],
    note: 'The outage issues and the write-up come back side by side.',
  },
  {
    area: 'Reports',
    prompt: `How much of last week went on testing in ACME, and how is the ${CURRENT.name} burndown looking?`,
    calls: [
      { tool: 'run_report', args: 'report: time' },
      { tool: 'run_report', args: 'report: burndown' },
    ],
    note: 'The agent reads the same numbers the chart shows.',
  },
  {
    area: 'Inbox',
    prompt: "What's waiting on me in ACME? Mark ACME-12 read.",
    calls: [{ tool: 'list_notifications' }, { tool: 'mark_notifications_read' }],
  },
];

export const CASEY_OPEN_ISSUES = ISSUES.filter(
  candidate => !isResolvedAt(candidate.key) && assigneesOf(candidate.key).some(who => who.handle === 'casey'),
).length;

export const TOOL_AREAS = [
  { area: 'Finding your way', detail: 'Who you are, your organisations, projects and each project’s schema.' },
  { area: 'Search', detail: 'The search bar’s query language, issues and articles together, and query suggestions.' },
  { area: 'Issues', detail: 'Create, update, bulk update, delete and restore, with the full activity history.' },
  { area: 'Custom fields and links', detail: 'Define fields, set values by name, link and unlink issues.' },
  { area: 'Comments and tags', detail: 'On issues and articles, with tag counts across both.' },
  { area: 'Time', detail: 'Log, list, correct and remove work items against the issue they explain.' },
  { area: 'Files', detail: 'Attach files from disk in three steps, or text the agent already has.' },
  { area: 'Saved views', detail: 'Create and share the queries your team keeps returning to.' },
  { area: 'Sprints, backlog and boards', detail: 'Plan, start and finish sprints; order the backlog; shape boards.' },
  { area: 'Knowledge base', detail: 'Write, search, publish and restore project articles.' },
  { area: 'Reports', detail: 'Any of the nine reports, with the table and series behind the chart.' },
  { area: 'Notifications', detail: 'Your inbox and how you want to be told.' },
  { area: 'Projects, organisation and people', detail: 'Settings, invitations, roles and the audit trail.' },
  { area: 'Prompts', detail: 'Triage, duplicates, standup, release notes, estimates, sprint report, document this.' },
];

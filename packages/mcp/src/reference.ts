import { z } from 'zod';
import { TOOLS } from './tools/index.ts';
import { RESOURCES } from './resources/index.ts';
import { PROMPTS } from './prompts/index.ts';
import type { ToolKind } from './tool.ts';

type ToolName = (typeof TOOLS)[number]['name'];

/** The reference's sections, in reading order; a tool missing from here fails the reference test. */
export const TOOL_GROUPS: Record<string, readonly ToolName[]> = {
  Discovery: ['whoami', 'list_orgs', 'get_org', 'list_projects', 'get_project', 'describe_project_schema'],
  Search: ['search', 'search_issues', 'suggest_query'],
  Issues: [
    'get_issue',
    'get_issue_description',
    'create_issue',
    'update_issue',
    'bulk_update_issues',
    'delete_issue',
    'restore_issue',
    'get_issue_activity',
  ],
  'Custom fields': [
    'list_custom_fields',
    'create_custom_field',
    'update_custom_field',
    'delete_custom_field',
    'set_field_values',
  ],
  Links: ['link_issues', 'unlink_issues'],
  Comments: ['list_comments', 'add_comment', 'update_comment', 'delete_comment'],
  Tags: ['list_tags', 'rename_tag', 'recolor_tag', 'merge_tags', 'delete_tag'],
  'Time tracking': ['log_time', 'list_work_items', 'update_work_item', 'delete_work_item'],
  Files: [
    'list_attachments',
    'get_attachment_url',
    'upload_attachment',
    'complete_upload',
    'delete_attachment',
    'list_files',
  ],
  'Saved views': ['list_views', 'get_view', 'create_view', 'update_view', 'delete_view'],
  Agile: [
    'list_sprints',
    'get_sprint',
    'create_sprint',
    'update_sprint',
    'start_sprint',
    'finish_sprint',
    'delete_sprint',
    'get_backlog',
    'move_to_sprint',
    'reorder_backlog',
    'get_board',
    'create_board',
    'update_board',
    'delete_board',
  ],
  'Knowledge base': [
    'list_articles',
    'get_article',
    'search_articles',
    'create_article',
    'update_article',
    'delete_article',
    'restore_article',
  ],
  Reports: ['run_report'],
  Notifications: [
    'list_notifications',
    'mark_notifications_read',
    'get_notification_preferences',
    'set_notification_preferences',
  ],
  'Projects and organisation': [
    'create_project',
    'update_project',
    'update_project_schema',
    'create_org',
    'update_org_settings',
    'get_org_activity',
    'update_profile',
  ],
  Development: [
    'get_issue_development',
    'get_pull_request',
    'link_pull_request',
    'unlink_pull_request',
    'list_git_connections',
    'refresh_git_connection',
    'remove_git_connection',
    'list_repositories',
    'link_repository',
    'update_repository_link',
    'unlink_repository',
    'resync_repository',
    'list_git_events',
    'replay_git_event',
  ],
  Automations: [
    'list_automations',
    'create_automation',
    'update_automation',
    'delete_automation',
    'test_automation',
    'list_automation_runs',
  ],
  'Import and export': ['start_csv_import', 'get_import_status', 'request_org_export', 'get_export_status'],
  People: [
    'list_members',
    'get_member',
    'invite_member',
    'create_invite_link',
    'manage_roles',
    'remove_member',
    'list_invitations',
    'get_invitation',
    'revoke_invitation',
    'rotate_invite_link',
  ],
};

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
};

function typeOf(s: JsonSchema): string {
  if (s.enum) return s.enum.map(v => `\`${String(v)}\``).join(' · ');
  if (s.const !== undefined) return `\`${String(s.const)}\``;
  if (s.anyOf) return [...new Set(s.anyOf.map(typeOf))].join(' or ');
  if (s.type === 'array') return `list of ${s.items ? typeOf(s.items) : 'values'}`;
  if (s.type === 'object') return 'object';
  if (s.type === 'integer') return 'number';
  return Array.isArray(s.type) ? s.type.join(' or ') : (s.type ?? 'any');
}

const cell = (v: string) => v.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

function argumentTable(input: z.ZodObject): string {
  const schema = z.toJSONSchema(input, { io: 'input' }) as JsonSchema;
  const entries = Object.entries(schema.properties ?? {});
  if (!entries.length) return 'No arguments.';
  const required = new Set(schema.required ?? []);
  const rows = entries.map(
    ([name, s]) =>
      `| \`${name}\` | ${cell(typeOf(s))} | ${required.has(name) ? 'yes' : ''} | ${cell(s.description ?? '')} |`,
  );
  return ['| Argument | Type | Required | Description |', '|---|---|---|---|', ...rows].join('\n');
}

const KIND: Record<ToolKind, string> = {
  read: 'Reads only.',
  write: 'Changes data.',
  destructive: 'Changes data; asks you to confirm in your MCP client first.',
};

/** docs/manual/mcp-tools.md, built from the definitions the server registers. */
export function toolReference(): string {
  const byName = new Map(TOOLS.map(t => [t.name as string, t]));
  const sections = Object.entries(TOOL_GROUPS).map(([group, names]) =>
    [
      `## ${group}`,
      ...names.map(name => {
        const tool = byName.get(name)!;
        return [`### \`${tool.name}\``, `${tool.description}`, `*${KIND[tool.kind]}*`, argumentTable(tool.input)].join(
          '\n\n',
        );
      }),
    ].join('\n\n'),
  );
  const resources = RESOURCES.map(r => `| \`${r.template}\` | ${cell(r.description)} |`);
  const prompts = PROMPTS.map(p => [`### \`${p.name}\``, p.description, argumentTable(p.input)].join('\n\n'));
  return `${[
    '# MCP tool reference',
    '<!-- Generated from packages/mcp by `bun run --cwd packages/mcp docs:tools`. Do not edit by hand. -->',
    `Every tool, resource and prompt the Nothing Left MCP server offers. [mcp.md](./mcp.md) explains how to connect an agent. Tools name things the way people do - \`PP-12\`, \`@alex\`, \`"In Progress"\` - and every tool takes an optional \`org\` (the organisation's slug) for when you belong to more than one.`,
    ...sections,
    '## Resources',
    'A client can attach these as context. Any of them may end in `?org=acme`.',
    ['| URI | Description |', '|---|---|', ...resources].join('\n'),
    '## Prompts',
    ...prompts,
  ].join('\n\n')}\n`;
}

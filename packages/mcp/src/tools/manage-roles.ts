import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import type { Member, ProjectMember } from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { ToolError } from '../errors.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { resolveOrganization } from '../organizations.ts';
import { resolveUsername, usernameIn } from '../resolve.ts';
import { code, date, facts, handle, join, roleLabel } from '../render.ts';

const NONE = 'None';
const input = z.strictObject({
  user: arg.person,
  org: arg.org,
  org_role: arg.orgRole.optional().describe('New organisation role. Give this, or `project` with `project_role`.'),
  project: arg.project.optional().describe('Project key, e.g. "PP", whose role to change.'),
  project_role: z
    .enum([...arg.projectRole.options, NONE])
    .optional()
    .describe('New role in `project`. "None" removes them from the project; a role for a non-member adds them.'),
});
type Args = z.output<typeof input>;

type Change =
  | { kind: 'org'; username: string; slug: string; orgName: string; role: keyof typeof arg.ORG_ROLES }
  | { kind: 'project'; username: string; key: string; org?: string; role: Args['project_role'] & string };

function invalid(hint: string): ToolError {
  return ToolError.local('mcp.invalid_arguments', { tool: 'manage_roles' }, { hints: [hint] });
}

async function plan(ctx: ToolContext, args: Args): Promise<Change> {
  const orgChange = args.org_role !== undefined;
  const projectChange = args.project !== undefined || args.project_role !== undefined;
  if (orgChange === projectChange)
    throw invalid('Give either `org_role`, or `project` with `project_role` — one per call.');
  if (projectChange && (!args.project || !args.project_role)) {
    throw invalid('`project` and `project_role` go together.');
  }

  if (orgChange) {
    const org = await resolveOrganization(ctx, args.org);
    const name = await resolveUsername(ctx, org, args.user);
    return { kind: 'org', username: name, slug: org.slug, orgName: org.name, role: args.org_role! };
  }
  return {
    kind: 'project',
    username: await usernameIn(ctx, args.project!.toUpperCase(), args.org, args.user),
    key: args.project!.toUpperCase(),
    role: args.project_role!,
    ...(args.org ? { org: args.org } : {}),
  };
}

function describe(change: Change): string {
  if (change.kind === 'org') {
    return t('mcp.action.org_role', { username: handle(change.username), role: change.role, org: change.orgName });
  }
  return change.role === NONE
    ? t('mcp.action.project_remove', { username: handle(change.username), project: change.key })
    : t('mcp.action.project_role', { username: handle(change.username), role: change.role, project: change.key });
}

export const manageRoles = defineTool({
  name: 'manage_roles',
  title: 'Change a role',
  description:
    "Changes one member's organisation role, or their role in one project — adding them to the project or removing them from it. Asks you to confirm before acting.",
  input,
  kind: 'destructive',
  endpoints: [
    'GET /v1/organizations',
    'PATCH /v1/organizations/{slug}/members/{username}',
    'GET /v1/projects/{key}/members',
    'POST /v1/projects/{key}/members',
    'PATCH /v1/projects/{key}/members/{username}',
    'DELETE /v1/projects/{key}/members/{username}',
  ],
  describeAction: async (ctx, args) => describe(await plan(ctx, args)),
  async run(ctx, args) {
    const change = await plan(ctx, args);

    if (change.kind === 'org') {
      const { data: m } = await ctx.api.send<Member>(
        'PATCH',
        path`/v1/organizations/${change.slug}/members/${change.username}`,
        { body: { org_role: arg.ORG_ROLES[change.role] } },
      );
      return {
        markdown: join(
          `${handle(m.username)} is now **${roleLabel(m.is_owner ? 'owner' : m.org_role)}** of ${change.orgName} (${code(change.slug)}).`,
        ),
      };
    }

    const scope = change.org ? { org: change.org } : {};
    const membersPath = path`/v1/projects/${change.key}/members`;
    const memberPath = path`/v1/projects/${change.key}/members/${change.username}`;
    const { data: members } = await ctx.api.get<ProjectMember[]>(membersPath, scope);
    const current = members.find(m => m.username.toLowerCase() === change.username.toLowerCase());

    if (change.role === NONE) {
      if (!current) {
        throw ToolError.local('mcp.not_a_project_member', { username: handle(change.username), project: change.key });
      }
      const { data: removed } = await ctx.api.send<ProjectMember>('DELETE', memberPath, scope);
      return {
        markdown: `${handle(removed.username)} was removed from project ${change.key}. They stay a member of the organisation.`,
      };
    }

    const role = arg.PROJECT_ROLES[change.role];
    const { data: m } = current
      ? await ctx.api.send<ProjectMember>('PATCH', memberPath, { body: { role }, ...scope })
      : await ctx.api.send<ProjectMember>('POST', membersPath, { body: { username: change.username, role }, ...scope });
    return {
      markdown: join(
        current
          ? `${handle(m.username)} is now **${roleLabel(m.role)}** in project ${change.key} (was ${roleLabel(current.role)}).`
          : `${handle(m.username)} was added to project ${change.key} as **${roleLabel(m.role)}**.`,
        facts([
          ['Org role', roleLabel(m.org_role)],
          ['Member of the project since', date(m.added_at)],
        ]),
      ),
    };
  },
});

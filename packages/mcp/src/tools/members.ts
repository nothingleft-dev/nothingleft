import { z } from 'zod';
import type { Member, ProjectMember } from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { defineTool } from '../tool.ts';
import { resolveOrganization } from '../organizations.ts';
import { resolveUsername } from '../resolve.ts';
import { code, date, facts, handle, join, more, roleLabel, table } from '../render.ts';

const memberRole = (m: Pick<Member, 'is_owner' | 'org_role'>) => roleLabel(m.is_owner ? 'owner' : m.org_role);
const nameOrDash = (ref: { name: string; username: string }) => (ref.name !== ref.username ? ref.name : '—');

export const listMembers = defineTool({
  name: 'list_members',
  title: 'List members',
  description:
    "Members of an organisation with their org role, or — with `project` — a project's members with their project role.",
  input: z.strictObject({
    org: arg.org,
    project: arg.project.optional().describe('Project key, e.g. "PP". Lists that project\'s members instead.'),
    query: z.string().trim().min(1).max(100).optional().describe('Filter by username or name.'),
    limit: arg.limit,
    offset: arg.offset,
  }),
  kind: 'read',
  endpoints: ['GET /v1/organizations', 'GET /v1/organizations/{slug}/members', 'GET /v1/projects/{key}/members'],
  async run(ctx, args) {
    const limit = args.limit ?? arg.DEFAULT_LIMIT;
    const offset = args.offset ?? 0;

    if (args.project) {
      const key = args.project.toUpperCase();
      const { data } = await ctx.api.get<ProjectMember[]>(path`/v1/projects/${key}/members`, {
        ...(args.org ? { org: args.org } : {}),
      });
      const needle = args.query?.toLowerCase().replace(/^@/, '');
      const matching = needle
        ? data.filter(m => m.username.toLowerCase().includes(needle) || m.name.toLowerCase().includes(needle))
        : data;
      const shown = matching.slice(offset, offset + limit);
      const pagination = { total: matching.length, limit, offset, has_more: offset + limit < matching.length };
      return {
        markdown: join(
          `**${key}** — ${matching.length} ${matching.length === 1 ? 'member' : 'members'}`,
          shown.length
            ? table(
                ['Member', 'Name', 'Project role', 'Org role', 'Added'],
                shown.map(m => [
                  handle(m.username) + (m.former_member ? ' · former member' : ''),
                  nameOrDash(m),
                  roleLabel(m.role),
                  roleLabel(m.org_role),
                  date(m.added_at),
                ]),
              )
            : null,
          more(pagination, shown.length),
        ),
      };
    }

    const org = await resolveOrganization(ctx, args.org);
    const res = await ctx.api.get<Member[]>(path`/v1/organizations/${org.slug}/members`, {
      query: { q: args.query, limit, offset },
    });
    const withEmail = res.data.some(m => m.email);
    const total = res.pagination?.total ?? res.data.length;
    return {
      markdown: join(
        `**${org.name}** (${code(org.slug)}) — ${total} ${total === 1 ? 'member' : 'members'}`,
        res.data.length
          ? table(
              ['Member', 'Name', 'Org role', 'Joined', ...(withEmail ? ['Email'] : [])],
              res.data.map(m => [
                handle(m.username),
                nameOrDash(m),
                memberRole(m),
                date(m.joined_at),
                ...(withEmail ? [m.email ?? '—'] : []),
              ]),
            )
          : null,
        more(res.pagination, res.data.length),
      ),
    };
  },
});

export const getMember = defineTool({
  name: 'get_member',
  title: 'Get member',
  description:
    'One organisation member: name, email (visible to org admins and to the member), org role, when they joined and who invited them.',
  input: z.strictObject({ user: arg.person, org: arg.org }),
  kind: 'read',
  endpoints: ['GET /v1/organizations', 'GET /v1/organizations/{slug}/members/{username}'],
  async run(ctx, args) {
    const org = await resolveOrganization(ctx, args.org);
    const { data: m } = await ctx.api.get<Member>(
      path`/v1/organizations/${org.slug}/members/${await resolveUsername(ctx, org, args.user)}`,
    );
    return {
      markdown: join(
        `**${handle(m.username)}**${m.name !== m.username ? ` · ${m.name}` : ''} — ${org.name} (${code(org.slug)})`,
        facts([
          ['Email', m.email],
          ['Org role', memberRole(m)],
          ['Joined', date(m.joined_at)],
          ['Invited by', m.invited_by ? handle(m.invited_by) : null],
          ['Former member', m.former_member ? 'Yes — removed from the organisation' : null],
        ]),
        `Project roles: call list_members with \`project\`.`,
      ),
    };
  },
});

import { z } from 'zod';
import type { Me, Project } from '@nothingleft/types';
import { defineTool } from '../tool.ts';
import { orgRoleOf } from '../organizations.ts';
import { code, day, handle, join, list, roleLabel, table } from '../render.ts';

const PROJECTS_PER_ORG = 100;

function projectReach(keys: readonly string[] | null): string {
  if (keys === null) return 'all projects';
  return keys.length > 0 ? `projects ${keys.join(', ')} only` : 'no projects';
}

export const whoami = defineTool({
  name: 'whoami',
  title: 'Who am I',
  description:
    'You, the token you are using (its scopes, project restriction and expiry), every organisation you belong to with your role and username there, and the projects you can reach. Call it first in a session.',
  input: z.strictObject({}),
  kind: 'read',
  endpoints: ['GET /v1/me', 'GET /v1/organizations', 'GET /v1/projects'],
  async run(ctx) {
    const zone = await ctx.timeZone();
    const [{ data: me }, orgs] = await Promise.all([ctx.api.get<Me>('/v1/me'), ctx.organizations()]);
    const projects = await Promise.all(
      orgs.map(async o => {
        const res = await ctx.api.get<Project[]>('/v1/projects', { query: { limit: PROJECTS_PER_ORG }, org: o.slug });
        return { projects: res.data, total: res.pagination?.total ?? res.data.length };
      }),
    );

    const token = me.token;
    const tokenLine = token
      ? `Token **${token.name}** ${code(`${token.token_prefix}…`)} · ${list(token.scopes)} · ${projectReach(
          token.project_keys,
        )} · ${token.expires_at ? `expires ${day(token.expires_at, zone)}` : 'no expiry'}`
      : null;

    const rows = orgs.map((o, i) => {
      const { projects: ps, total } = projects[i]!;
      const names = ps.map(p => `${p.key} (${roleLabel(p.my_role)})`).join(', ');
      return [
        o.name,
        code(o.slug),
        handle(o.membership.username),
        roleLabel(orgRoleOf(o)),
        (names || '—') + (total > ps.length ? `, …${total - ps.length} more` : ''),
      ];
    });

    return {
      markdown: join(
        `**${me.name}** · ${me.email} · timezone ${me.timezone}`,
        tokenLine,
        orgs.length
          ? table(['Organisation', 'Slug', 'You', 'Role', 'Projects (your role)'], rows)
          : 'You belong to no organisation yet.',
      ),
    };
  },
});

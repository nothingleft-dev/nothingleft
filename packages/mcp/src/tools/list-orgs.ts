import { z } from 'zod';
import { defineTool } from '../tool.ts';
import { orgRoleOf } from '../organizations.ts';
import { code, handle, roleLabel, table } from '../render.ts';

export const listOrgs = defineTool({
  name: 'list_orgs',
  title: 'List organisations',
  description:
    'Organisations you belong to, with the slug to pass as `org`, your username and role in each, the plan and the seat count.',
  input: z.strictObject({}),
  kind: 'read',
  endpoints: ['GET /v1/organizations'],
  async run(ctx) {
    const orgs = await ctx.organizations();
    const rows = orgs.map(o => [
      o.name,
      code(o.slug),
      handle(o.membership.username),
      roleLabel(orgRoleOf(o)),
      o.plan,
      o.seats.free === null ? `${o.seats.used}` : `${o.seats.used} of ${o.seats.free}`,
    ]);
    return {
      markdown: orgs.length
        ? table(['Organisation', 'Slug', 'You', 'Role', 'Plan', 'Members'], rows)
        : 'You belong to no organisation yet.',
    };
  },
});

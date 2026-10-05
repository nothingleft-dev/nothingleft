import { z } from 'zod';
import { ISSUE_LINK_NAME_VALUES, type IssueLinkGroup } from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { issueKey } from '../resolve.ts';
import { join } from '../render.ts';
import { linkLines } from '../render-issue.ts';

const scope = (org: string | undefined) => (org ? { org } : {});

async function linksNow(ctx: ToolContext, key: string, org: string | undefined, lead: string) {
  const { data } = await ctx.api.get<IssueLinkGroup[]>(path`/v1/issues/${key}/links`, scope(org));
  return { markdown: join(lead, linkLines(data) ?? `${key} has no links now.`) };
}

const link = z
  .enum(ISSUE_LINK_NAME_VALUES)
  .describe('Read from `issue`: "PP-5 depends on PP-4" is issue PP-5, link "depends on", targets ["PP-4"].');

export const linkIssues = defineTool({
  name: 'link_issues',
  title: 'Link issues',
  description:
    'Links an issue to others: relates to, depends on / is required for, duplicates / is duplicated by, subtask of / parent for. "subtask of" sets the parent. Returns the issue\'s links.',
  input: z.strictObject({ issue: arg.issue, link, targets: z.array(arg.issue).min(1).max(50), org: arg.org }),
  kind: 'write',
  endpoints: ['POST /v1/issues/{key}/links', 'GET /v1/issues/{key}/links'],
  async run(ctx, args) {
    const key = issueKey(args.issue);
    await ctx.api.send('POST', path`/v1/issues/${key}/links`, {
      ...scope(args.org),
      body: { link: args.link, issues: args.targets.map(issueKey) },
    });
    return linksNow(ctx, key, args.org, `Linked **${key}** ${args.link} ${args.targets.map(issueKey).join(', ')}.`);
  },
});

export const unlinkIssues = defineTool({
  name: 'unlink_issues',
  title: 'Unlink issues',
  description: "Removes one link between two issues. Returns the issue's remaining links.",
  input: z.strictObject({ issue: arg.issue, link, target: arg.issue, org: arg.org }),
  kind: 'write',
  endpoints: ['DELETE /v1/issues/{key}/links/{target}', 'GET /v1/issues/{key}/links'],
  async run(ctx, args) {
    const key = issueKey(args.issue);
    const target = issueKey(args.target);
    await ctx.api.send('DELETE', path`/v1/issues/${key}/links/${target}`, {
      ...scope(args.org),
      query: { link: args.link },
    });
    return linksNow(ctx, key, args.org, `Removed **${key}** ${args.link} ${target}.`);
  },
});

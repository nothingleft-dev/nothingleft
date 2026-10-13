import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import type { Comment } from '@nothingleft/types';
import * as arg from '../args.ts';
import { defineTool } from '../tool.ts';
import { join, moreByCursor, person } from '../render.ts';
import { commentBlock } from '../render-issue.ts';
import { articleTarget, commentTarget } from './articles.ts';

const scope = (org: string | undefined) => (org ? { org } : {});
const comment = z.number().int().positive().describe('The comment number shown as "Comment 482".');
const body = arg.markdown('The comment. @username mentions notify people exactly as in the app');
const on = { issue: arg.issue.optional(), ...articleTarget };

export const listComments = defineTool({
  name: 'list_comments',
  title: 'List comments',
  description:
    "An issue's comments - or a knowledge base article's, with project and article - oldest first, each with the number update_comment and delete_comment take.",
  input: z.strictObject({ ...on, limit: arg.limit, cursor: arg.cursor, org: arg.org }),
  kind: 'read',
  endpoints: [
    'GET /v1/issues/{key}/comments',
    'GET /v1/projects/{key}/articles',
    'GET /v1/projects/{key}/articles/{slug}/comments',
  ],
  async run(ctx, args) {
    const target = await commentTarget(ctx, args);
    const res = await ctx.api.get<Comment[]>(`${target.base}/comments`, {
      ...scope(args.org),
      query: { limit: args.limit ?? arg.DEFAULT_LIMIT, cursor: args.cursor },
    });
    return {
      markdown: join(
        `**${target.label}** — ${res.pagination?.total ?? res.data.length} comments`,
        ...res.data.map(c => commentBlock(c, target.label)),
        moreByCursor(res.pagination, res.data.length),
      ),
    };
  },
});

export const addComment = defineTool({
  name: 'add_comment',
  title: 'Comment',
  description:
    'Adds a markdown comment to an issue, or to a knowledge base article (project and article). @username mentions notify. Returns the comment.',
  input: z.strictObject({ ...on, body, org: arg.org }),
  kind: 'write',
  endpoints: [
    'POST /v1/issues/{key}/comments',
    'GET /v1/projects/{key}/articles',
    'POST /v1/projects/{key}/articles/{slug}/comments',
  ],
  async run(ctx, args) {
    const target = await commentTarget(ctx, args);
    const { data } = await ctx.api.send<Comment>('POST', `${target.base}/comments`, {
      ...scope(args.org),
      body: { body_md: args.body },
    });
    return { markdown: join(`Commented on **${target.label}**.`, commentBlock(data, target.label)) };
  },
});

export const updateComment = defineTool({
  name: 'update_comment',
  title: 'Edit comment',
  description: 'Replaces the text of a comment on an issue or an article. Contributors may edit only their own.',
  input: z.strictObject({ ...on, comment, body, org: arg.org }),
  kind: 'write',
  endpoints: [
    'PATCH /v1/issues/{key}/comments/{id}',
    'GET /v1/projects/{key}/articles',
    'PATCH /v1/projects/{key}/articles/{slug}/comments/{id}',
  ],
  async run(ctx, args) {
    const target = await commentTarget(ctx, args);
    const { data } = await ctx.api.send<Comment>('PATCH', `${target.base}/comments/${args.comment}`, {
      ...scope(args.org),
      body: { body_md: args.body },
    });
    return { markdown: join(`Edited comment ${data.id} on **${target.label}**.`, commentBlock(data, target.label)) };
  },
});

export const deleteComment = defineTool({
  name: 'delete_comment',
  title: 'Delete comment',
  description:
    'Deletes a comment on an issue or an article, and the files attached to it. Contributors may delete only their own. Asks you to confirm before acting.',
  input: z.strictObject({ ...on, comment, org: arg.org }),
  kind: 'destructive',
  endpoints: [
    'DELETE /v1/issues/{key}/comments/{id}',
    'GET /v1/issues/{key}/comments/{id}',
    'GET /v1/projects/{key}/articles',
    'GET /v1/projects/{key}/articles/{slug}/comments/{id}',
    'DELETE /v1/projects/{key}/articles/{slug}/comments/{id}',
  ],
  async describeAction(ctx, args) {
    const target = await commentTarget(ctx, args);
    const { data } = await ctx.api.get<Comment>(`${target.base}/comments/${args.comment}`, scope(args.org));
    return t('mcp.action.comment_delete', { id: data.id, key: target.label, author: person(data.author) });
  },
  async run(ctx, args) {
    const target = await commentTarget(ctx, args);
    const { data } = await ctx.api.send<Comment>('DELETE', `${target.base}/comments/${args.comment}`, scope(args.org));
    return { markdown: `Deleted comment ${data.id} by ${person(data.author)} on **${target.label}**.` };
  },
});

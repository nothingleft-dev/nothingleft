import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import type { Attachment, AttachmentPresign } from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { ToolError } from '../errors.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { code, date, join, person, table } from '../render.ts';
import { articleTarget, commentTarget } from './articles.ts';

const scope = (org: string | undefined) => (org ? { org } : {});
const INLINE_CONTENT_MAX = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const file = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .describe('The file name, e.g. "login-bug.png", or the id list_attachments shows when two share a name.');
const onto = {
  comment: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('A comment number on the issue or article: the file belongs to it.'),
  work_item: z.number().int().positive().optional().describe('A work item number on the issue.'),
};
const on = { issue: arg.issue.optional(), ...articleTarget };
type Target = Awaited<ReturnType<typeof commentTarget>>;

const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

async function filesOn(
  ctx: ToolContext,
  target: Target,
  org: string | undefined,
  where: { comment?: number | undefined; work_item?: number | undefined },
) {
  const route = where.comment
    ? `${target.base}/comments/${where.comment}/attachments`
    : where.work_item
      ? `${target.base}/work-items/${where.work_item}/attachments`
      : `${target.base}/attachments`;
  return (await ctx.api.get<Attachment[]>(route, scope(org))).data;
}

/** A file by name on the issue or article, or by id; two files sharing a name are listed for the agent to choose. */
async function findFile(ctx: ToolContext, target: Target, org: string | undefined, name: string): Promise<Attachment> {
  if (UUID.test(name))
    return (await ctx.api.get<Attachment>(path`/v1/attachments/${name.toLowerCase()}`, scope(org))).data;
  const key = target.label;
  const files = await filesOn(ctx, target, org, {});
  const named = files.filter(f => f.filename.toLowerCase() === name.toLowerCase());
  if (named.length === 1) return named[0]!;
  if (named.length > 1) {
    throw ToolError.local(
      'mcp.file_ambiguous',
      { issue: key, filename: name },
      { field: 'file', valid_values: named.map(f => f.id) },
    );
  }
  throw ToolError.local(
    'mcp.file_not_found',
    { issue: key, filename: name },
    { field: 'file', valid_values: files.map(f => f.filename) },
  );
}

const where = (f: Attachment) =>
  f.comment_id
    ? `comment ${f.comment_id}`
    : f.work_item_id
      ? `work item #${f.work_item_id}`
      : f.article
        ? 'article'
        : 'issue';

export const listAttachments = defineTool({
  name: 'list_attachments',
  title: 'List files',
  description:
    "Files on an issue, its comments and its work items — or on a knowledge base article and its comments (project and article) — or only one comment's or work item's. `Inline` means the text shows it as an image.",
  input: z.strictObject({ ...on, ...onto, org: arg.org }),
  kind: 'read',
  endpoints: [
    'GET /v1/issues/{key}/attachments',
    'GET /v1/issues/{key}/comments/{id}/attachments',
    'GET /v1/issues/{key}/work-items/{id}/attachments',
    'GET /v1/projects/{key}/articles',
    'GET /v1/projects/{key}/articles/{slug}/attachments',
    'GET /v1/projects/{key}/articles/{slug}/comments/{id}/attachments',
  ],
  async run(ctx, args) {
    const target = await commentTarget(ctx, args);
    if (target.kind === 'article' && args.work_item) {
      throw ToolError.local('mcp.work_item_needs_issue', {}, { field: 'work_item' });
    }
    const key = target.label;
    const files = await filesOn(ctx, target, args.org, args);
    return {
      markdown: join(
        `**${key}** — ${files.length} ${files.length === 1 ? 'file' : 'files'}`,
        files.length
          ? table(
              ['File', 'Size', 'Type', 'On', 'Inline', 'By', 'Added', 'Id'],
              files.map(f => [
                f.filename,
                size(f.size_bytes),
                f.mime_type,
                where(f),
                f.inline ? 'yes' : '',
                person(f.created_by),
                date(f.created_at),
                f.id,
              ]),
            )
          : null,
        files.length ? 'get_attachment_url gives a link to download one.' : null,
      ),
    };
  },
});

export const getAttachmentUrl = defineTool({
  name: 'get_attachment_url',
  title: 'Download link',
  description: 'A download link for one file, valid for five minutes, after the same permission check the app makes.',
  input: z.strictObject({ ...on, file, org: arg.org }),
  kind: 'read',
  endpoints: [
    'GET /v1/issues/{key}/attachments',
    'GET /v1/projects/{key}/articles',
    'GET /v1/projects/{key}/articles/{slug}/attachments',
    'GET /v1/attachments/{id}',
    'GET /files/{id}/{filename}',
  ],
  async run(ctx, args) {
    const target = await commentTarget(ctx, args);
    const key = target.label;
    const found = await findFile(ctx, target, args.org, args.file);
    const url = await ctx.api.location(new URL(found.url).pathname);
    return {
      markdown: join(
        `**${found.filename}** (${size(found.size_bytes)}, ${found.mime_type}) on ${key} — expires in 5 minutes:`,
        url,
      ),
    };
  },
});

export const uploadAttachment = defineTool({
  name: 'upload_attachment',
  title: 'Upload a file',
  description:
    'Attaches a file to an issue, a comment or a work item — or to a knowledge base article or a comment on it (project and article). Text you have in hand (a log excerpt, a markdown note) goes in `content` and is attached at once. A file on disk never passes through the conversation: give its `size_bytes` and `sha256` (base64: `openssl dgst -sha256 -binary FILE | base64`), run the curl command the answer gives, then call complete_upload.',
  input: z.strictObject({
    ...on,
    filename: z.string().trim().min(1).max(255),
    content: z
      .string()
      .optional()
      .describe(`Text to attach as the file, up to ${INLINE_CONTENT_MAX / 1024} KB.`),
    size_bytes: z.number().int().positive().optional().describe('A file on disk: its exact size.'),
    sha256: z
      .string()
      .regex(/^[A-Za-z0-9+/]{43}=$/)
      .optional()
      .describe('A file on disk: its SHA-256, base64.'),
    mime: z.string().trim().min(3).max(100).optional().describe('e.g. "image/png". Default: from the file name.'),
    ...onto,
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['GET /v1/projects/{key}/articles', 'POST /v1/attachments/presign', 'POST /v1/attachments/{id}/complete'],
  async run(ctx, args) {
    const target = await commentTarget(ctx, args);
    const key = target.label;
    const text = args.content === undefined ? null : new TextEncoder().encode(args.content);
    if (text && text.byteLength > INLINE_CONTENT_MAX) {
      throw ToolError.local('mcp.content_too_large', { size: text.byteLength, max: INLINE_CONTENT_MAX });
    }
    if (!text && (args.size_bytes === undefined || args.sha256 === undefined))
      throw ToolError.local('mcp.upload_needs_file');
    const sha256 = text ? await digest(text) : args.sha256!;
    const { data: presign } = await ctx.api.send<AttachmentPresign>('POST', '/v1/attachments/presign', {
      ...scope(args.org),
      body: {
        ...(target.kind === 'issue'
          ? { issue: key }
          : { project: key.split('/')[0], article: key.slice(key.indexOf('/') + 1) }),
        filename: args.filename,
        mime: args.mime ?? mimeOf(args.filename, text !== null),
        size: text ? text.byteLength : args.size_bytes!,
        sha256,
        ...(args.comment ? { comment_id: args.comment } : {}),
        ...(args.work_item ? { work_item_id: args.work_item } : {}),
      },
    });

    if (text) {
      await ctx.api.upload(presign.upload_url, presign.upload_headers, text);
      const { data } = await ctx.api.send<Attachment>(
        'POST',
        path`/v1/attachments/${presign.attachment.id}/complete`,
        scope(args.org),
      );
      return { markdown: attached(data, key) };
    }
    const headers = Object.entries(presign.upload_headers)
      .map(([k, v]) => `-H '${k}: ${v}'`)
      .join(' ');
    return {
      markdown: join(
        `Upload ${code(presign.attachment.id)} for **${args.filename}** on ${key} is reserved for ${Math.round(presign.expires_in / 60)} minutes. Run:`,
        '```sh\ncurl --fail -X PUT --data-binary @' +
          shellQuote(args.filename) +
          ` ${headers} '${presign.upload_url}'\n\`\`\``,
        `Then call complete_upload with upload: "${presign.attachment.id}". Run it from the file's folder, or replace the path after @.`,
      ),
    };
  },
});

export const completeUpload = defineTool({
  name: 'complete_upload',
  title: 'Finish an upload',
  description: 'Finishes an upload_attachment after the curl PUT: the file is checked and attached.',
  input: z.strictObject({
    upload: z.string().regex(UUID).describe('The upload id upload_attachment gave.'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: ['POST /v1/attachments/{id}/complete'],
  async run(ctx, args) {
    const { data } = await ctx.api.send<Attachment>(
      'POST',
      path`/v1/attachments/${args.upload.toLowerCase()}/complete`,
      scope(args.org),
    );
    return {
      markdown: attached(data, data.issue ?? (data.article ? `${data.article.project}/${data.article.slug}` : '')),
    };
  },
});

export const deleteAttachment = defineTool({
  name: 'delete_attachment',
  title: 'Delete a file',
  description:
    'Deletes a file from an issue or an article for good; an image the text shows stops rendering. Contributors may delete only their own. Asks you to confirm before acting.',
  input: z.strictObject({ ...on, file, org: arg.org }),
  kind: 'destructive',
  endpoints: [
    'GET /v1/issues/{key}/attachments',
    'GET /v1/projects/{key}/articles',
    'GET /v1/projects/{key}/articles/{slug}/attachments',
    'GET /v1/attachments/{id}',
    'DELETE /v1/attachments/{id}',
  ],
  async describeAction(ctx, args) {
    const target = await commentTarget(ctx, args);
    const found = await findFile(ctx, target, args.org, args.file);
    return t('mcp.action.attachment_delete', { filename: found.filename, key: target.label });
  },
  async run(ctx, args) {
    const target = await commentTarget(ctx, args);
    const key = target.label;
    const found = await findFile(ctx, target, args.org, args.file);
    await ctx.api.send('DELETE', path`/v1/attachments/${found.id}`, scope(args.org));
    return { markdown: `Deleted **${found.filename}** (${size(found.size_bytes)}) from ${key}.` };
  },
});

function attached(f: Attachment, key: string) {
  return join(
    `Attached **${f.filename}** (${size(f.size_bytes)}, ${f.mime_type}) to ${key}${f.comment_id ? ` comment ${f.comment_id}` : ''}.`,
    `To show it in a description or comment: ${code(`${f.mime_type.startsWith('image/') ? '!' : ''}[${f.filename}](${f.url})`)}`,
  );
}

async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return btoa(String.fromCharCode(...hash));
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  json: 'application/json',
  csv: 'text/csv',
  md: 'text/markdown',
  txt: 'text/plain',
  log: 'text/plain',
  html: 'text/html',
  zip: 'application/zip',
  mp4: 'video/mp4',
};

function mimeOf(filename: string, text: boolean): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? (text ? 'text/plain' : 'application/octet-stream');
}

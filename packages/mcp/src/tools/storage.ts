import { z } from 'zod';
import type { StorageFile, StorageOverview } from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { defineTool } from '../tool.ts';
import { resolveOrganization } from '../organizations.ts';
import { code, date, facts, join, more, person, table } from '../render.ts';

const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;
const tally = (t: { files: number; bytes: number }) =>
  `${t.files} ${t.files === 1 ? 'file' : 'files'}, ${size(t.bytes)}`;

function heldBy(f: StorageFile): string {
  const on = f.issue ?? (f.article ? `${f.project} article ${code(f.article.slug)}` : f.project);
  const part = f.comment_id ? ` · comment ${f.comment_id}` : f.work_item_id ? ` · work item #${f.work_item_id}` : '';
  return on + part;
}

function where(f: StorageFile): string {
  const place = f.storage_target === 'byo' ? 'your bucket' : 'platform';
  return f.available ? place : `${place} · unavailable`;
}

export const listFiles = defineTool({
  name: 'list_files',
  title: 'List files by size',
  description:
    "The organisation's files, largest first, with what each is attached to and where it is stored — the storage screen's data. Delete one with delete_attachment. Needs an Org Admin and a token with admin:org.",
  input: z.strictObject({
    org: arg.org,
    project: arg.project.optional().describe('Only files in this project, by key.'),
    stored: z.enum(['platform', 'byo']).optional().describe('Only files in the platform bucket, or in your own.'),
    sort: z.enum(['size', 'created']).optional().describe('Largest first (default) or newest first.'),
    limit: arg.limit,
    offset: arg.offset,
  }),
  kind: 'read',
  endpoints: [
    'GET /v1/organizations',
    'GET /v1/organizations/{slug}/storage',
    'GET /v1/organizations/{slug}/storage/files',
  ],
  async run(ctx, args) {
    const org = await resolveOrganization(ctx, args.org);
    const limit = args.limit ?? arg.DEFAULT_LIMIT;
    const offset = args.offset ?? 0;
    const query: Record<string, string | number> = { limit, offset, sort: args.sort ?? 'size' };
    if (args.project) query['project'] = args.project.toUpperCase();
    if (args.stored) query['target'] = args.stored;
    const [{ data: usage }, { data: files, pagination }] = await Promise.all([
      ctx.api.get<StorageOverview>(path`/v1/organizations/${org.slug}/storage`),
      ctx.api.get<StorageFile[]>(path`/v1/organizations/${org.slug}/storage/files`, { query }),
    ]);
    const own = usage.connection;
    return {
      markdown: join(
        `**${org.name}** storage`,
        facts([
          [
            'Platform',
            own?.status === 'verified'
              ? `${tally(usage.platform)} · no limit while your own bucket is connected`
              : `${tally(usage.platform)} of ${size(usage.platform.limit_bytes)} (${usage.platform.level})`,
          ],
          ['Your bucket', own ? `${code(own.bucket)} (${own.status}) · ${tally(usage.bring_your_own)}` : null],
          ['Unclaimed uploads', usage.unclaimed.files ? tally(usage.unclaimed) : null],
          ['Awaiting purge', usage.awaiting_purge.files ? tally(usage.awaiting_purge) : null],
        ]),
        files.length
          ? table(
              ['File', 'Size', 'On', 'Stored', 'Uploaded by', 'Added'],
              files.map(f => [
                code(f.filename) + (f.purges_at ? ` · deleted, gone ${date(f.purges_at)}` : ''),
                size(f.size_bytes),
                heldBy(f),
                where(f),
                person(f.created_by),
                date(f.created_at),
              ]),
            )
          : 'No files.',
        more(pagination, files.length),
      ),
    };
  },
});

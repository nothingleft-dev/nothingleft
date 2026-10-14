import { z } from 'zod';
import type {
  ExportJob,
  ImportDryRun,
  ImportJob,
  ImportPreview,
  ImportRowError,
  ImportUpload,
} from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { ToolError } from '../errors.ts';
import { resolveOrganization } from '../organizations.ts';
import { code, date, facts, instant, join, person, table } from '../render.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { digest, shellQuote } from './attachments.ts';

const scope = (org: string | undefined) => (org ? { org } : {});
const INLINE_CONTENT_MAX = 1024 * 1024;
const ERRORS_SHOWN = 50;

const size = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

const mapping = z
  .record(z.string(), z.string())
  .describe(
    'Issue field → the CSV column that fills it, e.g. {"title": "Summary", "status": "State", "custom:severity": "Severity"}. Fields: title (required), description, status, priority, type, assignees, estimate, story_points, start_date, due_date, tags, sprint, parent, custom:<slug>. Columns left out are ignored.',
  );

function errorRows(errors: readonly ImportRowError[], total: number): string | null {
  if (!errors.length) return null;
  const shown = errors.slice(0, ERRORS_SHOWN);
  return join(
    table(
      ['Row', 'Column', 'Problem', 'Valid values'],
      shown.map(e => [String(e.row), e.column ?? '', e.message, (e.valid_values ?? []).slice(0, 10).join(', ')]),
    ),
    total > shown.length ? `${total - shown.length} more rows failed; get_import_status lists up to 1,000.` : null,
  );
}

function jobMarkdown(job: ImportJob): string {
  return join(
    `**Import ${job.id}** of ${code(job.filename)} into ${job.project} — ${job.status}`,
    facts([
      ['Rows', job.total_rows === null ? null : `${job.processed_rows} of ${job.total_rows} processed`],
      ['Created', String(job.created_issues)],
      ['Failed rows', String(job.failed_rows)],
      ['Started by', person(job.created_by)],
      ['Started', job.started_at ? instant(job.started_at) : null],
      ['Finished', job.completed_at ? instant(job.completed_at) : null],
    ]),
    job.error ? job.error.message : null,
    errorRows(job.errors, job.failed_rows),
  );
}

function previewMarkdown(preview: ImportPreview): string {
  const { job } = preview;
  return join(
    `**Import ${job.id}**: ${code(job.filename)}, ${job.total_rows} rows. Columns: ${(job.headers ?? []).map(code).join(', ')}`,
    preview.sample.length ? table(job.headers ?? [], preview.sample) : null,
    `Suggested mapping: ${code(JSON.stringify(preview.suggested_mapping))}`,
    `Call start_csv_import again with import: ${job.id}, project and a mapping. It is a dry run unless dry_run is false.`,
  );
}

async function run(
  ctx: ToolContext,
  key: string,
  id: number,
  columns: Record<string, string>,
  dryRun: boolean,
  org: string | undefined,
): Promise<string> {
  const body = { body: { column_mapping: columns }, ...scope(org) };
  if (dryRun) {
    const { data } = await ctx.api.send<ImportDryRun>(
      'POST',
      path`/v1/projects/${key}/imports/${String(id)}/dry-run`,
      body,
    );
    return join(
      `**Dry run of import ${id}**: ${data.valid_rows} of ${data.total_rows} rows would be created; ${data.failed_rows} would be skipped. Nothing was written.`,
      data.unknown_values.length
        ? `Values the project lacks: ${data.unknown_values.map(u => `${u.field} ${code(u.value)} (${u.rows} rows)`).join(', ')}.`
        : null,
      errorRows(data.errors, data.failed_rows),
      `To import, call start_csv_import with import: ${id}, the same mapping and dry_run: false.`,
    );
  }
  const { data } = await ctx.api.send<ImportJob>('POST', path`/v1/projects/${key}/imports/${String(id)}/start`, body);
  return join(
    jobMarkdown(data),
    `The issues are created in the background. get_import_status with import: ${id} shows progress and the rows that failed.`,
  );
}

export const startCsvImport = defineTool({
  name: 'start_csv_import',
  title: 'Import issues from CSV',
  description:
    'Creates issues in one project from a CSV file (UTF-8, a header row, up to 10,000 rows and 50 MB). First call: give the CSV as `content` (text up to 1 MB), or `size_bytes` and `sha256` of a file on disk and run the curl command the answer gives. That answers the columns, a sample and a suggested mapping. Then call again with `import` and a `mapping`: a dry run (the default) lists each row that would fail and why; `dry_run: false` creates the issues in the background. Rows that fail are skipped and listed. Needs a Project Admin and a token with admin:project.',
  input: z.strictObject({
    project: arg.project,
    import: z.number().int().positive().optional().describe('The import id an earlier call gave, to map and run it.'),
    filename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .describe('The file name, e.g. "backlog.csv". First call only.'),
    content: z.string().optional().describe('The CSV text, up to 1 MB. First call only.'),
    size_bytes: z.number().int().positive().optional().describe('A file on disk: its exact size.'),
    sha256: z
      .string()
      .regex(/^[A-Za-z0-9+/]{43}=$/)
      .optional()
      .describe('A file on disk: its SHA-256, base64 (`openssl dgst -sha256 -binary FILE | base64`).'),
    mapping: mapping.optional(),
    dry_run: z.boolean().optional().describe('Check every row without creating anything. Default true.'),
    org: arg.org,
  }),
  kind: 'write',
  endpoints: [
    'POST /v1/projects/{key}/imports',
    'POST /v1/projects/{key}/imports/{id}/complete',
    'POST /v1/projects/{key}/imports/{id}/dry-run',
    'POST /v1/projects/{key}/imports/{id}/start',
  ],
  async run(ctx, args) {
    const key = args.project.toUpperCase();
    const dryRun = args.dry_run ?? true;
    if (args.import !== undefined) {
      const { data: preview } = await ctx.api.send<ImportPreview>(
        'POST',
        path`/v1/projects/${key}/imports/${String(args.import)}/complete`,
        scope(args.org),
      );
      if (!args.mapping) return { markdown: previewMarkdown(preview) };
      return { markdown: await run(ctx, key, args.import, args.mapping, dryRun, args.org) };
    }

    const filename = args.filename ?? 'import.csv';
    const text = args.content === undefined ? null : new TextEncoder().encode(args.content);
    if (text && text.byteLength > INLINE_CONTENT_MAX) {
      throw ToolError.local('mcp.content_too_large', { size: text.byteLength, max: INLINE_CONTENT_MAX });
    }
    if (!text && (args.size_bytes === undefined || args.sha256 === undefined))
      throw ToolError.local('mcp.upload_needs_file');
    const { data: upload } = await ctx.api.send<ImportUpload>('POST', path`/v1/projects/${key}/imports`, {
      ...scope(args.org),
      body: {
        filename,
        size: text ? text.byteLength : args.size_bytes!,
        sha256: text ? await digest(text) : args.sha256!,
      },
    });
    const id = upload.job.id;
    if (!text) {
      const headers = Object.entries(upload.upload_headers)
        .map(([k, v]) => `-H '${k}: ${v}'`)
        .join(' ');
      return {
        markdown: join(
          `Import ${code(String(id))} of **${filename}** into ${key} is reserved for ${Math.round(upload.expires_in / 60)} minutes. Run:`,
          '```sh\ncurl --fail -X PUT --data-binary @' +
            shellQuote(filename) +
            ` ${headers} '${upload.upload_url}'\n\`\`\``,
          `Then call start_csv_import with project: "${key}" and import: ${id}.`,
        ),
      };
    }
    await ctx.api.upload(upload.upload_url, upload.upload_headers, text);
    const { data: preview } = await ctx.api.send<ImportPreview>(
      'POST',
      path`/v1/projects/${key}/imports/${String(id)}/complete`,
      scope(args.org),
    );
    if (!args.mapping) return { markdown: previewMarkdown(preview) };
    return { markdown: await run(ctx, key, id, args.mapping, dryRun, args.org) };
  },
});

export const getImportStatus = defineTool({
  name: 'get_import_status',
  title: 'Import status',
  description:
    "An import's progress, how many issues it created and each row that failed with the reason - or, without `import`, the project's recent imports.",
  input: z.strictObject({
    project: arg.project,
    import: z.number().int().positive().optional().describe('The import id; omit to list recent imports.'),
    org: arg.org,
  }),
  kind: 'read',
  endpoints: ['GET /v1/projects/{key}/imports', 'GET /v1/projects/{key}/imports/{id}'],
  async run(ctx, args) {
    const key = args.project.toUpperCase();
    if (args.import !== undefined) {
      const { data } = await ctx.api.get<ImportJob>(
        path`/v1/projects/${key}/imports/${String(args.import)}`,
        scope(args.org),
      );
      return { markdown: jobMarkdown(data) };
    }
    const { data } = await ctx.api.get<ImportJob[]>(path`/v1/projects/${key}/imports`, scope(args.org));
    return {
      markdown: join(
        `**${data.length} recent imports** into ${key}`,
        data.length
          ? table(
              ['Id', 'File', 'Status', 'Rows', 'Created', 'Failed', 'By', 'Started'],
              data.map(j => [
                String(j.id),
                j.filename,
                j.status,
                j.total_rows === null ? '' : String(j.total_rows),
                String(j.created_issues),
                String(j.failed_rows),
                person(j.created_by),
                date(j.created_at),
              ]),
            )
          : null,
      ),
    };
  },
});

async function exportMarkdown(ctx: ToolContext, job: ExportJob): Promise<string> {
  const link = job.download_url ? await ctx.api.location(job.download_url) : null;
  return join(
    `**Export ${job.id}** — ${job.status}`,
    facts([
      ['Size', job.size_bytes === null ? null : size(job.size_bytes)],
      ['Files', job.file_count === null ? null : String(job.file_count)],
      ['Files missing', job.missing_file_count ? String(job.missing_file_count) : null],
      ['Requested by', person(job.created_by)],
      ['Requested', instant(job.created_at)],
      ['Download until', job.expires_at ? instant(job.expires_at) : null],
    ]),
    job.error ? job.error.message : null,
    link ? `Download link, valid for five minutes:\n${link}` : null,
  );
}

export const requestOrgExport = defineTool({
  name: 'request_org_export',
  title: 'Export the organisation',
  description:
    'Starts a full export of the organisation: one .zip with every project, issue, comment, article, sprint and custom field as JSON, plus the files. It is built in the background and kept for 7 days; the person asking is emailed when it is ready, and get_export_status gives a download link. One runs at a time, so asking again while one is pending answers that one. Needs an Org Admin and a token with admin:org.',
  input: z.strictObject({ org: arg.org }),
  kind: 'write',
  endpoints: ['GET /v1/organizations', 'POST /v1/organizations/{slug}/exports'],
  async run(ctx, args) {
    const org = await resolveOrganization(ctx, args.org);
    const { data } = await ctx.api.send<ExportJob>('POST', path`/v1/organizations/${org.slug}/exports`);
    return {
      markdown: join(
        await exportMarkdown(ctx, data),
        `get_export_status with export: ${data.id} shows when it is ready.`,
      ),
    };
  },
});

export const getExportStatus = defineTool({
  name: 'get_export_status',
  title: 'Export status',
  description:
    'An export of the organisation: its state, size and, once ready, a download link valid for five minutes - or, without `export`, the recent exports.',
  input: z.strictObject({
    export: z.number().int().positive().optional().describe('The export id; omit to list recent exports.'),
    org: arg.org,
  }),
  kind: 'read',
  endpoints: [
    'GET /v1/organizations',
    'GET /v1/organizations/{slug}/exports',
    'GET /v1/organizations/{slug}/exports/{id}',
    'GET /v1/organizations/{slug}/exports/{id}/download',
  ],
  async run(ctx, args) {
    const org = await resolveOrganization(ctx, args.org);
    if (args.export !== undefined) {
      const { data } = await ctx.api.get<ExportJob>(path`/v1/organizations/${org.slug}/exports/${String(args.export)}`);
      return { markdown: await exportMarkdown(ctx, data) };
    }
    const { data } = await ctx.api.get<ExportJob[]>(path`/v1/organizations/${org.slug}/exports`);
    return {
      markdown: join(
        `**${data.length} recent exports** of ${org.name}`,
        data.length
          ? table(
              ['Id', 'Status', 'Size', 'Requested by', 'Requested', 'Download until'],
              data.map(j => [
                String(j.id),
                j.status,
                j.size_bytes === null ? '' : size(j.size_bytes),
                person(j.created_by),
                date(j.created_at),
                j.expires_at ? date(j.expires_at) : '',
              ]),
            )
          : null,
      ),
    };
  },
});

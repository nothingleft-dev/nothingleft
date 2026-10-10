import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { ZipFile } from 'yazl';
import {
  ATTACHMENT_DOWNLOAD_TTL_SECONDS,
  ORG_EXPORT_FORMAT_VERSION,
  ORG_EXPORT_TTL_DAYS,
  viaOf,
  type ExportJob,
  type ExportStatus,
  type Principal,
} from '@nothingleft/types';
import {
  ORG_EXPORT_TABLES,
  systemContext,
  tenantContext,
  type ExportAttachment,
  type ExportJobRow,
  type ExportJobsRepository,
  type OrganizationsRepository,
  type OrgExportRepository,
  type OrgExportTable,
  type ProjectsRepository,
  type TenantContext,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { formatCalendarDate } from '@nothingleft/format';
import { errorKey, t } from '@nothingleft/i18n';
import { EXPORT_JOBS_LISTED, EXPORT_PAGE_SIZE, TRANSFER_SWEEP_BATCH } from '@config/constants';
import type { Mailer } from '@lib/email';
import { AppError } from '@lib/errors';
import type { ExportOrgJob, JobQueue } from '@lib/jobs';
import type { PrivateStore, Storage } from '@lib/storage';
import type { AccessService, OrgAccess } from '@services/access';
import type { IssuesService } from '@services/issues.service';
import type { ObjectStores } from '@services/object-stores';
import type { InTenantTransaction } from '@services/transaction';

export interface ExportsDeps {
  access: AccessService;
  exportJobs: ExportJobsRepository;
  orgExport: OrgExportRepository;
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  issues: IssuesService;
  storage: Storage;
  stores: ObjectStores;
  inTransaction: InTenantTransaction;
  /** Read lazily: pg-boss replaces the recording queue once jobs start. */
  queue: () => JobQueue;
  mailer: Mailer;
  analytics: Analytics;
  appBaseUrl: string;
  now?: () => Date;
}

const DAY_MS = 86_400_000;

type Missing = { id: string; filename: string; reason: 'gone' | 'unreachable' };

const JOB_ERRORS = ['export.failed', 'forbidden'] as const;
type JobError = (typeof JOB_ERRORS)[number];

function jobError(stored: string | null) {
  if (!stored) return null;
  const code: JobError = JOB_ERRORS.find(c => c === stored) ?? 'export.failed';
  return { code, message: t(errorKey(code)) };
}

const encode = (text: string) => Buffer.from(text, 'utf8');

/** A JSON array written element by element, so a table never has to fit in memory. */
async function* jsonArray(pages: AsyncIterable<readonly unknown[]>, count: (n: number) => void) {
  let n = 0;
  yield encode('[');
  for await (const page of pages) {
    for (const item of page) {
      yield encode(`${n === 0 ? '\n' : ',\n'}${JSON.stringify(item)}`);
      n++;
    }
  }
  yield encode(n === 0 ? ']\n' : '\n]\n');
  count(n);
}

// Path separators would make a filename a folder inside the archive.
const safeName = (filename: string) => filename.replace(/[/\\]/g, '_').replace(/^\.+/, '_') || 'file';

const filePath = (a: Pick<ExportAttachment, 'public_id' | 'filename'>) =>
  `files/${a.public_id}/${safeName(a.filename)}`;

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

/** The person who asked for the export, acting again when the job runs; every check is made afresh. */
const actingAs = (job: Pick<ExportJobRow, 'created_by' | 'org_id'>): Principal => ({
  via: 'session',
  userId: job.created_by,
  sessionId: 0,
  currentOrgId: job.org_id,
});

export function exportsService(deps: ExportsDeps) {
  const { access, exportJobs, orgExport, organizations, analytics } = deps;
  const now = deps.now ?? (() => new Date());

  const platform = (): PrivateStore => {
    if (!deps.storage.private) throw new AppError('storage.not_configured', 503);
    return deps.storage.private;
  };

  async function exportAccess(principal: Principal, slug: string): Promise<OrgAccess> {
    const org = await access.org(principal, slug);
    access.require(principal, 'org.export', org.scope);
    return org;
  }

  async function findJob(org: OrgAccess, id: number): Promise<ExportJobRow> {
    const row = await exportJobs.find(org.ctx, id);
    if (!row) throw new AppError('export.not_found', 404, { id }, 'id');
    return row;
  }

  const downloadable = (row: ExportJobRow, at: Date) =>
    row.status === 'completed' && row.object_key !== null && row.expires_at !== null && row.expires_at > at;

  async function dto(ctx: TenantContext, slug: string, row: ExportJobRow): Promise<ExportJob> {
    const at = now();
    // Expired from the moment it passes expires_at, not only once the hourly sweep has deleted it.
    const lapsed = row.status === 'completed' && !downloadable(row, at);
    const member = await organizations.findMemberByUserId(ctx, row.created_by, { includeRemoved: true });
    return {
      id: row.id,
      scope: 'org',
      format: 'json',
      status: lapsed ? 'expired' : (row.status as ExportStatus),
      size_bytes: row.size_bytes,
      file_count: row.file_count,
      missing_file_count: row.missing_file_count,
      download_url: downloadable(row, at) ? `/v1/organizations/${slug}/exports/${row.id}/download` : null,
      expires_at: row.expires_at?.toISOString() ?? null,
      error: jobError(row.error),
      created_by: member
        ? access.memberRef(member.user, member.membership)
        : { username: '', name: '', avatar_url: null, former_member: true, deactivated: false },
      created_at: row.created_at.toISOString(),
      started_at: row.started_at?.toISOString() ?? null,
      completed_at: row.completed_at?.toISOString() ?? null,
    };
  }

  /** The archive: the readable issues, every table as stored, then the files, then the manifest. */
  async function build(ctx: TenantContext, principal: Principal, row: ExportJobRow, path: string, at: Date) {
    const zip = new ZipFile();
    const hash = createHash('sha256');
    let size = 0;
    const output = zip.outputStream as Readable;
    output.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      size += chunk.length;
    });
    const written = finished(output.pipe(createWriteStream(path)));
    const mtime = at;
    const counts: Record<string, number> = {};
    const add = (name: string, body: AsyncIterable<Buffer>) =>
      zip.addReadStream(Readable.from(body, { objectMode: false }), name, { mtime });

    const organization = await orgExport.organization(ctx);
    add(
      'organization.json',
      (async function* () {
        yield encode(`${JSON.stringify(organization, null, 2)}\n`);
      })(),
    );
    add(
      'members.json',
      jsonArray(
        (async function* () {
          yield await orgExport.members(ctx);
        })(),
        n => (counts.members = n),
      ),
    );

    const projectRows = await deps.projects.listReadable(ctx, principal.userId, { everyProject: true });
    const projectsById = new Map(projectRows.map(r => [r.project.id, r.project]));
    let issueCount = 0;
    add(
      'issues.json',
      jsonArray(
        (async function* () {
          for (let after = 0; ;) {
            const page = await orgExport.issuesAfter(ctx, after, EXPORT_PAGE_SIZE);
            if (page.length === 0) return;
            after = page.at(-1)!.id;
            yield await deps.issues.dtosFor(principal, ctx, page, projectsById);
          }
        })(),
        n => (issueCount = counts.issues = n),
      ),
    );

    for (const name of Object.keys(ORG_EXPORT_TABLES) as OrgExportTable[]) {
      add(
        `tables/${name}.json`,
        jsonArray(
          (async function* () {
            for (let afterId = 0, offset = 0; ;) {
              const page = await orgExport.page(ctx, name, { afterId, offset }, EXPORT_PAGE_SIZE);
              if (page.length === 0) return;
              afterId = typeof page.at(-1)!.id === 'number' ? (page.at(-1)!.id as number) : afterId;
              offset += page.length;
              yield page;
            }
          })(),
          n => (counts[`tables/${name}`] = n),
        ),
      );
    }

    const listed: Record<string, unknown>[] = [];
    const missing: Missing[] = [];
    let files = 0;
    for (let after = 0; ;) {
      const page = await orgExport.attachmentsAfter(ctx, after, EXPORT_PAGE_SIZE);
      if (page.length === 0) break;
      after = page.at(-1)!.id;
      for (const file of page) {
        const entry = {
          id: file.public_id,
          filename: file.filename,
          mime_type: file.mime_type,
          size_bytes: file.size_bytes,
          issue_id: file.issue_id,
          comment_id: file.comment_id,
          work_item_id: file.work_item_id,
          article_id: file.article_id,
          created_by: file.created_by,
          created_at: file.created_at,
          path: null as string | null,
        };
        listed.push(entry);
        let body: Awaited<ReturnType<PrivateStore['open']>>;
        try {
          const { store } = await deps.stores.forObject(ctx, file);
          body = await store.open(file.object_key);
        } catch (error) {
          // The platform's own bucket failing fails the export, to be retried; a customer's is listed.
          if (file.storage_target !== 'byo') throw error;
          missing.push({ id: file.public_id, filename: file.filename, reason: 'unreachable' });
          continue;
        }
        if (!body) {
          missing.push({ id: file.public_id, filename: file.filename, reason: 'gone' });
          continue;
        }
        entry.path = filePath(file);
        const stream = Readable.fromWeb(body.body as unknown as NodeReadableStream);
        zip.addReadStream(stream, entry.path, { mtime, compress: false });
        // One object open at a time: wait until the archive has taken this file before opening the next.
        await finished(stream);
        files++;
      }
    }
    zip.addBuffer(encode(`${JSON.stringify(listed, null, 0).replace(/},{/g, '},\n{')}\n`), 'files.json', {
      mtime,
    });
    zip.addReadStreamLazy('manifest.json', { mtime }, cb =>
      cb(
        null,
        Readable.from([
          encode(
            `${JSON.stringify(
              {
                format_version: ORG_EXPORT_FORMAT_VERSION,
                exported_at: at.toISOString(),
                organization: { slug: organization?.slug, name: organization?.name },
                counts: { ...counts, files },
                missing_files: missing,
              },
              null,
              2,
            )}\n`,
          ),
        ]),
      ),
    );
    zip.end();
    await written;
    return { size, sha256: hash.digest('base64'), files, missing: missing.length, issues: issueCount };
  }

  return {
    /** Starts one, or answers the export already queued or running: an organisation has one at a time. */
    async request(principal: Principal, slug: string, ip: string | null): Promise<ExportJob> {
      const org = await exportAccess(principal, slug);
      platform();
      const created = await deps.inTransaction(async repos => {
        const row = await repos.exportJobs.insertPending(org.ctx, principal.userId);
        if (!row) return null;
        await repos.activity.record(org.ctx, {
          actor_id: principal.userId,
          kind: 'export_requested',
          target_type: 'organization',
          target_id: String(org.organization.id),
          old_value: null,
          new_value: { export: 'org', export_id: row.id },
          ip,
        });
        return row;
      });
      if (!created) {
        const pending = await exportJobs.findPending(org.ctx);
        if (pending) return dto(org.ctx, slug, pending);
        throw new AppError('conflict', 409);
      }
      await deps
        .queue()
        .send(
          'export.org',
          { org_id: org.organization.id, job_id: created.id },
          { startAfter: now(), singletonKey: `export:${org.organization.id}` },
        );
      analytics.capture(
        'org_export_requested',
        { via: viaOf(principal) },
        { userId: principal.userId, orgId: org.organization.id },
      );
      return dto(org.ctx, slug, created);
    },

    async list(principal: Principal, slug: string): Promise<ExportJob[]> {
      const org = await exportAccess(principal, slug);
      const rows = await exportJobs.list(org.ctx, EXPORT_JOBS_LISTED);
      return Promise.all(rows.map(r => dto(org.ctx, slug, r)));
    },

    async get(principal: Principal, slug: string, id: number): Promise<ExportJob> {
      const org = await exportAccess(principal, slug);
      return dto(org.ctx, slug, await findJob(org, id));
    },

    async downloadUrl(principal: Principal, slug: string, id: number): Promise<string> {
      const org = await exportAccess(principal, slug);
      const row = await findJob(org, id);
      const at = now();
      if (!downloadable(row, at)) {
        const status = row.status === 'completed' ? 'expired' : row.status;
        throw new AppError('export.not_ready', 409, { id, status });
      }
      const day = row.completed_at!.toISOString().slice(0, 10);
      return platform().presignGet(
        row.object_key!,
        {
          contentType: 'application/zip',
          disposition: `attachment; filename="nothingleft-${slug}-${day}.zip"`,
        },
        ATTACHMENT_DOWNLOAD_TTL_SECONDS,
      );
    },

    /** `export.org`: writes the archive to a temporary file, then stores it with its checksum. */
    async run(job: ExportOrgJob, at = now()): Promise<number> {
      const ctx = tenantContext(job.org_id);
      const queued = await exportJobs.find(ctx, job.job_id);
      if (!queued || (queued.status !== 'queued' && queued.status !== 'running')) return 0;
      const row = (await exportJobs.transition(ctx, queued.id, ['queued', 'running'], {
        status: 'running',
        started_at: at,
      }))!;
      const principal = actingAs(row);
      const path = join(tmpdir(), `nl-export-${row.org_id}-${row.id}-${randomUUID()}.zip`);
      const fail = (code: JobError) =>
        exportJobs.transition(ctx, row.id, ['running'], { status: 'failed', error: code, completed_at: now() });

      let org: OrgAccess;
      try {
        org = await access.orgById(principal, row.org_id);
        access.require(principal, 'org.export', org.scope);
      } catch (err) {
        if (err instanceof AppError && err.status < 500) {
          await fail('forbidden');
          return 0;
        }
        throw err;
      }

      try {
        const built = await build(ctx, principal, row, path, at);
        const objectKey = `api/${row.org_id}/export/${row.id}/${randomUUID()}`;
        const { size } = await stat(path);
        await platform().putStream(objectKey, Bun.file(path).stream(), {
          contentType: 'application/zip',
          size,
          sha256: built.sha256,
        });
        const finishedAt = now();
        const expires = new Date(finishedAt.getTime() + ORG_EXPORT_TTL_DAYS * DAY_MS);
        await exportJobs.transition(ctx, row.id, ['running'], {
          status: 'completed',
          object_key: objectKey,
          size_bytes: size,
          file_count: built.files,
          missing_file_count: built.missing,
          expires_at: expires,
          completed_at: finishedAt,
        });
        analytics.capture(
          'org_export_finished',
          {
            ok: true,
            issues: built.issues,
            files: built.files,
            missing_files: built.missing,
            bytes: size,
            duration_ms: finishedAt.getTime() - at.getTime(),
          },
          { userId: row.created_by, orgId: row.org_id },
        );
        const requester = await organizations.findMemberByUserId(ctx, row.created_by);
        if (requester && !requester.user.deactivated_at && !requester.user.deleted_at) {
          await deps.mailer.send({
            to: requester.user.email,
            subject: 'email.export_ready.subject',
            body: 'email.export_ready.body',
            params: {
              name: requester.user.name,
              org: org.organization.name,
              size: formatBytes(size),
              date: formatCalendarDate(expires.toISOString()),
              url: `${deps.appBaseUrl}/organization?tab=exports`,
            },
          });
        }
        return 1;
      } catch (error) {
        await fail('export.failed');
        analytics.capture(
          'org_export_finished',
          { ok: false, issues: 0, files: 0, missing_files: 0, bytes: 0, duration_ms: now().getTime() - at.getTime() },
          { userId: row.created_by, orgId: row.org_id },
        );
        throw error;
      } finally {
        await rm(path, { force: true });
      }
    },

    /** Hourly: archives past their expiry are deleted; the row stays, marked expired. */
    async sweep(at = now()): Promise<number> {
      const rows = await exportJobs.listExpired(
        systemContext('the hourly sweep deletes expired export archives across every organisation'),
        at,
        TRANSFER_SWEEP_BATCH,
      );
      for (const row of rows) {
        if (row.object_key) await platform().delete(row.object_key);
        await exportJobs.transition(tenantContext(row.org_id), row.id, ['completed'], {
          status: 'expired',
          object_key: null,
        });
      }
      return rows.length;
    },
  };
}

export type ExportsService = ReturnType<typeof exportsService>;

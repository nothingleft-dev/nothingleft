import {
  ATTACHMENT_UPLOAD_TTL_SECONDS,
  CSV_IMPORT_ERRORS_KEPT,
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_MAX_ROWS,
  CSV_IMPORT_SAMPLE_ROWS,
  CSV_IMPORT_ABANDONED_HOURS,
  CUSTOM_GROUP_PREFIX,
  CreateIssueSchema,
  IMPORT_FIELDS,
  viaOf,
  type CreateImport,
  type CreateIssue,
  type ImportDryRun,
  type ImportJob,
  type ImportMapping,
  type ImportPreview,
  type ImportRowError,
  type ImportStatus,
  type ImportUpload,
  type Principal,
  type RunImport,
} from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type CustomFieldsRepository,
  type ImportJobRow,
  type ImportJobsRepository,
  type OrganizationsRepository,
  type TenantContext,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { errorKey, t } from '@nothingleft/i18n';
import { IMPORT_JOBS_LISTED, IMPORT_RUN_MS, TRANSFER_SWEEP_BATCH } from '@config/constants';
import { parseCsv } from '@lib/csv';
import { AppError } from '@lib/errors';
import type { ImportCsvJob, JobQueue } from '@lib/jobs';
import type { PrivateStore, Storage } from '@lib/storage';
import type { AccessService, ProjectAccess } from '@services/access';
import { loadCatalogue } from '@services/custom-field-values';
import { createMemo, type CreateMemo, type IssuesService } from '@services/issues.service';
import type { OrgHints } from '@services/tenancy.service';

export interface ImportsDeps {
  access: AccessService;
  issues: IssuesService;
  importJobs: ImportJobsRepository;
  organizations: OrganizationsRepository;
  customFields: CustomFieldsRepository;
  storage: Storage;
  /** Read lazily: pg-boss replaces the recording queue once jobs start. */
  queue: () => JobQueue;
  analytics: Analytics;
  now?: () => Date;
}

type Field = (typeof IMPORT_FIELDS)[number];

// Header spellings recognised without a mapping, compared with case, spaces and punctuation removed.
const HEADER_ALIASES: Record<Field, readonly string[]> = {
  title: ['title', 'summary', 'name', 'subject'],
  description: ['description', 'body', 'details'],
  status: ['status', 'state'],
  priority: ['priority'],
  type: ['type', 'issuetype', 'kind'],
  assignees: ['assignee', 'assignees', 'owner'],
  estimate: ['estimate', 'originalestimate', 'timeestimate'],
  story_points: ['storypoints', 'points'],
  start_date: ['startdate', 'start'],
  due_date: ['duedate', 'due'],
  tags: ['tags', 'tag', 'labels', 'label'],
  sprint: ['sprint'],
  parent: ['parent', 'parentkey'],
};

// Refusals that name a value the project lacks, summarised for the dry run by field and value.
const UNKNOWN_VALUE_FIELDS: Partial<Record<string, Field>> = {
  'issue.unknown_status': 'status',
  'issue.unknown_priority': 'priority',
  'issue.unknown_type': 'type',
  'issue.unknown_sprint': 'sprint',
  'issue.unknown_assignee': 'assignees',
};

const JOB_ERRORS = ['import.failed', 'forbidden', 'import.upload_missing'] as const;
type JobError = (typeof JOB_ERRORS)[number];

function jobError(stored: string | null) {
  if (!stored) return null;
  const code: JobError = JOB_ERRORS.find(c => c === stored) ?? 'import.failed';
  return { code, message: t(errorKey(code)) };
}

const normalise = (header: string) => header.toLowerCase().replace(/[^a-z0-9]/g, '');
const splitList = (cell: string) =>
  cell
    .split(/[,;]/)
    .map(v => v.trim())
    .filter(Boolean);

interface Parsed {
  headers: string[];
  rows: string[][];
}

interface Mapped {
  columns: Map<string, number>;
  /** Custom fields whose cells list several values. */
  multi: Set<string>;
}

interface RowOutcome {
  input?: CreateIssue;
  error?: ImportRowError;
}

/** The person who started the import, acting again when the job runs; every check is made afresh. */
const actingAs = (job: Pick<ImportJobRow, 'created_by' | 'org_id'>): Principal => ({
  via: 'session',
  userId: job.created_by,
  sessionId: 0,
  currentOrgId: job.org_id,
});

export function importsService(deps: ImportsDeps) {
  const { access, issues, importJobs, organizations, analytics } = deps;
  const now = deps.now ?? (() => new Date());

  const platform = (): PrivateStore => {
    if (!deps.storage.private) throw new AppError('storage.not_configured', 503);
    return deps.storage.private;
  };

  async function importAccess(principal: Principal, key: string, hints: OrgHints): Promise<ProjectAccess> {
    const project = await access.project(principal, key, hints);
    access.require(principal, 'issue.import', project.scope);
    return project;
  }

  async function findJob(project: ProjectAccess, id: number): Promise<ImportJobRow> {
    const row = await importJobs.find(project.ctx, project.project.id, id);
    if (!row) throw new AppError('import.not_found', 404, { id }, 'id');
    return row;
  }

  async function dto(ctx: TenantContext, projectKey: string, row: ImportJobRow): Promise<ImportJob> {
    const member = await organizations.findMemberByUserId(ctx, row.created_by, { includeRemoved: true });
    return {
      id: row.id,
      project: projectKey,
      source: 'csv',
      filename: row.filename,
      size_bytes: row.size_bytes,
      status: row.status as ImportStatus,
      headers: row.headers,
      column_mapping: row.column_mapping as Record<string, string> | null,
      total_rows: row.total_rows,
      processed_rows: row.processed_rows,
      created_issues: row.created_issues,
      failed_rows: row.failed_rows,
      errors: row.errors as ImportRowError[],
      error: jobError(row.error),
      created_by: member
        ? access.memberRef(member.user, member.membership)
        : { username: '', name: '', avatar_url: null, former_member: true, deactivated: false },
      created_at: row.created_at.toISOString(),
      started_at: row.started_at?.toISOString() ?? null,
      completed_at: row.completed_at?.toISOString() ?? null,
    };
  }

  async function readFile(row: ImportJobRow): Promise<Parsed> {
    if (!row.object_key) throw new AppError('import.upload_missing', 400);
    const bytes = await platform().read(row.object_key);
    if (!bytes) throw new AppError('import.upload_missing', 400);
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new AppError('import.not_utf8', 400, { filename: row.filename });
    }
    const { rows, truncated } = parseCsv(text, CSV_IMPORT_MAX_ROWS + 1);
    const [headers, ...body] = rows;
    if (!headers || headers.every(h => h.trim() === '')) throw new AppError('import.empty', 400);
    if (truncated || body.length > CSV_IMPORT_MAX_ROWS) {
      throw new AppError('import.too_many_rows', 400, { max: CSV_IMPORT_MAX_ROWS.toLocaleString('en-GB') });
    }
    return { headers: headers.map(h => h.trim()), rows: body };
  }

  async function customSlugs(project: ProjectAccess) {
    const catalogue = await loadCatalogue(deps.customFields, project.ctx, [project.project.id]);
    return catalogue.fields.filter(f => !f.is_archived);
  }

  async function suggest(project: ProjectAccess, headers: string[]): Promise<Record<string, string>> {
    const fields = await customSlugs(project);
    const mapping: Record<string, string> = {};
    for (const header of headers) {
      const key = normalise(header);
      if (!key) continue;
      const builtIn = IMPORT_FIELDS.find(f => HEADER_ALIASES[f].includes(key));
      const custom = fields.find(f => normalise(f.slug) === key || normalise(f.name) === key);
      const target = builtIn ?? (custom ? `${CUSTOM_GROUP_PREFIX}${custom.slug}` : undefined);
      if (target && !(target in mapping)) mapping[target] = header;
    }
    return mapping;
  }

  /** The mapping checked against the file's headers and the project's custom fields. */
  async function checkMapping(project: ProjectAccess, headers: string[], mapping: ImportMapping): Promise<Mapped> {
    if (!mapping.title) throw new AppError('import.title_required', 400, {}, 'column_mapping.title');
    const fields = await customSlugs(project);
    const columns = new Map<string, number>();
    const multi = new Set<string>();
    for (const [target, header] of Object.entries(mapping)) {
      const at = headers.indexOf(header);
      if (at < 0) {
        throw new AppError('import.unknown_header', 400, { header }, `column_mapping.${target}`, headers);
      }
      if (headers.lastIndexOf(header) !== at) {
        throw new AppError('import.header_ambiguous', 400, { header }, `column_mapping.${target}`);
      }
      if (target.startsWith(CUSTOM_GROUP_PREFIX)) {
        const slug = target.slice(CUSTOM_GROUP_PREFIX.length);
        const field = fields.find(f => f.slug === slug);
        if (!field) {
          throw new AppError(
            'import.unknown_field',
            400,
            { field: slug, project: project.project.key },
            `column_mapping.${target}`,
            fields.map(f => `${CUSTOM_GROUP_PREFIX}${f.slug}`),
          );
        }
        if (field.type === 'multi_select' || field.type === 'multi_user') multi.add(slug);
      }
      columns.set(target, at);
    }
    return { columns, multi };
  }

  /** Every member's email, so a cell may name a person either way. */
  async function usernamesByEmail(ctx: TenantContext): Promise<Map<string, string>> {
    const { rows } = await organizations.listMembers(ctx, { limit: 100_000, offset: 0 });
    return new Map(rows.map(r => [r.user.email.toLowerCase(), r.membership.username]));
  }

  const person = (byEmail: Map<string, string>) => (value: string) => {
    const named = value.replace(/^@/, '');
    return value.includes('@') && !value.startsWith('@') ? (byEmail.get(value.toLowerCase()) ?? named) : named;
  };

  function toInput(project: ProjectAccess, mapped: Mapped, byEmail: Map<string, string>, cells: string[]) {
    const cell = (target: string) => {
      const at = mapped.columns.get(target);
      const value = at === undefined ? '' : (cells[at] ?? '');
      return value.trim();
    };
    const toUser = person(byEmail);
    const input: Record<string, unknown> = { project: project.project.key, title: cell('title') };
    const description = mapped.columns.has('description') ? (cells[mapped.columns.get('description')!] ?? '') : '';
    if (description.trim()) input.description_md = description;
    for (const field of [
      'status',
      'priority',
      'type',
      'sprint',
      'parent',
      'start_date',
      'due_date',
      'estimate',
    ] as const) {
      const value = cell(field);
      if (value) input[field] = value;
    }
    const points = cell('story_points');
    if (points) input.story_points = Number(points);
    const assignees = splitList(cell('assignees'));
    if (assignees.length) input.assignees = assignees.map(toUser);
    const tags = splitList(cell('tags'));
    if (tags.length) input.tags = tags;
    const custom: Record<string, unknown> = {};
    for (const target of mapped.columns.keys()) {
      if (!target.startsWith(CUSTOM_GROUP_PREFIX)) continue;
      const slug = target.slice(CUSTOM_GROUP_PREFIX.length);
      const value = cell(target);
      if (!value) continue;
      custom[slug] = mapped.multi.has(slug) ? splitList(value).map(toUser) : value;
    }
    if (Object.keys(custom).length) input.custom_fields = custom;
    return input;
  }

  function columnOf(
    mapping: ImportMapping,
    field: string | undefined,
  ): { column: string | null; field: string | null } {
    if (!field) return { column: null, field: null };
    const target =
      field === 'description_md'
        ? 'description'
        : field.startsWith('custom_fields.')
          ? `${CUSTOM_GROUP_PREFIX}${field.slice('custom_fields.'.length)}`
          : field;
    return { column: mapping[target] ?? null, field: target };
  }

  /** One row checked as a create would check it; nothing is written. */
  async function checkRow(
    principal: Principal,
    project: ProjectAccess,
    mapping: ImportMapping,
    mapped: Mapped,
    byEmail: Map<string, string>,
    memo: CreateMemo,
    cells: string[],
    row: number,
  ): Promise<RowOutcome & { plan?: Awaited<ReturnType<IssuesService['planCreate']>> }> {
    const raw = toInput(project, mapped, byEmail, cells);
    const parsed = CreateIssueSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      const field = String(issue.path[0] ?? '');
      const where = columnOf(mapping, field === 'description_md' ? 'description_md' : field);
      const value = String((raw as Record<string, unknown>)[field] ?? '');
      return {
        error: {
          row,
          ...where,
          code: field === 'title' && !value ? 'import.title_missing' : 'import.invalid_value',
          message:
            field === 'title' && !value
              ? t(errorKey('import.title_missing'))
              : t(errorKey('import.invalid_value'), { value: value.slice(0, 100), column: where.column ?? field }),
        },
      };
    }
    try {
      const plan = await issues.planCreate(principal, project, parsed.data, memo);
      return { input: parsed.data, plan };
    } catch (err) {
      if (!(err instanceof AppError) || err.status >= 500) throw err;
      return {
        error: {
          row,
          ...columnOf(mapping, err.field),
          code: err.code,
          message: err.message,
          ...(err.validValues ? { valid_values: err.validValues } : {}),
        },
      };
    }
  }

  /** The uploaded file is deleted once its job has ended; the row keeps the outcome. */
  async function release(ctx: TenantContext, row: Pick<ImportJobRow, 'id' | 'object_key'>): Promise<void> {
    if (!row.object_key) return;
    await platform().delete(row.object_key);
    await importJobs.update(ctx, row.id, { object_key: null });
  }

  async function prepared(principal: Principal, project: ProjectAccess, row: ImportJobRow, mapping: ImportMapping) {
    const file = await readFile(row);
    const mapped = await checkMapping(project, file.headers, mapping);
    const byEmail = await usernamesByEmail(project.ctx);
    return { file, mapped, byEmail };
  }

  return {
    async create(principal: Principal, key: string, input: CreateImport, hints: OrgHints = {}): Promise<ImportUpload> {
      const project = await importAccess(principal, key, hints);
      if (project.project.is_archived) throw new AppError('project.archived', 409, { key: project.project.key });
      if (input.size > CSV_IMPORT_MAX_BYTES) {
        throw new AppError(
          'import.too_large',
          400,
          { filename: input.filename, max: `${CSV_IMPORT_MAX_BYTES / 1024 / 1024} MB` },
          'size',
        );
      }
      const store = platform();
      const row = await importJobs.insert(project.ctx, {
        project_id: project.project.id,
        created_by: principal.userId,
        filename: input.filename,
        size_bytes: input.size,
        sha256: input.sha256,
      });
      const objectKey = `api/${project.organization.id}/import/${row.id}/${crypto.randomUUID()}`;
      const updated = (await importJobs.update(project.ctx, row.id, { object_key: objectKey }))!;
      const put = await store.presignPut(
        objectKey,
        { contentType: 'text/csv', size: input.size, sha256: input.sha256 },
        ATTACHMENT_UPLOAD_TTL_SECONDS,
      );
      return {
        job: await dto(project.ctx, project.project.key, updated),
        upload_url: put.url,
        upload_headers: put.headers,
        expires_in: ATTACHMENT_UPLOAD_TTL_SECONDS,
      };
    },

    /** After the PUT: the file is checked, its headers read and a mapping suggested. Repeatable. */
    async complete(principal: Principal, key: string, id: number, hints: OrgHints = {}): Promise<ImportPreview> {
      const project = await importAccess(principal, key, hints);
      let row = await findJob(project, id);
      if (row.status !== 'awaiting_upload' && row.status !== 'ready') {
        throw new AppError('import.not_ready', 409, { id, status: row.status });
      }
      const stored = row.object_key ? await platform().head(row.object_key) : null;
      if (!stored) throw new AppError('import.upload_missing', 400);
      if (stored.size !== row.size_bytes || (stored.sha256 !== undefined && stored.sha256 !== row.sha256)) {
        throw new AppError('import.upload_mismatch', 400);
      }
      const file = await readFile(row);
      row = (await importJobs.update(project.ctx, row.id, {
        status: 'ready',
        headers: file.headers,
        total_rows: file.rows.length,
      }))!;
      return {
        job: await dto(project.ctx, project.project.key, row),
        sample: file.rows.slice(0, CSV_IMPORT_SAMPLE_ROWS),
        suggested_mapping: await suggest(project, file.headers),
      };
    },

    async dryRun(
      principal: Principal,
      key: string,
      id: number,
      input: RunImport,
      hints: OrgHints = {},
    ): Promise<ImportDryRun> {
      const project = await importAccess(principal, key, hints);
      const row = await findJob(project, id);
      if (row.status !== 'ready') throw new AppError('import.not_ready', 409, { id, status: row.status });
      const { file, mapped, byEmail } = await prepared(principal, project, row, input.column_mapping);
      // Rows are checked as the job will create them: as the importer, once Import is allowed.
      const importer = actingAs({ created_by: principal.userId, org_id: project.organization.id });
      const memo = createMemo();
      const errors: ImportRowError[] = [];
      const unknown = new Map<string, { field: string; value: string; rows: number }>();
      let failed = 0;
      for (const [i, cells] of file.rows.entries()) {
        const outcome = await checkRow(importer, project, input.column_mapping, mapped, byEmail, memo, cells, i + 2);
        if (!outcome.error) continue;
        failed++;
        if (errors.length < CSV_IMPORT_ERRORS_KEPT) errors.push(outcome.error);
        const field = UNKNOWN_VALUE_FIELDS[outcome.error.code];
        const at = field ? mapped.columns.get(field) : undefined;
        if (field && at !== undefined) {
          const values = field === 'assignees' ? splitList(cells[at] ?? '') : [(cells[at] ?? '').trim()];
          for (const value of values) {
            const k = `${field}\u0000${value.toLowerCase()}`;
            const seen = unknown.get(k) ?? { field, value, rows: 0 };
            seen.rows++;
            unknown.set(k, seen);
          }
        }
      }
      analytics.capture(
        'csv_import_started',
        {
          via: viaOf(principal),
          dry_run: true,
          rows: file.rows.length,
          mapped_fields: mapped.columns.size,
        },
        { userId: principal.userId, orgId: project.organization.id },
      );
      return {
        total_rows: file.rows.length,
        valid_rows: file.rows.length - failed,
        failed_rows: failed,
        errors,
        unknown_values: [...unknown.values()].sort((a, b) => b.rows - a.rows),
      };
    },

    async start(principal: Principal, key: string, id: number, input: RunImport, hints: OrgHints = {}) {
      const project = await importAccess(principal, key, hints);
      if (project.project.is_archived) throw new AppError('project.archived', 409, { key: project.project.key });
      const row = await findJob(project, id);
      if (row.status !== 'ready') throw new AppError('import.not_ready', 409, { id, status: row.status });
      const { file, mapped } = await prepared(principal, project, row, input.column_mapping);
      const queued = await importJobs.transition(project.ctx, row.id, ['ready'], {
        status: 'queued',
        column_mapping: input.column_mapping,
        total_rows: file.rows.length,
      });
      if (!queued) throw new AppError('import.not_ready', 409, { id, status: row.status });
      await deps
        .queue()
        .send(
          'import.csv',
          { org_id: project.organization.id, job_id: row.id },
          { startAfter: now(), singletonKey: `import:${row.id}` },
        );
      analytics.capture(
        'csv_import_started',
        { via: viaOf(principal), dry_run: false, rows: file.rows.length, mapped_fields: mapped.columns.size },
        { userId: principal.userId, orgId: project.organization.id },
      );
      return dto(project.ctx, project.project.key, queued);
    },

    async get(principal: Principal, key: string, id: number, hints: OrgHints = {}): Promise<ImportJob> {
      const project = await importAccess(principal, key, hints);
      return dto(project.ctx, project.project.key, await findJob(project, id));
    },

    async list(principal: Principal, key: string, hints: OrgHints = {}): Promise<ImportJob[]> {
      const project = await importAccess(principal, key, hints);
      const rows = await importJobs.list(project.ctx, project.project.id, IMPORT_JOBS_LISTED);
      return Promise.all(rows.map(r => dto(project.ctx, project.project.key, r)));
    },

    /**
     * `import.csv`: rows from the first unwritten one, each created in its own transaction with
     * the job's progress, so a run cut short resumes without creating anything twice.
     */
    async run(job: ImportCsvJob, at = now()): Promise<number> {
      const ctx = tenantContext(job.org_id);
      let row = await importJobs.findById(ctx, job.job_id);
      if (!row || (row.status !== 'queued' && row.status !== 'running')) return 0;
      row = (await importJobs.transition(ctx, row.id, ['queued', 'running'], {
        status: 'running',
        started_at: row.started_at ?? at,
      }))!;
      const started = Date.now();
      const mapping = row.column_mapping as ImportMapping;
      const principal = actingAs(row);
      const fail = async (code: JobError) => {
        await importJobs.transition(ctx, row!.id, ['running'], { status: 'failed', error: code, completed_at: now() });
        await release(ctx, row!);
        return 0;
      };

      let project: ProjectAccess;
      let file: Parsed;
      let mapped: Mapped;
      let byEmail: Map<string, string>;
      try {
        const org = await access.orgById(principal, row.org_id);
        project = await access.projectById(principal, org, row.project_id);
        access.require(principal, 'issue.import', project.scope);
        ({ file, mapped, byEmail } = await prepared(principal, project, row, mapping));
      } catch (err) {
        if (err instanceof AppError && err.status < 500) {
          return fail(err.code === 'import.upload_missing' ? 'import.upload_missing' : 'forbidden');
        }
        throw err;
      }

      const memo = createMemo();
      const errors = [...(row.errors as ImportRowError[])];
      let failed = row.failed_rows;
      let created = 0;
      let index = row.processed_rows;
      try {
        for (; index < file.rows.length; index++) {
          if (Date.now() - started > IMPORT_RUN_MS) {
            await deps.queue().send('import.csv', job, { startAfter: now(), singletonKey: `import:${row.id}` });
            return created;
          }
          const outcome = await checkRow(
            principal,
            project,
            mapping,
            mapped,
            byEmail,
            memo,
            file.rows[index]!,
            index + 2,
          );
          if (outcome.error || !outcome.plan) {
            failed++;
            if (errors.length < CSV_IMPORT_ERRORS_KEPT) errors.push(outcome.error!);
            continue;
          }
          const progress = { processed_rows: index + 1, failed_rows: failed, errors: [...errors] };
          try {
            await issues.insertPlanned(principal, project, outcome.plan, {
              watch: false,
              also: async repos => {
                await repos.importJobs.update(ctx, row!.id, {
                  ...progress,
                  created_issues: row!.created_issues + created + 1,
                });
              },
            });
            created++;
          } catch (err) {
            if (!(err instanceof AppError) || err.status >= 500) throw err;
            failed++;
            if (errors.length < CSV_IMPORT_ERRORS_KEPT) {
              errors.push({
                row: index + 2,
                ...columnOf(mapping, err.field),
                code: err.code,
                message: err.message,
                ...(err.validValues ? { valid_values: err.validValues } : {}),
              });
            }
          }
        }
      } catch (err) {
        await importJobs.update(ctx, row.id, { failed_rows: failed, errors });
        await fail('import.failed');
        throw err;
      }

      const done = (await importJobs.transition(ctx, row.id, ['running'], {
        status: 'completed',
        processed_rows: file.rows.length,
        failed_rows: failed,
        errors,
        completed_at: now(),
      }))!;
      await release(ctx, done);
      analytics.capture(
        'csv_import_finished',
        {
          rows: file.rows.length,
          created: done.created_issues,
          failed,
          duration_ms: done.completed_at!.getTime() - done.started_at!.getTime(),
        },
        { userId: row.created_by, orgId: row.org_id },
      );
      return created;
    },

    /** Hourly: files of ended jobs not yet deleted, and uploads nobody ran within a day. */
    async sweep(at = now()): Promise<number> {
      const before = new Date(at.getTime() - CSV_IMPORT_ABANDONED_HOURS * 3_600_000);
      const rows = await importJobs.listSweepable(
        systemContext('the hourly sweep deletes spent import files across every organisation'),
        before,
        TRANSFER_SWEEP_BATCH,
      );
      for (const row of rows) {
        const ctx = tenantContext(row.org_id);
        if (row.status === 'awaiting_upload' || row.status === 'ready') {
          await importJobs.transition(ctx, row.id, ['awaiting_upload', 'ready'], { status: 'expired' });
        }
        await release(ctx, row);
      }
      return rows.length;
    },
  };
}

export type ImportsService = ReturnType<typeof importsService>;

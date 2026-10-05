import type { FastifyBaseLogger } from 'fastify';
import {
  ARTICLE_RESTORE_WINDOW_DAYS,
  BYO_CHECK_OBJECT_BYTES,
  BYO_MIGRATION_STALL_MINUTES,
  BYO_SECRET_MASK,
  ISSUE_RESTORE_WINDOW_DAYS,
  STORAGE_CRITICAL_PERCENT,
  type ByoCheckError,
  type ByoMigrationState,
  type ByoProvider,
  type ByoStatus,
  type ConnectStorage,
  type OrgPlan,
  type Pagination,
  type Principal,
  type StepUp,
  type StorageBrowserCheck,
  type StorageBrowserCheckInput,
  type StorageConnection,
  type StorageFile,
  type StorageFilesQuery,
  type StorageNoticeLevel,
  type StorageOverview,
  type VerifyStorage,
} from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type AttachmentRow,
  type AttachmentsRepository,
  type IssuesRepository,
  type OrganizationsRepository,
  type OrgStorageConfigsRepository,
  type OrgStorageLocationsRepository,
  type ProjectsRepository,
  type StorageConnectionRow,
  type StorageTallyRow,
  type TenantContext,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { formatIssueKey } from '@nothingleft/format';
import { MIGRATION_BATCH, MIGRATION_RUN_FILES, MIGRATION_RUN_MS, BYO_CHECK_TTL_SECONDS } from '@config/constants';
import { seal } from '@lib/crypto';
import { AppError } from '@lib/errors';
import type { JobQueue, StorageMigrateJob } from '@lib/jobs';
import { classifyStorageError, type PrivateStore, type Storage } from '@lib/storage';
import type { AccessService, OrgAccess, ProjectAccess } from '@services/access';
import type { AttachmentsService } from '@services/attachments.service';
import { releaseStorage } from '@services/attachment-writer';
import {
  bringYourOwnState,
  decodeCheckError,
  encodeCheckError,
  isByoUnavailable,
  pathStyleFor,
  sealedSecretAad,
  type ObjectStores,
} from '@services/object-stores';
import { can } from '@services/permissions';
import type { InTenantTransaction } from '@services/transaction';
import { requireSession, type TwoFactorService } from '@services/two-factor.service';

export interface StorageDeps {
  access: AccessService;
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  issuesRepo: IssuesRepository;
  attachments: AttachmentsRepository;
  configs: OrgStorageConfigsRepository;
  locations: OrgStorageLocationsRepository;
  attachmentsService: AttachmentsService;
  inTransaction: InTenantTransaction;
  storage: Storage;
  stores: ObjectStores;
  twoFactor: TwoFactorService;
  masterKey: Buffer;
  /** Read lazily: pg-boss replaces the recording queue once jobs start. */
  queue: () => JobQueue;
  analytics: Analytics;
  log: FastifyBaseLogger;
  appBaseUrl: string;
  filesBaseUrl: string;
  /** Development and tests only: lets a connection name its own endpoint. */
  allowAnyEndpoint: boolean;
  now?: () => Date;
}

const DAY_MS = 86_400_000;

class CheckFailed extends Error {
  constructor(readonly check: ByoCheckError) {
    super(`${check.step}.${check.reason}`);
  }
}

/** Runs one step of a check, turning the bucket's refusal into the step and reason it failed at. */
async function step<T>(name: ByoCheckError['step'], call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof CheckFailed) throw error;
    const reason = classifyStorageError(error);
    throw new CheckFailed({ step: reason === 'unreachable' ? 'connect' : name, reason });
  }
}

/** Write, read back and delete a small object: the three things this application ever asks of the bucket. */
async function roundTrip(store: PrivateStore, orgId: number): Promise<void> {
  const key = `api/${orgId}/_check/server-${crypto.randomUUID()}`;
  const body = crypto.getRandomValues(new Uint8Array(32));
  await step('put', () => store.put(key, body, 'application/octet-stream'));
  const back = await step('get', () => store.read(key));
  if (!back || Buffer.compare(Buffer.from(back), Buffer.from(body)) !== 0) {
    throw new CheckFailed({ step: 'get', reason: 'mismatch' });
  }
  await step('delete', () => store.delete(key));
}

interface Target {
  provider: ByoProvider;
  endpoint: string;
  region: string;
  bucket: string;
}

function checkError(check: ByoCheckError, target: Target, accessKeyId: string): AppError {
  const params = {
    access_key_id: accessKeyId,
    bucket: target.bucket,
    region: target.region,
    endpoint: target.endpoint,
  };
  const locator = target.provider === 'r2' ? 'account_id' : 'region';
  switch (check.reason) {
    case 'invalid_key':
      return new AppError('storage.check_invalid_key', 422, params, 'access_key_id');
    case 'wrong_secret':
      return new AppError('storage.check_wrong_secret', 422, params, 'secret_access_key');
    case 'no_bucket':
      return new AppError('storage.check_no_bucket', 422, params, 'bucket');
    case 'access_denied':
      return check.step === 'put'
        ? new AppError('storage.check_denied_put', 422, params, 'access_key_id')
        : check.step === 'get'
          ? new AppError('storage.check_denied_get', 422, params, 'access_key_id')
          : check.step === 'delete'
            ? new AppError('storage.check_denied_delete', 422, params, 'access_key_id')
            : new AppError('storage.check_denied', 422, params, 'access_key_id');
    case 'wrong_region':
      return new AppError('storage.check_wrong_region', 422, params, 'region');
    case 'unreachable':
      return new AppError('storage.check_unreachable', 422, params, locator);
    case 'mismatch':
      return new AppError('storage.check_mismatch', 422, params);
    case 'unknown':
      return new AppError('storage.check_unknown', 422, params);
  }
}

export function storageService(deps: StorageDeps) {
  const { access, organizations, attachments, configs, locations, inTransaction, stores, analytics, log } = deps;
  const now = deps.now ?? (() => new Date());
  const filesBase = deps.filesBaseUrl.replace(/\/$/, '');
  const sys = systemContext('the nightly storage reconcile spans every organisation');

  async function readAccess(principal: Principal, slug: string): Promise<OrgAccess> {
    const org = await access.org(principal, slug);
    access.require(principal, 'org.storage.read', org.scope);
    return org;
  }

  /** Session only: a token can never carry or change the organisation's storage credentials. */
  async function configureAccess(principal: Principal, slug: string): Promise<OrgAccess> {
    requireSession(principal);
    const org = await access.org(principal, slug);
    access.require(principal, 'org.storage.configure', org.scope);
    return org;
  }

  async function requireConnection(org: OrgAccess): Promise<StorageConnectionRow> {
    const row = await configs.find(org.ctx);
    if (!row) throw new AppError('storage.connection_not_found', 404, { slug: org.organization.slug });
    return row;
  }

  function targetOf(input: ConnectStorage): Target {
    if (input.endpoint !== undefined) {
      if (!deps.allowAnyEndpoint) throw new AppError('storage.endpoint_not_allowed', 400, {}, 'endpoint');
      return {
        provider: input.provider,
        endpoint: input.endpoint,
        region: input.region ?? 'auto',
        bucket: input.bucket,
      };
    }
    if (input.provider === 'r2') {
      if (!input.account_id) throw new AppError('storage.endpoint_required', 400, {}, 'account_id');
      const zone = input.jurisdiction && input.jurisdiction !== 'default' ? `.${input.jurisdiction}` : '';
      return {
        provider: 'r2',
        endpoint: `https://${input.account_id}${zone}.r2.cloudflarestorage.com`,
        region: 'auto',
        bucket: input.bucket,
      };
    }
    if (!input.region) throw new AppError('storage.endpoint_required', 400, {}, 'region');
    return {
      provider: 's3',
      endpoint: `https://s3.${input.region}.amazonaws.com`,
      region: input.region,
      bucket: input.bucket,
    };
  }

  const connectTo = (target: Target, accessKeyId: string, secretAccessKey: string) =>
    deps.storage.connect({
      ...target,
      accessKeyId,
      secretAccessKey,
      pathStyle: pathStyleFor(target.provider, target.endpoint),
    });

  async function memberRef(ctx: TenantContext, userId: number) {
    const member = await organizations.findMemberByUserId(ctx, userId, { includeRemoved: true });
    return member
      ? access.memberRef(member.user, member.membership)
      : { username: '', name: '', avatar_url: null, former_member: true, deactivated: false };
  }

  async function connectionDto(ctx: TenantContext, row: StorageConnectionRow): Promise<StorageConnection> {
    const state = row.migration_state as ByoMigrationState;
    const stallBefore = now().getTime() - BYO_MIGRATION_STALL_MINUTES * 60_000;
    return {
      provider: row.provider as ByoProvider,
      endpoint: row.endpoint,
      region: row.region,
      bucket: row.bucket,
      access_key_id: row.access_key_id,
      secret: BYO_SECRET_MASK,
      status: row.status as ByoStatus,
      verified_at: row.verified_at?.toISOString() ?? null,
      checked_at: row.checked_at?.toISOString() ?? null,
      last_error: decodeCheckError(row.last_error),
      migration: {
        state,
        migrated_bytes: row.migrated_bytes,
        total_bytes: row.total_bytes,
        migrated_files: row.migrated_files,
        total_files: row.total_files,
        error: decodeCheckError(row.migration_error),
        started_at: row.migration_started_at?.toISOString() ?? null,
        finished_at: row.migration_finished_at?.toISOString() ?? null,
        stalled: state === 'running' && row.updated_at.getTime() < stallBefore,
      },
      created_by: await memberRef(ctx, row.created_by),
      updated_by: await memberRef(ctx, row.updated_by),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  function tally(rows: StorageTallyRow[], keep: (r: StorageTallyRow) => boolean) {
    const kept = rows.filter(keep);
    return { files: kept.reduce((n, r) => n + r.files, 0), bytes: kept.reduce((n, r) => n + r.bytes, 0) };
  }

  async function overviewFor(org: OrgAccess): Promise<StorageOverview> {
    const ctx = org.ctx;
    const [organization, row, tallies] = await Promise.all([
      organizations.findById(ctx),
      configs.find(ctx),
      attachments.storageTallies(ctx),
    ]);
    const usage = access.storageUsage(organization ?? org.organization, bringYourOwnState(row));
    const current = (r: StorageTallyRow) =>
      r.storage_target === 'byo' && row !== undefined && r.storage_location_id === row.location_id;
    const earlier = Map.groupBy(
      tallies.filter(r => r.storage_target === 'byo' && !current(r)),
      r => r.bucket,
    );
    return {
      platform: {
        files: tally(tallies, r => r.storage_target === 'platform').files,
        bytes: usage.used_bytes,
        limit_bytes: usage.limit_bytes,
        level: usage.level,
      },
      bring_your_own: tally(tallies, current),
      unclaimed: tally(tallies, r => r.draft),
      awaiting_purge: tally(tallies, r => r.parent_deleted),
      earlier_buckets: [...earlier].map(([bucket, rows]) => ({ bucket, ...tally(rows, () => true) })),
      connection: row ? await connectionDto(ctx, row) : null,
      cors_origin: deps.appBaseUrl,
    };
  }

  async function record(
    org: OrgAccess,
    principal: Principal,
    kind: 'storage_connected' | 'storage_updated' | 'storage_disconnected',
    values: { old_value?: Record<string, string>; new_value?: Record<string, string> },
    ip: string | null,
  ) {
    await inTransaction(repos =>
      repos.activity.record(org.ctx, {
        actor_id: principal.userId,
        kind,
        target_type: 'organization',
        target_id: String(org.organization.id),
        old_value: values.old_value ?? null,
        new_value: values.new_value ?? null,
        ip,
      }),
    );
  }

  async function actorName(org: OrgAccess): Promise<string> {
    const self = await organizations.findMemberByUserId(org.ctx, org.membership.user_id);
    return self?.user.name ?? org.membership.username;
  }

  const describe = (row: Pick<StorageConnectionRow, 'provider' | 'bucket' | 'access_key_id'>) => ({
    provider: row.provider,
    bucket: row.bucket,
    access_key_id: row.access_key_id,
  });

  /** A file moved across, or why not: 'skipped' when its platform object is gone, 'gone' when its row was deleted mid-copy. */
  async function moveOne(
    ctx: TenantContext,
    conn: StorageConnectionRow,
    target: PrivateStore,
    row: AttachmentRow,
  ): Promise<'moved' | 'skipped' | 'gone'> {
    const source = stores.platform();
    const opened = await step('get', () => source.open(row.object_key));
    if (!opened) {
      log.warn({ org_id: ctx.orgId, attachment_id: row.id }, 'storage.migrate: platform object missing, left in place');
      await configs.recordSkipped(ctx, row.size_bytes, now());
      return 'skipped';
    }
    const spec = {
      contentType: row.mime_type,
      size: row.size_bytes,
      sha256: Buffer.from(row.checksum).toString('base64'),
    };
    await stores.guard(ctx, conn, 'put', () => step('put', () => target.putStream(row.object_key, opened.body, spec)));
    const head = await stores.guard(ctx, conn, 'get', () => step('get', () => target.head(row.object_key)));
    if (!head || head.size !== row.size_bytes || (head.sha256 !== undefined && head.sha256 !== spec.sha256)) {
      throw new CheckFailed({ step: 'get', reason: 'mismatch' });
    }
    const moved = await inTransaction(async repos => {
      const switched = await repos.attachments.moveToLocation(ctx, row.id, {
        id: conn.location_id,
        bucket: conn.bucket,
      });
      if (!switched) return false;
      await releaseStorage(repos, ctx, [row], access.storageLimit);
      await repos.storageConfigs.recordMigrated(ctx, row.size_bytes, now());
      return true;
    });
    if (!moved) {
      await stores.guard(ctx, conn, 'delete', () => target.delete(row.object_key));
      return 'gone';
    }
    // After the commit: until then the row still points here. A failure strands an unbilled copy, never a file.
    try {
      await source.delete(row.object_key);
    } catch (error) {
      log.warn({ org_id: ctx.orgId, attachment_id: row.id, err: error }, 'storage.migrate: platform copy not deleted');
    }
    return 'moved';
  }

  async function failMigration(ctx: TenantContext, conn: StorageConnectionRow, moved: number, check: ByoCheckError) {
    const failed = await configs.failMigration(ctx, encodeCheckError(check), now());
    if (!failed) return;
    analytics.capture(
      'byo_storage_migration_failed',
      { provider: conn.provider as ByoProvider, files_moved: failed.migrated_files, ...check },
      { orgId: ctx.orgId },
    );
    log.warn({ org_id: ctx.orgId, moved, ...check }, 'storage.migrate failed');
  }

  async function probe(row: StorageConnectionRow): Promise<void> {
    const ctx = tenantContext(row.org_id);
    try {
      await roundTrip(stores.customer(row), row.org_id);
      await configs.recordCheck(ctx, { status: 'verified', last_error: null, at: now() });
    } catch (error) {
      if (!(error instanceof CheckFailed)) throw error;
      if (row.status === 'verified' && error.check.reason !== 'unreachable' && error.check.reason !== 'unknown') {
        await stores.trip(ctx, row, error.check);
      }
    }
  }

  return {
    async overview(principal: Principal, slug: string): Promise<StorageOverview> {
      return overviewFor(await readAccess(principal, slug));
    },

    async files(
      principal: Principal,
      slug: string,
      query: StorageFilesQuery,
    ): Promise<{ data: StorageFile[]; pagination: Pagination }> {
      const org = await readAccess(principal, slug);
      const ctx = org.ctx;
      let projectId: number | undefined;
      if (query.project !== undefined) {
        const project = await deps.projects.findByKey(ctx, query.project);
        if (!project) throw new AppError('project.not_found', 404, { key: query.project }, 'project');
        projectId = project.id;
      }
      const { rows, total } = await attachments.listStorageFiles(ctx, {
        sort: query.sort,
        target: query.target,
        projectId,
        limit: query.limit,
        offset: query.offset,
      });
      const holders = new Map<number, ProjectAccess>();
      for (const id of new Set(rows.map(r => r.project_id)))
        holders.set(id, await access.projectById(principal, org, id));
      const [people, available] = await Promise.all([
        deps.issuesRepo.findPeople(
          ctx,
          rows.map(r => r.attachment.created_by),
        ),
        stores.availability(
          ctx,
          rows.map(r => r.attachment),
        ),
      ]);
      const byId = new Map(people.map(p => [p.user.id, p]));
      const data = rows.map(({ attachment: a, ...r }): StorageFile => {
        const holder = holders.get(r.project_id)!;
        const person = byId.get(a.created_by);
        const windowDays = a.article_id === null ? ISSUE_RESTORE_WINDOW_DAYS : ARTICLE_RESTORE_WINDOW_DAYS;
        return {
          id: a.public_id,
          filename: a.filename,
          mime_type: a.mime_type,
          size_bytes: a.size_bytes,
          url: `${filesBase}/${a.public_id}/${encodeURIComponent(a.filename)}`,
          storage_target: a.storage_target as StorageFile['storage_target'],
          available: available(a),
          project: r.project_key,
          issue: r.issue_number === null ? null : formatIssueKey(r.project_key, r.issue_number),
          article: r.article_slug === null ? null : { slug: r.article_slug, title: r.article_title ?? '' },
          comment_id: a.comment_id,
          work_item_id: a.work_item_id,
          purges_at: r.parent_deleted_at
            ? new Date(r.parent_deleted_at.getTime() + windowDays * DAY_MS).toISOString()
            : null,
          created_by: person
            ? access.memberRef(person.user, person.membership)
            : { username: '', name: '', avatar_url: null, former_member: true, deactivated: false },
          created_at: a.created_at.toISOString(),
          me: {
            can_delete:
              r.parent_deleted_at === null &&
              !holder.project.is_archived &&
              can(principal, 'attachment.delete', { ...holder.scope, isOwnRecord: a.created_by === principal.userId }),
          },
        };
      });
      return {
        data,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          next_cursor: null,
          has_more: query.offset + data.length < total,
        },
      };
    },

    /**
     * Connects a bucket, or rotates the key of the one connected. The server-side round trip runs
     * first; a new connection is saved either way (as failed, so the form keeps what was typed),
     * while a failed rotation changes nothing and the old key keeps serving.
     */
    async connect(
      principal: Principal,
      slug: string,
      input: ConnectStorage,
      ip: string | null,
    ): Promise<StorageConnection> {
      const org = await configureAccess(principal, slug);
      await deps.twoFactor.stepUp(principal, input);
      const ctx = org.ctx;
      const target = targetOf(input);
      const existing = await configs.find(ctx);
      const sameLocation =
        existing !== undefined &&
        existing.provider === target.provider &&
        existing.endpoint === target.endpoint &&
        existing.bucket === target.bucket;
      // Only a connection that once verified has files to keep serving; any other starts over.
      const rotation = sameLocation && existing.verified_at !== null;
      if (existing && !sameLocation && existing.verified_at !== null) {
        const inUse = (await attachments.storageTallies(ctx)).some(r => r.storage_location_id === existing.location_id);
        if (inUse) throw new AppError('storage.bucket_in_use', 409, { bucket: existing.bucket }, 'bucket');
      }

      const secret = seal(deps.masterKey, 'byo_storage', sealedSecretAad(ctx.orgId), input.secret_access_key);
      const at = now();
      let failure: ByoCheckError | null = null;
      try {
        await roundTrip(connectTo(target, input.access_key_id, input.secret_access_key), ctx.orgId);
      } catch (error) {
        if (!(error instanceof CheckFailed)) throw error;
        failure = error.check;
      }
      if (failure) {
        analytics.capture('byo_storage_check_failed', { provider: target.provider, ...failure }, { orgId: ctx.orgId });
        if (!rotation) {
          const location = await locations.ensure(ctx, target);
          await configs.replace(
            ctx,
            { location_id: location.id, access_key_id: input.access_key_id, secret_ciphertext: secret },
            principal.userId,
            at,
          );
          await configs.recordCheck(ctx, { status: 'failed', last_error: encodeCheckError(failure), at });
        }
        throw checkError(failure, target, input.access_key_id);
      }

      if (rotation) {
        await configs.rotate(
          ctx,
          { access_key_id: input.access_key_id, secret_ciphertext: secret },
          principal.userId,
          at,
        );
        const row = (await configs.recordCheck(ctx, { status: 'verified', last_error: null, at }))!;
        await record(
          org,
          principal,
          'storage_updated',
          { old_value: describe(existing!), new_value: describe(row) },
          ip,
        );
        analytics.capture(
          'byo_storage_connected',
          { provider: target.provider, rotated: true },
          { orgId: ctx.orgId, userId: principal.userId },
        );
        return connectionDto(ctx, row);
      }
      const location = await locations.ensure(ctx, target);
      const row = await configs.replace(
        ctx,
        { location_id: location.id, access_key_id: input.access_key_id, secret_ciphertext: secret },
        principal.userId,
        at,
      );
      return connectionDto(ctx, (await configs.recordCheck(ctx, { status: 'pending', last_error: null, at })) ?? row);
    },

    /** Signed URLs for the browser's half of the check: its PUT and GET prove the bucket's CORS rule. */
    async browserCheck(
      principal: Principal,
      slug: string,
      input: StorageBrowserCheckInput,
    ): Promise<StorageBrowserCheck> {
      const org = await configureAccess(principal, slug);
      const row = await requireConnection(org);
      const store = stores.customer(row);
      const checkId = crypto.randomUUID();
      const key = `api/${org.ctx.orgId}/_check/${checkId}`;
      const upload = await store.presignPut(
        key,
        { contentType: 'application/octet-stream', size: input.size, sha256: input.sha256 },
        BYO_CHECK_TTL_SECONDS,
      );
      const download = await store.presignGet(
        key,
        { contentType: 'application/octet-stream', disposition: 'attachment; filename="check.bin"' },
        BYO_CHECK_TTL_SECONDS,
      );
      return {
        check_id: checkId,
        upload_url: upload.url,
        upload_headers: upload.headers,
        download_url: download,
        expires_in: BYO_CHECK_TTL_SECONDS,
      };
    },

    /** The browser uploaded and read the test file: confirm it landed intact, delete it, and switch uploads over. */
    async verify(
      principal: Principal,
      slug: string,
      input: VerifyStorage,
      ip: string | null,
    ): Promise<StorageConnection> {
      const org = await configureAccess(principal, slug);
      const ctx = org.ctx;
      const row = await requireConnection(org);
      const target = {
        provider: row.provider as ByoProvider,
        endpoint: row.endpoint,
        region: row.region,
        bucket: row.bucket,
      };
      const store = stores.customer(row);
      const key = `api/${ctx.orgId}/_check/${input.check_id}`;
      const at = now();
      try {
        const head = await step('browser', () => store.head(key));
        if (!head) throw new AppError('storage.check_expired', 422, {}, 'check_id');
        if (head.size !== BYO_CHECK_OBJECT_BYTES || (head.sha256 !== undefined && head.sha256 !== input.sha256)) {
          throw new CheckFailed({ step: 'browser', reason: 'mismatch' });
        }
        await step('delete', () => store.delete(key));
      } catch (error) {
        if (!(error instanceof CheckFailed)) throw error;
        analytics.capture(
          'byo_storage_check_failed',
          { provider: target.provider, ...error.check },
          { orgId: ctx.orgId },
        );
        await configs.recordCheck(ctx, { status: 'failed', last_error: encodeCheckError(error.check), at });
        throw checkError(error.check, target, row.access_key_id);
      }

      const first = row.status !== 'verified';
      const verified = (await configs.recordCheck(ctx, { status: 'verified', last_error: null, at }))!;
      if (first) {
        await record(org, principal, 'storage_connected', { new_value: describe(verified) }, ip);
        await stores.notifyAdmins(ctx, 'storage_connected', { actor: await actorName(org), bucket: verified.bucket });
        analytics.capture(
          'byo_storage_connected',
          { provider: target.provider, rotated: false },
          { orgId: ctx.orgId, userId: principal.userId },
        );
      }
      return connectionDto(ctx, verified);
    },

    /** Starts moving the platform's copy of every file across, or retries a failed or stalled run. */
    async startMigration(principal: Principal, slug: string): Promise<StorageConnection> {
      const org = await configureAccess(principal, slug);
      const ctx = org.ctx;
      const row = await requireConnection(org);
      if (row.status !== 'verified') throw new AppError('storage.not_verified', 409);
      const stalled =
        row.migration_state === 'running' &&
        row.updated_at.getTime() < now().getTime() - BYO_MIGRATION_STALL_MINUTES * 60_000;
      if (row.migration_state === 'running' && !stalled) {
        throw new AppError('storage.migration_running', 409, { bucket: row.bucket });
      }
      const remaining = await attachments.platformTally(ctx);
      if (stalled) await configs.failMigration(ctx, encodeCheckError({ step: 'connect', reason: 'unknown' }), now());
      const started = await configs.startMigration(ctx, remaining, now());
      if (!started) throw new AppError('storage.migration_running', 409, { bucket: row.bucket });
      await deps
        .queue()
        .send('storage.migrate', { org_id: ctx.orgId }, { startAfter: now(), singletonKey: `org:${ctx.orgId}` });
      analytics.capture(
        'byo_storage_migration_started',
        {
          provider: row.provider as ByoProvider,
          files: remaining.files,
          bytes: remaining.bytes,
          retry: row.migration_state !== 'idle',
        },
        { orgId: ctx.orgId, userId: principal.userId },
      );
      return connectionDto(ctx, started);
    },

    /**
     * Forgets the connection and its secret, and keeps its location. Files there keep their rows, so
     * connecting the same location again serves them again; nothing in the bucket is touched.
     */
    async disconnect(principal: Principal, slug: string, input: StepUp, ip: string | null): Promise<StorageOverview> {
      const org = await configureAccess(principal, slug);
      await deps.twoFactor.stepUp(principal, input);
      const ctx = org.ctx;
      const row = await requireConnection(org);
      const left = (await attachments.storageTallies(ctx)).filter(r => r.storage_location_id === row.location_id);
      const removed = await inTransaction(async repos => {
        const gone = await repos.storageConfigs.remove(ctx);
        if (!gone) return null;
        await repos.activity.record(ctx, {
          actor_id: principal.userId,
          kind: 'storage_disconnected',
          target_type: 'organization',
          target_id: String(org.organization.id),
          old_value: describe(gone),
          new_value: null,
          ip,
        });
        return gone;
      });
      if (!removed) throw new AppError('storage.connection_not_found', 404, { slug });
      if (removed.status === 'verified' || removed.status === 'failed') {
        await stores.notifyAdmins(ctx, 'storage_disconnected', { actor: await actorName(org), bucket: removed.bucket });
      }
      analytics.capture(
        'byo_storage_disconnected',
        {
          provider: removed.provider as ByoProvider,
          files_left: left.reduce((n, r) => n + r.files, 0),
          bytes_left: left.reduce((n, r) => n + r.bytes, 0),
          days_connected: removed.verified_at
            ? Math.max(0, (now().getTime() - removed.verified_at.getTime()) / DAY_MS)
            : 0,
        },
        { orgId: ctx.orgId, userId: principal.userId },
      );
      return overviewFor(org);
    },

    /**
     * The queued storage.migrate: moves up to a run's worth of platform files, then queues the next
     * run from where it stopped. Every file serves throughout; a failure stops the run and leaves
     * each file where it last landed.
     */
    async migrate(job: StorageMigrateJob, at: Date = now()): Promise<number> {
      const ctx = tenantContext(job.org_id);
      let conn = await configs.find(ctx);
      if (!conn || conn.status !== 'verified') return 0;
      if (conn.migration_state === 'done') {
        // A late platform upload after the migration finished: carry it across too.
        const remaining = await attachments.platformTally(ctx);
        if (remaining.files === 0) return 0;
        conn = (await configs.startMigration(ctx, remaining, at)) ?? conn;
      }
      if (conn.migration_state !== 'running') return 0;

      const target = stores.customer(conn);
      const deadline = at.getTime() + MIGRATION_RUN_MS;
      let afterId = job.after_id ?? 0;
      let moved = 0;
      let skipped = 0;
      for (;;) {
        const batch = await attachments.platformBatch(ctx, MIGRATION_BATCH, afterId);
        if (batch.length === 0) break;
        for (const row of batch) {
          if (moved >= MIGRATION_RUN_FILES || now().getTime() > deadline) {
            await configs.heartbeat(ctx, now());
            await deps
              .queue()
              .send(
                'storage.migrate',
                { org_id: job.org_id, after_id: afterId },
                { startAfter: now(), singletonKey: `org:${job.org_id}` },
              );
            return moved;
          }
          try {
            const outcome = await moveOne(ctx, conn, target, row);
            if (outcome === 'moved') moved++;
            if (outcome === 'skipped') skipped++;
          } catch (error) {
            const check =
              error instanceof CheckFailed
                ? error.check
                : isByoUnavailable(error)
                  ? (decodeCheckError((await configs.find(ctx))?.last_error ?? null) ?? {
                      step: 'put',
                      reason: 'access_denied',
                    })
                  : { step: 'put' as const, reason: classifyStorageError(error) };
            await failMigration(ctx, conn, moved, check);
            return moved;
          }
          afterId = row.id;
        }
      }
      const finished = await configs.finishMigration(ctx, now());
      if (finished) {
        analytics.capture(
          'byo_storage_migration_finished',
          {
            provider: conn.provider as ByoProvider,
            files: finished.migrated_files,
            bytes: finished.migrated_bytes,
            skipped,
            seconds: finished.migration_started_at
              ? (now().getTime() - finished.migration_started_at.getTime()) / 1000
              : 0,
          },
          { orgId: ctx.orgId },
        );
      }
      return moved;
    },

    /**
     * Nightly: recompute every organisation's `storage_used_bytes` from its platform files, log and
     * correct any drift, and set the notice level to what the true figure says. Then probe each
     * customer bucket and re-queue any migration whose job died.
     */
    async reconcile(at: Date = now()): Promise<number> {
      let corrected = 0;
      for (const orgId of await organizations.listLiveIds(sys)) {
        const ctx = tenantContext(orgId);
        try {
          const outcome = await inTransaction(async repos => {
            const org = await repos.organizations.lockById(ctx);
            if (!org) return null;
            const actual = (await repos.attachments.platformTally(ctx)).bytes;
            const drift = actual - org.storage_used_bytes;
            if (drift !== 0) await repos.organizations.setStorageUsed(ctx, actual);
            const byo = (await repos.storageConfigs.find(ctx))?.status === 'verified';
            const percent = (actual / access.storageLimit(org.plan as OrgPlan)) * 100;
            const current = org.storage_notice_level as StorageNoticeLevel;
            let raised = false;
            if (percent < STORAGE_CRITICAL_PERCENT && current !== 0) {
              await repos.organizations.setStorageNoticeLevel(ctx, 0);
            } else if (percent >= STORAGE_CRITICAL_PERCENT && current < 95 && !byo) {
              await repos.organizations.setStorageNoticeLevel(ctx, 95);
              raised = true;
            }
            return { org: { ...org, storage_used_bytes: actual }, drift, raised };
          });
          if (!outcome) continue;
          if (outcome.drift !== 0) {
            corrected++;
            log.warn({ org_id: orgId, drift_bytes: outcome.drift }, 'storage.reconcile corrected storage_used_bytes');
            analytics.capture('storage_reconciled', { drift_bytes: outcome.drift }, { orgId });
          }
          if (outcome.raised) await deps.attachmentsService.noticeAdmins(ctx, outcome.org, 95);
        } catch (error) {
          analytics.captureException(error, { org_id: orgId });
        }
      }

      for (const row of await configs.listActive(sys)) {
        try {
          await probe(row);
        } catch (error) {
          analytics.captureException(error, { org_id: row.org_id });
        }
      }
      for (const row of await configs.listStalled(sys, new Date(at.getTime() - BYO_MIGRATION_STALL_MINUTES * 60_000))) {
        await deps
          .queue()
          .send('storage.migrate', { org_id: row.org_id }, { startAfter: at, singletonKey: `org:${row.org_id}` });
      }
      return corrected;
    },
  };
}

export type StorageService = ReturnType<typeof storageService>;

import type { Analytics } from '@nothingleft/analytics';
import {
  GIT_EVENT_ATTEMPTS_MAX,
  type GitEventFailure,
  type GitEventIgnored,
  type GitEventsQuery,
  type GitEventStatus,
  type GitProviderKind,
  type GitWebhookEvent,
  type GitWebhookEventDetail,
  type Principal,
  type ReplayGitEvent,
} from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type GitConnectionRow,
  type GitConnectionsRepository,
  type GitEventsRepository,
  type GitRepositoriesRepository,
  type GitRepositoryRow,
  type GitWebhookEventRow,
  type TenantContext,
} from '@nothingleft/db';
import {
  GIT_EVENT_RETENTION_DAYS,
  GIT_EVENT_RETRY_MINUTES,
  GIT_EVENT_STORED_MAX_BYTES,
  GIT_PURGE_BATCH,
  GIT_SIGNATURE_FAILURES_MAX,
} from '@config/constants';
import { sha256 } from '@lib/crypto';
import { AppError } from '@lib/errors';
import type { JobQueue } from '@lib/jobs';
import { connectionAuth, connectionName, providerOf, unsealHook } from '@git/connection';
import type { NormalizedEvent } from '@git/events';
import { GitProviderError } from '@git/http';
import type { DeliveryHeaders, GitProvider } from '@git/provider';
import type { ProviderRegistry } from '@git/providers/index';
import type { AccessService, OrgAccess } from '@services/access';
import type { GitConnectionsService } from '@services/git-connections.service';
import { withNotifications } from '@services/notify-outbox';

interface Counter {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

export interface GitEventsJob {
  org_id: number;
  connection_id: number;
  provider_repo_id: string | null;
}

/** What applying a delivery's branches, commits, pull requests and checks decided. */
export type EntityOutcome = { status: 'done' } | { status: 'ignored'; reason: GitEventIgnored };

export type ApplyEntities = (
  ctx: TenantContext,
  connection: GitConnectionRow,
  repository: GitRepositoryRow,
  events: NormalizedEvent[],
  event: GitWebhookEventRow,
) => Promise<EntityOutcome>;

export interface GitIngestDeps {
  access: AccessService;
  providers: ProviderRegistry;
  connections: GitConnectionsRepository;
  repositories: GitRepositoriesRepository;
  events: GitEventsRepository;
  connectionsService: Pick<GitConnectionsService, 'markProblem' | 'markHealthy' | 'markUninstalled'>;
  /** Without it, deliveries for a linked repository are kept and marked done. */
  applyEntities?: ApplyEntities;
  counter: Counter;
  queue: () => JobQueue;
  analytics: Analytics;
  masterKey: Buffer;
  /** Counts what a log line may carry: never a payload, a name or a URL. */
  log: { info: (fields: Record<string, unknown>, message: string) => void };
}

const sys = systemContext('a webhook delivery names no organisation until its connection is found');
const DRAIN_BATCH = 200;

const ENTITY_EVENTS = new Set<NormalizedEvent['type']>([
  'branch.created',
  'branch.deleted',
  'push',
  'pull_request.review',
  'check.updated',
]);
const isEntityEvent = (e: NormalizedEvent) => ENTITY_EVENTS.has(e.type) || e.type.startsWith('pull_request.');

export const queueKey = (job: GitEventsJob) => `git:${job.connection_id}:${job.provider_repo_id ?? 'connection'}`;

const signatureKey = (connectionId: number) => `git:sigfail:${connectionId}`;

function failureOf(error: unknown): GitEventFailure {
  if (!(error instanceof GitProviderError)) return 'internal';
  if (error.reason === 'rate_limited') return 'provider_rate_limited';
  if (error.reason === 'token_invalid' || error.reason === 'forbidden') return 'token_invalid';
  return 'provider_unreachable';
}

export function gitIngestService(deps: GitIngestDeps) {
  const { access, providers, connections, repositories, events, connectionsService, analytics, masterKey } = deps;

  async function countSignatureFailure(row: GitConnectionRow) {
    const key = signatureKey(row.id);
    const failures = await deps.counter.incr(key);
    if (failures === 1) await deps.counter.expire(key, 60 * 60);
    if (failures >= GIT_SIGNATURE_FAILURES_MAX) {
      await connectionsService.markProblem(tenantContext(row.org_id), row, 'failing', 'signature');
    }
  }

  /** The stored copy: whole when it fits, else what the job needs, else nothing but the flag. */
  function storable(provider: GitProvider, eventName: string, raw: Buffer, payload: unknown) {
    if (raw.length <= GIT_EVENT_STORED_MAX_BYTES) return { payload, truncated: false };
    const trimmed = provider.trim(eventName, payload);
    if (Buffer.byteLength(JSON.stringify(trimmed)) <= GIT_EVENT_STORED_MAX_BYTES)
      return { payload: trimmed, truncated: true };
    return { payload: {}, truncated: true };
  }

  async function enqueue(job: GitEventsJob, at: Date) {
    await deps.queue().send('git.process_events', job, { startAfter: at, singletonKey: queueKey(job) });
  }

  async function orgAdmin(principal: Principal, slug: string): Promise<OrgAccess> {
    const org = await access.org(principal, slug);
    access.require(principal, 'org.git.manage', org.scope);
    return org;
  }

  async function toDtos(ctx: TenantContext, rows: GitWebhookEventRow[]): Promise<GitWebhookEvent[]> {
    const all = await connections.list(ctx, { includeRevoked: true });
    const byId = new Map(all.map(c => [c.id, c]));
    const repoIds = [...new Set(rows.map(r => r.repository_id).filter((id): id is number => id !== null))];
    const repos = new Map<number, GitRepositoryRow>();
    for (const id of repoIds) {
      const repo = await repositories.findById(ctx, id);
      if (repo) repos.set(id, repo);
    }
    return rows.map(row => {
      const connection = byId.get(row.connection_id)!;
      return {
        id: row.id,
        connection: connectionName(connection, providers.get(connection.provider as GitProviderKind)),
        repository: row.repository_id ? (repos.get(row.repository_id)?.full_name ?? null) : null,
        delivery_id: row.delivery_id,
        event: row.event_name,
        status: row.status as GitEventStatus,
        error: row.error,
        attempts: row.attempts,
        received_at: row.received_at.toISOString(),
        processed_at: row.processed_at?.toISOString() ?? null,
        truncated: row.truncated,
        run_automations: row.run_automations,
      };
    });
  }

  async function applyConnectionEvent(ctx: TenantContext, connection: GitConnectionRow, event: NormalizedEvent) {
    if (event.type === 'connection.suspended') {
      await connectionsService.markProblem(ctx, connection, 'suspended', 'suspended');
    } else if (event.type === 'connection.unsuspended') {
      await connections.transition(
        ctx,
        connection.id,
        ['suspended'],
        { status: 'active', last_error: null },
        new Date(),
      );
    } else if (event.type === 'connection.uninstalled') {
      await connectionsService.markUninstalled(ctx, connection);
    }
  }

  async function applyRepositoryEvent(
    ctx: TenantContext,
    connection: GitConnectionRow,
    provider: GitProvider,
    event: Extract<NormalizedEvent, { repo: { html_url: string } }>,
    at: Date,
  ) {
    const known = await repositories.findByProviderId(ctx, connection.id, event.repo.provider_repo_id);
    if (event.type === 'repository.removed_from_installation' || event.type === 'repository.deleted') {
      if (known) await repositories.update(ctx, known.id, { removed_at: at }, at);
      return;
    }
    const repo = event.repo;
    const fields = {
      provider_repo_id: repo.provider_repo_id,
      full_name: repo.full_name,
      html_url: repo.html_url,
      default_branch: repo.default_branch || known?.default_branch || '',
      is_private: repo.is_private,
      is_archived: repo.is_archived,
    };
    if (!fields.default_branch) {
      const fresh = await provider.getRepository(connectionAuth(masterKey, connection), repo);
      fields.default_branch = fresh?.default_branch ?? 'main';
    }
    await repositories.upsertDiscovered(ctx, connection.id, [fields], at);
  }

  async function apply(
    ctx: TenantContext,
    connection: GitConnectionRow,
    row: GitWebhookEventRow,
    at: Date,
  ): Promise<{ status: 'done' | 'ignored'; error: GitEventIgnored | null; repository_id: number | null }> {
    const provider = providerOf(providers, connection.provider);
    if (row.truncated && Object.keys(row.payload as object).length === 0) throw new PayloadTruncated();
    const normalized = provider.normalize(row.event_name, row.payload);
    if (normalized.length === 0) return { status: 'ignored', error: 'event_unused', repository_id: row.repository_id };

    for (const event of normalized) {
      if (event.type.startsWith('connection.')) await applyConnectionEvent(ctx, connection, event);
      else if (event.type.startsWith('repository.')) {
        await applyRepositoryEvent(
          ctx,
          connection,
          provider,
          event as Extract<NormalizedEvent, { repo: { html_url: string } }>,
          at,
        );
      }
    }

    const entities = normalized.filter(isEntityEvent);
    if (entities.length === 0) return { status: 'done', error: null, repository_id: row.repository_id };

    let repository = row.repository_id ? await repositories.findById(ctx, row.repository_id) : undefined;
    if (!repository && row.provider_repo_id) {
      repository = await repositories.findByProviderId(ctx, connection.id, row.provider_repo_id);
      // A manual-mode webhook is how its repositories become known: there is no token to list them.
      if (!repository && connection.auth_kind === 'manual') {
        const described = provider.repositoryFromPayload(row.event_name, row.payload);
        if (described) [repository] = await repositories.upsertDiscovered(ctx, connection.id, [described], at);
      }
    }
    if (!repository) return { status: 'ignored', error: 'repository_unknown', repository_id: null };
    if ((await repositories.projectLinks(ctx, [repository.id])).length === 0) {
      return { status: 'ignored', error: 'repository_not_linked', repository_id: repository.id };
    }
    const outcome = deps.applyEntities
      ? await deps.applyEntities(ctx, connection, repository, entities, row)
      : ({ status: 'done' } as const);
    return outcome.status === 'done'
      ? { status: 'done', error: null, repository_id: repository.id }
      : { status: 'ignored', error: outcome.reason, repository_id: repository.id };
  }

  async function drainKey(job: GitEventsJob, now: Date): Promise<number> {
    const ctx = tenantContext(job.org_id);
    let applied = 0;
    for (let i = 0; i < DRAIN_BATCH; i++) {
      // Read each time: an event just applied may have revoked or suspended it.
      const connection = await connections.findById(ctx, job.connection_id);
      if (!connection) return applied;
      const row = await events.nextPending(ctx, job);
      if (!row) return applied;
      if (row.next_attempt_at && row.next_attempt_at > now) {
        await enqueue(job, row.next_attempt_at);
        return applied;
      }
      if (connection.revoked_at) {
        await events.finish(ctx, row.id, { status: 'ignored', error: 'connection_revoked' }, now);
        continue;
      }
      try {
        const outcome = await apply(ctx, connection, row, now);
        await events.finish(ctx, row.id, outcome, now);
        applied++;
        if (connection.status === 'failing' && connection.last_error === 'processing') {
          await connectionsService.markHealthy(ctx, connection);
        }
      } catch (error) {
        const reason: GitEventFailure = error instanceof PayloadTruncated ? 'payload_truncated' : failureOf(error);
        const attempts = row.attempts + 1;
        if (reason === 'payload_truncated' || attempts >= GIT_EVENT_ATTEMPTS_MAX) {
          await events.finish(ctx, row.id, { status: 'failed', error: reason }, now);
          analytics.capture(
            'git_event_failed',
            { provider: connection.provider as GitProviderKind, reason },
            { orgId: ctx.orgId },
          );
          // One delivery too large to keep says nothing about the connection's health.
          if (reason !== 'payload_truncated') {
            await connectionsService.markProblem(ctx, connection, 'failing', 'processing');
          }
          continue;
        }
        const minutes = GIT_EVENT_RETRY_MINUTES[Math.min(row.attempts, GIT_EVENT_RETRY_MINUTES.length - 1)]!;
        const backoff = now.getTime() + minutes * 60_000;
        const reset = error instanceof GitProviderError && error.resetAt ? error.resetAt.getTime() : 0;
        const next = new Date(Math.max(backoff, reset));
        await events.retryLater(ctx, row.id, reason, next);
        await enqueue(job, next);
        return applied;
      }
    }
    await enqueue(job, now);
    return applied;
  }

  async function accept(
    connection: GitConnectionRow,
    provider: GitProvider,
    delivery: NonNullable<ReturnType<GitProvider['verifyWebhook']>>,
    payload: unknown,
    input: { rawBody: Buffer; now: Date },
  ): Promise<void> {
    const ctx = tenantContext(connection.org_id);
    if (connection.status === 'failing' && connection.last_error === 'signature') {
      await connectionsService.markHealthy(ctx, connection);
      await deps.counter.del(signatureKey(connection.id));
    }
    const route = provider.route(delivery.event_name, payload);
    const repository = route.provider_repo_id
      ? await repositories.findByProviderId(ctx, connection.id, route.provider_repo_id)
      : undefined;
    const stored = storable(provider, delivery.event_name, input.rawBody, payload);
    const row = await events.insert(ctx, {
      connection_id: connection.id,
      repository_id: repository?.id ?? null,
      provider_repo_id: route.provider_repo_id,
      delivery_id: delivery.delivery_id,
      event_name: delivery.event_name,
      payload: stored.payload,
      truncated: stored.truncated,
      received_at: input.now,
      run_automations: true,
    });
    await connections.touch(ctx, connection.id, input.now);
    if (repository) {
      await repositories.touch(ctx, repository.id, input.now);
      if (connection.auth_kind !== 'app_installation' && repository.webhook_status !== 'active') {
        await repositories.update(
          ctx,
          repository.id,
          { webhook_status: 'active', webhook_last_status_code: 202 },
          input.now,
        );
      }
    }
    if (row) {
      await enqueue(
        { org_id: connection.org_id, connection_id: connection.id, provider_repo_id: route.provider_repo_id },
        input.now,
      );
    }
  }

  return {
    async knowsHook(kind: string, hookId: string): Promise<boolean> {
      const connection = await connections.findByHookHash(sys, sha256(hookId));
      return connection !== undefined && connection.provider === kind;
    },

    /**
     * A delivery, as the provider sent it. The signature is checked against the raw bytes
     * before anything in the body is believed; the app's secret is checked before any lookup.
     */
    async receive(input: {
      provider: string;
      hookId: string | null;
      headers: DeliveryHeaders;
      rawBody: Buffer;
      now: Date;
    }): Promise<{ accepted: boolean }> {
      const provider = providerOf(providers, input.provider);
      let targets: GitConnectionRow[];
      let delivery: ReturnType<GitProvider['verifyWebhook']>;
      let payload: unknown;

      if (input.hookId) {
        const connection = await connections.findByHookHash(sys, sha256(input.hookId));
        if (!connection || connection.provider !== provider.kind) throw new AppError('not_found', 404);
        const hook = unsealHook(masterKey, connection);
        delivery = hook ? provider.verifyWebhook(input.headers, input.rawBody, hook.secret) : null;
        if (!delivery) {
          await countSignatureFailure(connection);
          throw new AppError('git.signature_invalid', 401);
        }
        payload = parse(input.rawBody);
        targets = [connection];
      } else {
        const app = provider.app;
        if (!app?.configured || !app.webhookSecret) throw new AppError('not_found', 404);
        delivery = provider.verifyWebhook(input.headers, input.rawBody, app.webhookSecret);
        if (!delivery) throw new AppError('git.signature_invalid', 401);
        payload = parse(input.rawBody);
        const installation = provider.route(delivery.event_name, payload).installation_id;
        targets = installation
          ? await connections.listByInstallation(sys, provider.kind, app.baseUrl, installation)
          : [];
        if (targets.length === 0) {
          // Installed on an account nobody here has connected (yet): counted, never stored.
          deps.log.info({ git_delivery: 'unrouted', provider: provider.kind }, 'git delivery for no connection');
          return { accepted: false };
        }
      }

      // One installation can be connected by several organisations: each keeps its own copy.
      for (const connection of targets) await accept(connection, provider, delivery, payload, input);
      return { accepted: true };
    },

    /** Applies one key's pending events oldest first; stops at a failure, which waits for its retry. */
    drain(job: GitEventsJob, now = new Date()): Promise<number> {
      return withNotifications(
        deps.queue,
        error => analytics.captureException(error),
        () => drainKey(job, now),
      );
    },

    async list(
      principal: Principal,
      slug: string,
      query: GitEventsQuery,
    ): Promise<{ data: GitWebhookEvent[]; total: number }> {
      const org = await orgAdmin(principal, slug);
      const filter: Parameters<GitEventsRepository['list']>[1] = {};
      if (query.status) filter.status = query.status;
      if (query.connection) {
        const all = await connections.list(org.ctx, { includeRevoked: true });
        const match = all.find(
          c =>
            connectionName(c, providers.get(c.provider as GitProviderKind)).toLowerCase() ===
            query.connection!.toLowerCase(),
        );
        if (!match)
          throw new AppError('git.connection_not_found', 404, { slug, connection: query.connection }, 'connection');
        filter.connectionIds = [match.id];
      }
      if (query.repository) {
        const all = await connections.list(org.ctx, { includeRevoked: true });
        const repos = await repositories.findByFullName(
          org.ctx,
          query.repository.replace(/^[a-z]+:/, ''),
          all.map(c => c.id),
        );
        filter.repositoryIds = repos.map(r => r.id);
      }
      const { rows, total } = await events.list(org.ctx, filter, { limit: query.limit, offset: query.offset });
      return { data: await toDtos(org.ctx, rows), total };
    },

    async get(principal: Principal, slug: string, id: number): Promise<GitWebhookEventDetail> {
      const org = await orgAdmin(principal, slug);
      const row = await events.find(org.ctx, id);
      if (!row) throw new AppError('git.event_not_found', 404, { id });
      const [dto] = await toDtos(org.ctx, [row]);
      return { ...dto!, payload: row.payload };
    },

    /** Applies a stored event again; automations run only when asked (the event log's checkbox). */
    async replay(
      principal: Principal,
      slug: string,
      id: number,
      input: ReplayGitEvent,
    ): Promise<GitWebhookEventDetail> {
      const org = await orgAdmin(principal, slug);
      const row = await events.resetForReplay(org.ctx, id, input.run_automations);
      if (!row) throw new AppError('git.event_not_found', 404, { id });
      await enqueue(
        { org_id: org.ctx.orgId, connection_id: row.connection_id, provider_repo_id: row.provider_repo_id },
        new Date(),
      );
      return this.get(principal, slug, id);
    },

    async purge(now = new Date()): Promise<number> {
      const before = new Date(now.getTime() - GIT_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      let total = 0;
      for (;;) {
        const n = await events.purgeBefore(systemContext('git.purge: delivery log retention'), before, GIT_PURGE_BATCH);
        total += n;
        if (n < GIT_PURGE_BATCH) return total;
      }
    },
  };
}

class PayloadTruncated extends Error {}

function parse(raw: Buffer): unknown {
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new AppError('validation_failed', 400);
  }
}

export type GitIngestService = ReturnType<typeof gitIngestService>;

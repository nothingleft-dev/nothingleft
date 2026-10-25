import type { Analytics } from '@nothingleft/analytics';
import { formatCalendarDate } from '@nothingleft/format';
import { t } from '@nothingleft/i18n';
import {
  GIT_TOKEN_EXPIRY_WARNING_DAYS,
  planLimits,
  type CreateGitConnection,
  type GitConnection,
  type GitConnectionCheck,
  type GitConnectionError,
  type GitConnectionSecret,
  type GitConnectionStatus,
  type GitProviderInfo,
  type GitProviderKind,
  type OrgPlan,
  type Principal,
} from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type GitConnectionRow,
  type GitConnectionsRepository,
  type GitRepositoriesRepository,
  type OrganizationsRepository,
  type RepositoryCounts,
  type TenantContext,
} from '@nothingleft/db';
import { GIT_CONNECT_STATE_TTL_SECONDS } from '@config/constants';
import { issueHookId, issueHookSecret, randomToken } from '@lib/crypto';
import type { Mailer } from '@lib/email';
import { AppError } from '@lib/errors';
import { isPublicUrl, type ResolveHost } from '@lib/network';
import {
  connectionAuth,
  connectionName,
  health,
  providerFailure,
  providerLabel,
  providerOf,
  sealHook,
  sealToken,
  unsealHook,
  webhookUrl,
  repositoryHookSecret,
} from '@git/connection';
import { GitProviderError } from '@git/http';
import type { ConnectionAuth, GitProvider } from '@git/provider';
import type { ProviderRegistry } from '@git/providers/index';
import type { AccessService, OrgAccess } from '@services/access';
import { requireSession } from '@services/two-factor.service';
import type { InTenantTransaction } from '@services/transaction';

interface StateStore {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
}

export interface GitConnectionsDeps {
  access: AccessService;
  providers: ProviderRegistry;
  connections: GitConnectionsRepository;
  repositories: GitRepositoriesRepository;
  organizations: OrganizationsRepository;
  inTransaction: InTenantTransaction;
  store: StateStore;
  /** Already wrapped best-effort: the mail follows a change that is saved either way. */
  mailer: Mailer;
  analytics: Analytics;
  masterKey: Buffer;
  apiBaseUrl: string;
  appBaseUrl: string;
  allowPrivateHosts: boolean;
  resolveHost: ResolveHost;
  now?: () => Date;
}

export interface ConnectStart {
  install_url: string;
  state: string;
}

export interface ConnectCallback {
  state: string;
  code: string;
  installation_id: string;
}

const stateKey = (state: string) => `git:connect:${state}`;

export function gitConnectionsService(deps: GitConnectionsDeps) {
  const { access, providers, connections, repositories, organizations, inTransaction, analytics, masterKey } = deps;
  const now = deps.now ?? (() => new Date());

  async function manage(principal: Principal, slug: string): Promise<OrgAccess> {
    const org = await access.org(principal, slug);
    access.require(principal, 'org.git.manage', org.scope);
    return org;
  }

  const nameOf = (row: GitConnectionRow) => connectionName(row, providers.get(row.provider as GitProviderKind));

  async function find(org: OrgAccess, name: string, opts: { live?: boolean } = {}): Promise<GitConnectionRow> {
    const rows = await connections.list(org.ctx, { includeRevoked: !opts.live });
    const wanted = name.toLowerCase();
    // A live connection wins over a disconnected one of the same name.
    const row = rows.find(r => nameOf(r).toLowerCase() === wanted);
    if (!row) throw new AppError('git.connection_not_found', 404, { slug: org.organization.slug, connection: name });
    return row;
  }

  async function toDto(ctx: TenantContext, row: GitConnectionRow, counts?: RepositoryCounts): Promise<GitConnection> {
    const provider = providers.get(row.provider as GitProviderKind);
    const creator = await organizations.findMemberByUserId(ctx, row.created_by, { includeRemoved: true });
    const hook = row.revoked_at ? null : unsealHook(masterKey, row);
    return {
      name: nameOf(row),
      provider: row.provider as GitProviderKind,
      base_url: row.base_url,
      auth_kind: row.auth_kind as GitConnection['auth_kind'],
      account: { login: row.account_login, avatar_url: row.account_avatar_url, url: row.account_url },
      status: row.status as GitConnectionStatus,
      health: health(row, now()),
      last_error: row.last_error as GitConnectionError | null,
      last_event_at: row.last_event_at?.toISOString() ?? null,
      token_expires_at: row.token_expires_at?.toISOString() ?? null,
      has_token: row.token_ciphertext !== null,
      webhook_url: hook ? webhookUrl(deps.apiBaseUrl, row.provider, hook.hook_id) : null,
      redelivery_url:
        provider?.redeliveryUrl(
          { base_url: row.base_url, auth_kind: row.auth_kind as GitConnection['auth_kind'] },
          null,
          null,
        ) ?? null,
      repositories: {
        known: counts?.known ?? 0,
        linked: counts?.linked ?? 0,
        webhooks_missing: counts?.webhooks_missing ?? 0,
      },
      created_by: creator ? access.memberRef(creator.user, creator.membership) : null,
      created_at: row.created_at.toISOString(),
      revoked_at: row.revoked_at?.toISOString() ?? null,
    };
  }

  async function dtoWithCounts(ctx: TenantContext, row: GitConnectionRow): Promise<GitConnection> {
    const counts = (await repositories.counts(ctx)).find(c => c.connection_id === row.id);
    return toDto(ctx, row, counts);
  }

  async function guardLimit(org: OrgAccess) {
    const limit = planLimits(org.organization.plan as OrgPlan).git_connections;
    if (limit !== null && (await connections.countLive(org.ctx)) >= limit) {
      throw new AppError('git.connection_limit_reached', 409, { limit });
    }
  }

  async function guardBaseUrl(baseUrl: string, provider: GitProvider) {
    if (deps.allowPrivateHosts || baseUrl === provider.defaultBaseUrl) return;
    if (!(await isPublicUrl(baseUrl, deps.resolveHost))) {
      throw new AppError('git.base_url_not_allowed', 422, { base_url: baseUrl }, 'base_url');
    }
  }

  async function call<T>(kind: string, body: () => Promise<T>): Promise<T> {
    try {
      return await body();
    } catch (error) {
      throw providerFailure(error, kind);
    }
  }

  /** Lists what the connection can see now; a partial list never marks anything removed. */
  async function discover(ctx: TenantContext, row: GitConnectionRow, provider: GitProvider, auth: ConnectionAuth) {
    const { repos, complete } = await provider.listRepositories(auth);
    const at = now();
    await repositories.upsertDiscovered(ctx, row.id, repos, at);
    // A listing cut short says nothing about what it did not reach: only a full one marks the rest removed.
    if (!complete) return;
    await repositories.markRemovedExcept(
      ctx,
      row.id,
      repos.map(r => r.provider_repo_id),
      at,
    );
  }

  async function recordActivity(
    org: OrgAccess,
    principal: Principal | null,
    kind: 'git_connection_created' | 'git_connection_removed' | 'git_connection_error',
    row: GitConnectionRow,
    extra: Record<string, string> = {},
  ) {
    await inTransaction(repos =>
      repos.activity.record(org.ctx, {
        actor_id: principal?.userId ?? null,
        kind,
        target_type: 'git_connection',
        target_id: String(row.id),
        old_value: null,
        new_value: { connection: nameOf(row), provider: row.provider, ...extra },
        ip: null,
      }),
    );
  }

  async function notifyAdmins(ctx: TenantContext, row: GitConnectionRow, reason: GitConnectionError) {
    const org = await organizations.findById(ctx);
    if (!org) return;
    for (const admin of await organizations.listAdmins(ctx)) {
      await deps.mailer.send({
        to: admin.user.email,
        subject: 'email.git_connection_attention.subject',
        body: 'email.git_connection_attention.body',
        params: {
          name: admin.user.name,
          org: org.name,
          connection: nameOf(row),
          reason: t(`git.connection_reason.${reason}`),
          url: `${deps.appBaseUrl}/organization?tab=integrations`,
        },
      });
    }
  }

  async function warnExpiring(ctx: TenantContext, row: GitConnectionRow) {
    const org = await organizations.findById(ctx);
    if (!org || !row.token_expires_at) return;
    for (const admin of await organizations.listAdmins(ctx)) {
      await deps.mailer.send({
        to: admin.user.email,
        subject: 'email.git_token_expiring.subject',
        body: 'email.git_token_expiring.body',
        params: {
          name: admin.user.name,
          org: org.name,
          connection: nameOf(row),
          date: formatCalendarDate(row.token_expires_at.toISOString().slice(0, 10)),
          url: `${deps.appBaseUrl}/organization?tab=integrations`,
        },
      });
    }
  }

  /**
   * Moves a live connection into a problem state. Only the call that changes it records the
   * audit row and emails the Org Admins, so a stream of failures sends one email.
   */
  async function markProblem(
    ctx: TenantContext,
    row: GitConnectionRow,
    status: Exclude<GitConnectionStatus, 'active' | 'revoked'>,
    reason: GitConnectionError,
  ): Promise<GitConnectionRow | undefined> {
    const from: GitConnectionStatus[] = (['active', 'failing', 'suspended', 'token_expired'] as const).filter(
      s => s !== status,
    );
    const flipped = await connections.transition(ctx, row.id, from, { status, last_error: reason }, now());
    if (!flipped) return undefined;
    await inTransaction(repos =>
      repos.activity.record(ctx, {
        actor_id: null,
        kind: 'git_connection_error',
        target_type: 'git_connection',
        target_id: String(row.id),
        old_value: { status: row.status },
        new_value: { connection: nameOf(row), status, reason },
        ip: null,
      }),
    );
    await notifyAdmins(ctx, flipped, reason);
    return flipped;
  }

  async function markHealthy(ctx: TenantContext, row: GitConnectionRow): Promise<GitConnectionRow | undefined> {
    if (row.status === 'active') return row;
    return connections.transition(
      ctx,
      row.id,
      ['failing', 'token_expired'],
      { status: 'active', last_error: null },
      now(),
    );
  }

  /** The removal at the provider's end (an uninstalled app): read-only from now on, like a disconnect. */
  async function markUninstalled(ctx: TenantContext, row: GitConnectionRow): Promise<void> {
    const revoked = await connections.revoke(ctx, row.id, now(), 'uninstalled');
    if (!revoked) return;
    await inTransaction(repos =>
      repos.activity.record(ctx, {
        actor_id: null,
        kind: 'git_connection_error',
        target_type: 'git_connection',
        target_id: String(row.id),
        old_value: { status: row.status },
        new_value: { connection: nameOf(row), status: 'revoked', reason: 'uninstalled' },
        ip: null,
      }),
    );
    await notifyAdmins(ctx, revoked, 'uninstalled');
  }

  async function createFromInstallation(
    org: OrgAccess,
    principal: Principal,
    provider: GitProvider,
    installationId: string,
  ): Promise<GitConnectionRow> {
    const app = provider.app!;
    const auth: ConnectionAuth = {
      base_url: app.baseUrl,
      auth_kind: 'app_installation',
      installation_id: installationId,
      token: null,
    };
    const described = await call(provider.kind, () => provider.describeConnection(auth));
    const row = await connections.insert(org.ctx, {
      provider: provider.kind,
      base_url: app.baseUrl,
      auth_kind: 'app_installation',
      installation_id: installationId,
      account_login: described.account.login,
      account_avatar_url: described.account.avatar_url,
      account_url: described.account.url,
      created_by: principal.userId,
      created_at: now(),
      updated_at: now(),
    });
    await call(provider.kind, () => discover(org.ctx, row, provider, auth));
    await recordActivity(org, principal, 'git_connection_created', row);
    analytics.capture(
      'git_connection_created',
      { provider: provider.kind, auth_kind: 'app_installation' },
      { userId: principal.userId, orgId: org.ctx.orgId },
    );
    return row;
  }

  return {
    toDto,
    markProblem,
    markHealthy,
    markUninstalled,

    /**
     * Hourly: a token that expires within the warning window tells the Org Admins once; one that
     * has expired moves the connection to `token_expired`, which tells them again.
     */
    async checkTokenExpiry(at = now()): Promise<number> {
      const horizon = new Date(at.getTime() + GIT_TOKEN_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);
      let changed = 0;
      for (const row of await connections.expiringAll(
        systemContext('token expiry spans every organisation'),
        horizon,
      )) {
        const ctx = tenantContext(row.org_id);
        if (row.token_expires_at! <= at) {
          if (row.status !== 'token_expired' && (await markProblem(ctx, row, 'token_expired', 'token_expired')))
            changed++;
        } else if (!row.token_warned_at && (await connections.markWarned(ctx, row.id, at))) {
          await warnExpiring(ctx, row);
          changed++;
        }
      }
      return changed;
    },

    catalogue(): GitProviderInfo[] {
      return [...providers.values()].map(p => {
        const connectKinds: GitProviderInfo['connect_kinds'] = p.app?.configured
          ? ['app', 'manual']
          : p.supports.webhook_registration
            ? ['token']
            : ['manual'];
        const kind = p.kind;
        return {
          kind,
          label: providerLabel(kind),
          pull_request_word: t(`git.provider.${kind}.pull_request`),
          pull_request_word_plural: t(`git.provider.${kind}.pull_requests`),
          connect_kind: connectKinds[0]!,
          connect_kinds: connectKinds,
          default_base_url: p.app?.configured ? p.app.baseUrl : p.defaultBaseUrl,
          supports: {
            checks: p.supports.checks,
            reviews: p.supports.reviews,
            compare: p.supports.compare,
            webhook_registration: p.supports.webhook_registration,
          },
        };
      });
    },

    async list(principal: Principal, slug: string): Promise<GitConnection[]> {
      const org = await manage(principal, slug);
      const [rows, counts] = await Promise.all([
        connections.list(org.ctx, { includeRevoked: true }),
        repositories.counts(org.ctx),
      ]);
      return Promise.all(
        rows.map(r =>
          toDto(
            org.ctx,
            r,
            counts.find(c => c.connection_id === r.id),
          ),
        ),
      );
    },

    async startInstall(principal: Principal, slug: string, kind: string): Promise<ConnectStart> {
      requireSession(principal);
      const org = await manage(principal, slug);
      const provider = providerOf(providers, kind);
      if (!provider.app?.configured) throw new AppError('git.app_not_configured', 409);
      await guardLimit(org);
      const state = randomToken();
      await deps.store.set(
        stateKey(state),
        JSON.stringify({ org_id: org.ctx.orgId, user_id: principal.userId, provider: kind }),
        'EX',
        GIT_CONNECT_STATE_TTL_SECONDS,
      );
      return { install_url: provider.app.installUrl(state), state };
    },

    /** The person back from the provider's install page; `bound` is the state cookie of the browser that left. */
    async completeInstall(
      principal: Principal,
      kind: string,
      input: ConnectCallback,
      bound: string | undefined,
    ): Promise<GitConnection> {
      requireSession(principal);
      const provider = providerOf(providers, kind);
      if (!provider.app?.configured) throw new AppError('git.app_not_configured', 409);
      if (!bound || bound !== input.state) throw new AppError('git.connect_state_invalid', 400);
      const pending = JSON.parse((await deps.store.getdel(stateKey(input.state))) ?? 'null') as {
        org_id: number;
        user_id: number;
        provider: string;
      } | null;
      if (!pending || pending.user_id !== principal.userId || pending.provider !== kind) {
        throw new AppError('git.connect_state_invalid', 400);
      }
      const orgAccess = await access.orgById(principal, pending.org_id);
      access.require(principal, 'org.git.manage', orgAccess.scope);

      try {
        await provider.app.confirmInstallation(input.code, input.installation_id);
      } catch (error) {
        if (error instanceof GitProviderError && error.reason === 'forbidden') {
          throw new AppError('git.installation_forbidden', 403);
        }
        throw providerFailure(error, kind);
      }

      const holder = await connections.findByInstallation(
        orgAccess.ctx,
        kind,
        provider.app.baseUrl,
        input.installation_id,
      );
      if (holder) {
        // Back from changing which repositories the installation covers.
        await call(kind, () => discover(orgAccess.ctx, holder, provider, connectionAuth(masterKey, holder)));
        return dtoWithCounts(orgAccess.ctx, holder);
      }
      await guardLimit(orgAccess);
      const row = await createFromInstallation(orgAccess, principal, provider, input.installation_id);
      return dtoWithCounts(orgAccess.ctx, row);
    },

    async create(
      principal: Principal,
      slug: string,
      input: CreateGitConnection,
    ): Promise<GitConnectionSecret | GitConnectionCheck> {
      requireSession(principal);
      const org = await manage(principal, slug);
      const provider = providerOf(providers, input.provider);
      const allowed =
        input.mode === 'token' ? provider.supports.webhook_registration : !provider.supports.webhook_registration;
      if (!allowed) {
        throw new AppError(
          'git.mode_unsupported',
          422,
          { provider: providerLabel(provider.kind), mode: input.mode },
          'mode',
        );
      }
      if (input.mode === 'token' && !input.token) throw new AppError('git.token_required', 422, {}, 'token');
      if (!input.token && !input.account) throw new AppError('git.account_required', 422, {}, 'account');
      const baseUrl = input.base_url ?? provider.defaultBaseUrl;
      await guardBaseUrl(baseUrl, provider);

      const auth: ConnectionAuth = {
        base_url: baseUrl,
        auth_kind: input.mode,
        installation_id: null,
        token: input.token ?? null,
      };
      const described = input.token ? await call(provider.kind, () => provider.describeConnection(auth)) : null;

      if (input.dry_run) {
        if (!described) throw new AppError('git.token_required', 422, {}, 'token');
        const { repos } = await call(provider.kind, () => provider.listRepositories(auth));
        return {
          provider: provider.kind,
          base_url: baseUrl,
          account: described.account,
          repository_count: repos.length,
          token_expires_at: described.token_expires_at?.toISOString() ?? null,
        };
      }

      const login = described?.account.login ?? input.account!;
      const taken = (await connections.list(org.ctx)).find(
        r =>
          r.provider === provider.kind &&
          r.base_url === baseUrl &&
          r.account_login.toLowerCase() === login.toLowerCase(),
      );
      if (taken) throw new AppError('git.connection_name_taken', 409, { connection: nameOf(taken) });
      await guardLimit(org);

      const hookId = issueHookId();
      const secret = issueHookSecret();
      const at = now();
      const row = await inTransaction(async repos => {
        const inserted = await repos.gitConnections.insert(org.ctx, {
          provider: provider.kind,
          base_url: baseUrl,
          auth_kind: input.mode,
          account_login: login,
          account_avatar_url: described?.account.avatar_url ?? null,
          account_url: described?.account.url ?? `${baseUrl}/${login}`,
          token_expires_at: described?.token_expires_at ?? null,
          created_by: principal.userId,
          created_at: at,
          updated_at: at,
        });
        const sealed = await repos.gitConnections.update(
          org.ctx,
          inserted.id,
          {
            hook_id_hash: hookId.token_hash,
            hook_secret_ciphertext: sealHook(masterKey, inserted.id, { hook_id: hookId.token, secret }),
            token_ciphertext: input.token ? sealToken(masterKey, inserted.id, input.token) : null,
          },
          at,
        );
        await repos.activity.record(org.ctx, {
          actor_id: principal.userId,
          kind: 'git_connection_created',
          target_type: 'git_connection',
          target_id: String(inserted.id),
          old_value: null,
          new_value: { connection: nameOf(inserted), provider: provider.kind },
          ip: null,
        });
        return sealed!;
      });
      if (input.token) await call(provider.kind, () => discover(org.ctx, row, provider, auth));
      analytics.capture(
        'git_connection_created',
        { provider: provider.kind, auth_kind: input.mode },
        { userId: principal.userId, orgId: org.ctx.orgId },
      );
      return { ...(await dtoWithCounts(org.ctx, row)), webhook_secret: secret };
    },

    async remove(principal: Principal, slug: string, name: string): Promise<GitConnection> {
      const org = await manage(principal, slug);
      const row = await find(org, name, { live: true });
      const provider = providerOf(providers, row.provider);
      if (provider.supports.webhook_registration && row.token_ciphertext) {
        const auth = connectionAuth(masterKey, row);
        for (const repo of await repositories.listHooked(org.ctx, row.id)) {
          // Best effort: a hook we cannot remove delivers to a URL that no longer routes, and keeps its id.
          const removed = await provider
            .removeWebhook(auth, repo, repo.provider_webhook_id!)
            .then(() => true)
            .catch(() => false);
          await repositories.update(
            org.ctx,
            repo.id,
            removed ? { provider_webhook_id: null, webhook_status: 'not_applicable' } : { webhook_status: 'failing' },
            now(),
          );
        }
      }
      const revoked = await connections.revoke(org.ctx, row.id, now());
      await recordActivity(org, principal, 'git_connection_removed', row);
      return dtoWithCounts(org.ctx, revoked ?? row);
    },

    async refresh(principal: Principal, slug: string, name: string): Promise<GitConnection> {
      const org = await manage(principal, slug);
      let row = await find(org, name, { live: true });
      const provider = providerOf(providers, row.provider);
      const auth = connectionAuth(masterKey, row);
      if (row.auth_kind === 'manual' && !auth.token) return dtoWithCounts(org.ctx, row);
      try {
        const described = await provider.describeConnection(auth);
        row =
          (await connections.update(
            org.ctx,
            row.id,
            {
              account_avatar_url: described.account.avatar_url,
              account_url: described.account.url,
              token_expires_at: described.token_expires_at,
              ...(described.token_expires_at?.getTime() !== row.token_expires_at?.getTime()
                ? { token_warned_at: null }
                : {}),
            },
            now(),
          )) ?? row;
        await discover(org.ctx, row, provider, auth);
        row = (await markHealthy(org.ctx, row)) ?? row;
      } catch (error) {
        if (error instanceof GitProviderError && error.reason === 'token_invalid') {
          const expired = row.token_expires_at !== null && row.token_expires_at <= now();
          row =
            (await markProblem(
              org.ctx,
              row,
              expired ? 'token_expired' : 'failing',
              expired ? 'token_expired' : 'token_invalid',
            )) ?? row;
          return dtoWithCounts(org.ctx, row);
        }
        throw providerFailure(error, row.provider);
      }
      return dtoWithCounts(org.ctx, row);
    },

    /** A new shared secret, shown once; hooks we registered are updated to it. */
    async rotateSecret(principal: Principal, slug: string, name: string): Promise<GitConnectionSecret> {
      requireSession(principal);
      const org = await manage(principal, slug);
      const row = await find(org, name, { live: true });
      const hook = unsealHook(masterKey, row);
      if (!hook) {
        throw new AppError(
          'git.mode_unsupported',
          409,
          { provider: providerLabel(row.provider), mode: 'app' },
          'connection',
        );
      }
      const secret = issueHookSecret();
      const updated = (await connections.update(
        org.ctx,
        row.id,
        { hook_secret_ciphertext: sealHook(masterKey, row.id, { hook_id: hook.hook_id, secret }) },
        now(),
      ))!;
      const provider = providerOf(providers, row.provider);
      if (provider.supports.webhook_registration && row.token_ciphertext) {
        const auth = connectionAuth(masterKey, row);
        const url = webhookUrl(deps.apiBaseUrl, row.provider, hook.hook_id);
        for (const repo of await repositories.listHooked(org.ctx, row.id)) {
          const target = { url, secret: repositoryHookSecret(secret, repo.provider_repo_id) };
          const ok = await provider
            .updateWebhook(auth, repo, repo.provider_webhook_id!, target)
            .then(() => true)
            .catch(() => false);
          await repositories.update(org.ctx, repo.id, { webhook_status: ok ? 'active' : 'failing' }, now());
        }
      }
      const fresh = (await markHealthy(org.ctx, updated)) ?? updated;
      return { ...(await dtoWithCounts(org.ctx, fresh)), webhook_secret: secret };
    },
  };
}

export type GitConnectionsService = ReturnType<typeof gitConnectionsService>;

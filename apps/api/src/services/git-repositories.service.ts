import type { Analytics } from '@nothingleft/analytics';
import {
  planLimits,
  type GitBackfill,
  type GitProviderKind,
  type GitRepositoriesQuery,
  type GitRepository,
  type GitWebhookStatus,
  type LinkRepository,
  type OrgPlan,
  type Principal,
  type ProjectRepository,
  type UpdateRepositoryLink,
} from '@nothingleft/types';
import { systemContext, tenantContext } from '@nothingleft/db';
import type {
  GitConnectionRow,
  GitConnectionsRepository,
  GitRepositoriesRepository,
  GitRepositoryRow,
  OrganizationsRepository,
  ProjectsRepository,
  TenantContext,
} from '@nothingleft/db';
import { AppError } from '@lib/errors';
import {
  connectionAuth,
  connectionName,
  providerFailure,
  providerOf,
  unsealHook,
  webhookUrl,
  repositoryHookSecret,
} from '@git/connection';
import { GitProviderError } from '@git/http';
import type { ProviderRegistry } from '@git/providers/index';
import type { JobQueue } from '@lib/jobs';
import type { GitLinksService } from '@services/git-links.service';
import { can } from '@services/permissions';
import type { AccessService, OrgAccess, ProjectAccess } from '@services/access';
import type { InTenantTransaction } from '@services/transaction';
import type { OrgHints } from '@services/tenancy.service';

export interface GitRepositoriesDeps {
  access: AccessService;
  providers: ProviderRegistry;
  connections: GitConnectionsRepository;
  repositories: GitRepositoriesRepository;
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
  masterKey: Buffer;
  apiBaseUrl: string;
  linker: Pick<GitLinksService, 'backfill' | 'reconcile'>;
  queue: () => JobQueue;
  now?: () => Date;
}

export interface GitBackfillJob {
  org_id: number;
  repository_id: number;
}

const RECONCILE_ACTIVE_DAYS = 30;

export function gitRepositoriesService(deps: GitRepositoriesDeps) {
  const { access, providers, connections, repositories, organizations, projects, inTransaction, masterKey } = deps;
  const now = deps.now ?? (() => new Date());

  const nameOf = (row: GitConnectionRow) => connectionName(row, providers.get(row.provider as GitProviderKind));

  /** Splits `github:acme/web` into its provider and name; a bare `acme/web` names no provider. */
  function parseRef(ref: string): { provider: string | null; fullName: string } {
    const match = /^([a-z]+):(.+)$/.exec(ref);
    if (match && providers.has(match[1] as GitProviderKind)) return { provider: match[1]!, fullName: match[2]! };
    return { provider: null, fullName: ref };
  }

  function pick(
    ref: string,
    candidates: GitRepositoryRow[],
    byId: Map<number, GitConnectionRow>,
    connection: string | undefined,
  ): GitRepositoryRow {
    const { provider } = parseRef(ref);
    const matching = candidates.filter(r => {
      const owner = byId.get(r.connection_id)!;
      if (provider && owner.provider !== provider) return false;
      return !connection || nameOf(owner).toLowerCase() === connection.toLowerCase();
    });
    if (matching.length === 0) throw new AppError('git.repository_not_found', 404, { repository: ref }, 'repository');
    if (matching.length > 1) {
      const names = matching.map(r => nameOf(byId.get(r.connection_id)!));
      throw new AppError(
        'git.repository_ambiguous',
        409,
        { repository: ref, candidates: names.join(', ') },
        'connection',
        names,
      );
    }
    return matching[0]!;
  }

  /** A repository of one of the organisation's live connections, by name. */
  async function resolveLive(ctx: TenantContext, ref: string, connection?: string) {
    const live = await connections.list(ctx);
    const byId = new Map(live.map(c => [c.id, c]));
    const candidates = await repositories.findByFullName(
      ctx,
      parseRef(ref).fullName,
      live.map(c => c.id),
    );
    const repo = pick(ref, candidates, byId, connection);
    return { repo, connection: byId.get(repo.connection_id)! };
  }

  /** A repository linked to the project, whatever became of its connection since. */
  async function resolveLinked(project: ProjectAccess, ref: string, connection?: string) {
    const linked = await repositories.listForProject(project.ctx, project.project.id);
    const all = await connections.list(project.ctx, { includeRevoked: true });
    const byId = new Map(all.map(c => [c.id, c]));
    const wanted = parseRef(ref).fullName.toLowerCase();
    try {
      const repo = pick(
        ref,
        linked.filter(r => r.full_name.toLowerCase() === wanted),
        byId,
        connection,
      );
      return { repo, connection: byId.get(repo.connection_id)! };
    } catch (error) {
      if (error instanceof AppError && error.code === 'git.repository_not_found') {
        throw new AppError(
          'git.repository_not_linked',
          404,
          { repository: ref, key: project.project.key },
          'repository',
        );
      }
      throw error;
    }
  }

  async function readableKeys(org: OrgAccess, principal: Principal): Promise<Map<number, string>> {
    const everyProject = org.scope.isOwner || org.scope.orgRole === 'org_admin';
    const rows = await projects.listReadable(org.ctx, principal.userId, { everyProject });
    return new Map(rows.map(r => [r.project.id, r.project.key]));
  }

  const effectiveBranches = (row: GitRepositoryRow) => row.merge_base_branches ?? [row.default_branch];

  async function toDtos(org: OrgAccess, principal: Principal, rows: GitRepositoryRow[]): Promise<GitRepository[]> {
    const [all, links, keys] = await Promise.all([
      connections.list(org.ctx, { includeRevoked: true }),
      repositories.projectLinks(
        org.ctx,
        rows.map(r => r.id),
      ),
      readableKeys(org, principal),
    ]);
    const byId = new Map(all.map(c => [c.id, c]));
    return rows.map(row => {
      const connection = byId.get(row.connection_id)!;
      return {
        full_name: row.full_name,
        provider: connection.provider as GitProviderKind,
        connection: nameOf(connection),
        html_url: row.html_url,
        default_branch: row.default_branch,
        is_private: row.is_private,
        is_archived: row.is_archived,
        removed: row.removed_at !== null,
        webhook_status: row.webhook_status as GitWebhookStatus,
        webhook_last_status_code: row.webhook_last_status_code,
        match_all_projects: row.match_all_projects,
        merge_base_branches: row.merge_base_branches,
        effective_merge_base_branches: effectiveBranches(row),
        last_event_at: row.last_event_at?.toISOString() ?? null,
        projects: links
          .filter(l => l.repository_id === row.id && keys.has(l.project_id))
          .map(l => keys.get(l.project_id)!)
          .sort(),
        backfill: (row.backfill_state as GitBackfill | null) ?? null,
      };
    });
  }

  async function projectDto(project: ProjectAccess, principal: Principal, repoId: number): Promise<ProjectRepository> {
    const linked = (await repositories.listForProject(project.ctx, project.project.id)).find(r => r.id === repoId)!;
    const [dto] = await toDtos(project, principal, [linked]);
    const by = await organizations.findMemberByUserId(project.ctx, linked.linked_by, { includeRemoved: true });
    return {
      ...dto!,
      linked_by: by ? access.memberRef(by.user, by.membership) : null,
      linked_at: linked.linked_at.toISOString(),
    };
  }

  /** Puts the connection's hook on the repository, or confirms the one we put there earlier. */
  async function ensureHook(
    ctx: TenantContext,
    connection: GitConnectionRow,
    repo: GitRepositoryRow,
  ): Promise<GitWebhookStatus> {
    const provider = providerOf(providers, connection.provider);
    if (connection.auth_kind === 'app_installation') return 'not_applicable';
    if (!provider.supports.webhook_registration || !connection.token_ciphertext) {
      return repo.webhook_status === 'active' ? 'active' : 'missing';
    }
    const hook = unsealHook(masterKey, connection)!;
    const auth = connectionAuth(masterKey, connection);
    const target = {
      url: webhookUrl(deps.apiBaseUrl, connection.provider, hook.hook_id),
      secret: repositoryHookSecret(hook.secret, repo.provider_repo_id),
    };
    try {
      if (repo.provider_webhook_id && (await provider.webhookExists(auth, repo, repo.provider_webhook_id))) {
        await provider.updateWebhook(auth, repo, repo.provider_webhook_id, target);
        await repositories.update(ctx, repo.id, { webhook_status: 'active' }, now());
        return 'active';
      }
      const { provider_webhook_id } = await provider.registerWebhook(auth, repo, target);
      await repositories.update(ctx, repo.id, { provider_webhook_id, webhook_status: 'active' }, now());
      return 'active';
    } catch {
      await repositories.update(ctx, repo.id, { webhook_status: 'missing' }, now());
      return 'missing';
    }
  }

  async function dropHookIfUnused(ctx: TenantContext, connection: GitConnectionRow, repo: GitRepositoryRow) {
    if ((await repositories.projectLinks(ctx, [repo.id])).length > 0) return;
    const provider = providerOf(providers, connection.provider);
    if (repo.provider_webhook_id && provider.supports.webhook_registration && connection.token_ciphertext) {
      const removed = await provider
        .removeWebhook(connectionAuth(masterKey, connection), repo, repo.provider_webhook_id)
        .then(() => true)
        .catch(() => false);
      // Kept when the provider refused: a later link updates that hook rather than adding a second.
      if (!removed) {
        await repositories.update(ctx, repo.id, { webhook_status: 'failing' }, now());
        return;
      }
    }
    await repositories.update(ctx, repo.id, { provider_webhook_id: null, webhook_status: 'not_applicable' }, now());
  }

  async function manageProject(principal: Principal, key: string, hints: OrgHints): Promise<ProjectAccess> {
    const project = await access.project(principal, key, hints);
    access.require(principal, 'project.repositories.manage', project.scope);
    if (project.project.is_archived) throw new AppError('project.archived', 409, { key: project.project.key });
    return project;
  }

  /**
   * `match_all_projects` and `merge_base_branches` belong to the repository, so they reach every
   * project it serves: matching every project, or changing branches a repository shares with
   * another project, is an Org Admin's to change.
   */
  async function guardShared(
    project: ProjectAccess,
    principal: Principal,
    repo: GitRepositoryRow,
    input: { match_all_projects?: boolean | undefined; merge_base_branches?: string[] | null | undefined },
  ) {
    const matching = input.match_all_projects !== undefined && input.match_all_projects !== repo.match_all_projects;
    const branches =
      input.merge_base_branches !== undefined &&
      JSON.stringify(input.merge_base_branches) !== JSON.stringify(repo.merge_base_branches);
    if (!matching && !branches) return;
    const shared =
      repo.match_all_projects ||
      (await repositories.projectLinks(project.ctx, [repo.id])).some(l => l.project_id !== project.project.id);
    if ((matching || shared) && !can(principal, 'org.git.manage', project.scope)) {
      throw new AppError(
        'git.repository_shared',
        403,
        { repository: repo.full_name },
        matching ? 'match_all_projects' : 'merge_base_branches',
      );
    }
  }

  async function recordLink(
    project: ProjectAccess,
    principal: Principal,
    kind: 'repository_linked' | 'repository_unlinked',
    repo: GitRepositoryRow,
  ) {
    await inTransaction(r =>
      r.activity.record(project.ctx, {
        actor_id: principal.userId,
        kind,
        target_type: 'project',
        target_id: String(project.project.id),
        old_value: null,
        new_value: { repository: repo.full_name, project: project.project.key },
        ip: null,
      }),
    );
  }

  return {
    effectiveBranches,

    /** Reads a newly linked repository's recent pull requests and branches in, recording progress on the row. */
    async backfill(job: GitBackfillJob): Promise<number> {
      const ctx = tenantContext(job.org_id);
      const repo = await repositories.findById(ctx, job.repository_id);
      if (!repo || repo.removed_at) return 0;
      const connection = await connections.findById(ctx, repo.connection_id);
      if (!connection || connection.revoked_at || connection.status === 'suspended') return 0;
      const started = now().toISOString();
      const state = (s: Partial<GitBackfill>): GitBackfill => ({
        state: 'running',
        pull_requests: 0,
        branches: 0,
        started_at: started,
        finished_at: null,
        error: null,
        ...s,
      });
      await repositories.update(ctx, repo.id, { backfill_state: state({}) }, now());
      try {
        const done = await deps.linker.backfill(ctx, connection, repo);
        await repositories.update(
          ctx,
          repo.id,
          { backfill_state: state({ state: 'done', ...done, finished_at: now().toISOString() }) },
          now(),
        );
        return done.pull_requests + done.branches;
      } catch (error) {
        const failure = error instanceof GitProviderError ? error.reason : 'internal';
        await repositories.update(
          ctx,
          repo.id,
          { backfill_state: state({ state: 'failed', error: failure, finished_at: now().toISOString() }) },
          now(),
        );
        return 0;
      }
    },

    /**
     * Nightly: for every linked repository with a delivery in the last 30 days, re-reads its
     * metadata, checks the hook we registered is still there, and re-reads its open pull requests.
     */
    async reconcileAll(at = now()): Promise<number> {
      const since = at.getTime() - RECONCILE_ACTIVE_DAYS * 24 * 60 * 60 * 1000;
      let applied = 0;
      for (const connection of await connections.listLiveAll(systemContext('git.reconcile spans every organisation'))) {
        if (connection.status === 'suspended') continue;
        const ctx = tenantContext(connection.org_id);
        const provider = providerOf(providers, connection.provider);
        const auth = connectionAuth(masterKey, connection);
        const { rows } = await repositories.list(
          ctx,
          { connectionIds: [connection.id], linked: true },
          { limit: 10_000, offset: 0 },
        );
        for (const repo of rows.filter(r => !r.removed_at && r.last_event_at && r.last_event_at.getTime() >= since)) {
          try {
            if (repo.provider_webhook_id && provider.supports.webhook_registration && auth.token) {
              const present = await provider.webhookExists(auth, repo, repo.provider_webhook_id);
              if (!present) await repositories.update(ctx, repo.id, { webhook_status: 'missing' }, at);
            }
            applied += await deps.linker.reconcile(ctx, connection, repo);
          } catch {
            // One repository the provider refuses tonight does not stop the others.
          }
        }
      }
      return applied;
    },

    async list(
      principal: Principal,
      slug: string,
      query: GitRepositoriesQuery,
    ): Promise<{ data: GitRepository[]; total: number }> {
      const org = await access.org(principal, slug);
      if (!can(principal, 'org.git.manage', org.scope)) {
        if (!query.project) {
          const mine = await projects.listReadable(org.ctx, principal.userId, { everyProject: false });
          if (!mine.some(p => p.role === 'project_admin')) access.require(principal, 'org.git.manage', org.scope);
          throw new AppError('git.project_required', 422, {}, 'project');
        }
        const project = await access.project(principal, query.project.toUpperCase(), { slug });
        access.require(principal, 'git.repositories.list', project.scope);
      }
      const all = await connections.list(org.ctx, { includeRevoked: Boolean(query.connection) });
      let ids = all.filter(c => !c.revoked_at).map(c => c.id);
      if (query.connection) {
        const wanted = query.connection.toLowerCase();
        const match = all.find(c => nameOf(c).toLowerCase() === wanted);
        if (!match) {
          throw new AppError('git.connection_not_found', 404, { slug, connection: query.connection }, 'connection');
        }
        ids = [match.id];
      }
      const { rows, total } = await repositories.list(
        org.ctx,
        {
          connectionIds: ids,
          ...(query.q ? { q: query.q } : {}),
          ...(query.linked ? { linked: query.linked === 'true' } : {}),
          includeRemoved: Boolean(query.connection),
        },
        { limit: query.limit, offset: query.offset },
      );
      return { data: await toDtos(org, principal, rows), total };
    },

    async listForProject(principal: Principal, key: string, hints: OrgHints = {}): Promise<ProjectRepository[]> {
      const project = await access.project(principal, key, hints);
      access.require(principal, 'git.read', project.scope);
      const linked = await repositories.listForProject(project.ctx, project.project.id);
      const dtos = await toDtos(project, principal, linked);
      const people = await organizations.findMembersByUserIds(project.ctx, [...new Set(linked.map(l => l.linked_by))], {
        includeRemoved: true,
      });
      return dtos.map((dto, i) => {
        const by = people.find(p => p.user.id === linked[i]!.linked_by);
        return {
          ...dto,
          linked_by: by ? access.memberRef(by.user, by.membership) : null,
          linked_at: linked[i]!.linked_at.toISOString(),
        };
      });
    },

    async link(
      principal: Principal,
      key: string,
      ref: string,
      input: LinkRepository,
      hints: OrgHints = {},
    ): Promise<ProjectRepository> {
      const project = await manageProject(principal, key, hints);
      const { repo, connection } = await resolveLive(project.ctx, ref, input.connection);
      if (repo.removed_at)
        throw new AppError('git.repository_removed', 409, { repository: repo.full_name }, 'repository');
      await guardShared(project, principal, repo, input);
      const limit = planLimits(project.organization.plan as OrgPlan).git_repositories_per_project;
      if (limit !== null && (await repositories.countForProject(project.ctx, project.project.id)) >= limit) {
        throw new AppError('git.repository_limit_reached', 409, { limit });
      }
      const linked = await repositories.link(project.ctx, project.project.id, repo.id, principal.userId, now());
      if (!linked) {
        throw new AppError('git.repository_already_linked', 409, {
          repository: repo.full_name,
          key: project.project.key,
        });
      }
      const settings = {
        ...(input.match_all_projects === undefined ? {} : { match_all_projects: input.match_all_projects }),
        ...(input.merge_base_branches === undefined ? {} : { merge_base_branches: input.merge_base_branches }),
      };
      if (Object.keys(settings).length) await repositories.update(project.ctx, repo.id, settings, now());
      await ensureHook(project.ctx, connection, repo);
      if (input.backfill) {
        const queued: GitBackfill = {
          state: 'queued',
          pull_requests: 0,
          branches: 0,
          started_at: null,
          finished_at: null,
          error: null,
        };
        await repositories.update(project.ctx, repo.id, { backfill_state: queued }, now());
        await deps
          .queue()
          .send(
            'git.backfill',
            { org_id: project.ctx.orgId, repository_id: repo.id },
            { startAfter: now(), singletonKey: `git-backfill:${repo.id}` },
          );
      }
      await recordLink(project, principal, 'repository_linked', repo);
      deps.analytics.capture(
        'git_repository_linked',
        { provider: connection.provider as GitProviderKind, backfill: input.backfill },
        { userId: principal.userId, orgId: project.ctx.orgId },
      );
      return projectDto(project, principal, repo.id);
    },

    async update(
      principal: Principal,
      key: string,
      ref: string,
      input: UpdateRepositoryLink,
      hints: OrgHints = {},
    ): Promise<ProjectRepository> {
      const project = await manageProject(principal, key, hints);
      const { repo } = await resolveLinked(project, ref, input.connection);
      await guardShared(project, principal, repo, input);
      await repositories.update(
        project.ctx,
        repo.id,
        {
          ...(input.match_all_projects === undefined ? {} : { match_all_projects: input.match_all_projects }),
          ...(input.merge_base_branches === undefined ? {} : { merge_base_branches: input.merge_base_branches }),
        },
        now(),
      );
      return projectDto(project, principal, repo.id);
    },

    async unlink(
      principal: Principal,
      key: string,
      ref: string,
      connectionName?: string,
      hints: OrgHints = {},
    ): Promise<ProjectRepository[]> {
      const project = await manageProject(principal, key, hints);
      const { repo, connection } = await resolveLinked(project, ref, connectionName);
      await repositories.unlink(project.ctx, project.project.id, repo.id);
      if (!connection.revoked_at) await dropHookIfUnused(project.ctx, connection, repo);
      await recordLink(project, principal, 'repository_unlinked', repo);
      return this.listForProject(principal, key, hints);
    },

    /** Refreshes one repository from the provider now: name, default branch, archived, still there. */
    async resync(principal: Principal, slug: string, ref: string, connectionName?: string): Promise<GitRepository> {
      const org = await access.org(principal, slug);
      access.require(principal, 'org.git.manage', org.scope);
      const { repo, connection } = await resolveLive(org.ctx, ref, connectionName);
      const provider = providerOf(providers, connection.provider);
      const auth = connectionAuth(masterKey, connection);
      if (auth.auth_kind === 'manual' && !auth.token) return (await toDtos(org, principal, [repo]))[0]!;
      let fresh: Awaited<ReturnType<typeof provider.getRepository>>;
      try {
        fresh = await provider.getRepository(auth, repo);
      } catch (error) {
        throw providerFailure(error, connection.provider);
      }
      const updated = fresh
        ? await repositories.update(
            org.ctx,
            repo.id,
            {
              full_name: fresh.full_name,
              html_url: fresh.html_url,
              default_branch: fresh.default_branch || repo.default_branch,
              is_private: fresh.is_private,
              is_archived: fresh.is_archived,
              removed_at: null,
            },
            now(),
          )
        : await repositories.update(org.ctx, repo.id, { removed_at: now() }, now());
      return (await toDtos(org, principal, [updated!]))[0]!;
    },

    async rehook(principal: Principal, slug: string, ref: string, connectionName?: string): Promise<GitRepository> {
      const org = await access.org(principal, slug);
      access.require(principal, 'org.git.manage', org.scope);
      const { repo, connection } = await resolveLive(org.ctx, ref, connectionName);
      const provider = providerOf(providers, connection.provider);
      if (connection.auth_kind === 'manual' || !provider.supports.webhook_registration) {
        if (connection.auth_kind !== 'app_installation') {
          throw new AppError('git.webhook_manual', 409, { repository: repo.full_name }, 'repository');
        }
      } else {
        await ensureHook(org.ctx, connection, repo);
      }
      return (await toDtos(org, principal, [(await repositories.findById(org.ctx, repo.id))!]))[0]!;
    },
  };
}

export type GitRepositoriesService = ReturnType<typeof gitRepositoriesService>;

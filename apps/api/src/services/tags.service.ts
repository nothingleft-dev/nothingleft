import {
  viaOf,
  type ApplyTags,
  type Issue,
  type LabelColor,
  type MergeTags,
  type Pagination,
  type Principal,
  type Tag,
  type TagContext,
  type UpdateTag,
} from '@nothingleft/types';
import type {
  ArticleSearchRepository,
  CustomFieldsRepository,
  IssuesRepository,
  ProjectsRepository,
  TagRow,
  TagsRepository,
  TagWithUsage,
  TenantContext,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { slugify } from '@nothingleft/format';
import { render, type Clause, type Query, type Value } from '@nothingleft/query';
import { AppError } from '@lib/errors';
import { denial, type AccessService, type OrgAccess } from '@services/access';
import { loadCatalogue } from '@services/custom-field-values';
import { can, type Capability, type Scope } from '@services/permissions';
import { registryFor } from '@services/search.service';
import type { ArticlesService } from '@services/articles.service';
import { recordIssueEvent } from '@services/issue-history';
import { applyTags, wantedTags } from '@services/issue-tag-writer';
import type { IssuesService, Located } from '@services/issues.service';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';

export interface TagsDeps {
  access: AccessService;
  issues: IssuesService;
  issuesRepo: IssuesRepository;
  tags: TagsRepository;
  articles: ArticlesService;
  articleSearch: ArticleSearchRepository;
  projects: ProjectsRepository;
  customFields: CustomFieldsRepository;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
  now?: () => Date;
}

export interface TagListQuery {
  q?: string | undefined;
  context?: TagContext | undefined;
  project?: string | undefined;
  in_use?: boolean | undefined;
  limit: number;
  offset: number;
}

export interface ManageTagsQuery {
  q?: string | undefined;
  limit: number;
  offset: number;
}

const tagDto = (row: TagWithUsage): Tag => ({
  name: row.tag.name,
  slug: row.tag.slug,
  color: row.tag.color as LabelColor,
  issue_count: row.issue_count,
  article_count: row.article_count,
});

const sameTag = (value: string, tag: Pick<TagRow, 'name' | 'slug'>) =>
  value.toLowerCase() === tag.name.toLowerCase() || slugify(value) === tag.slug;

/**
 * `tag:` values naming any of `from` renamed to `to`, through aggregates; null when nothing named them.
 * A bare `#word` shorthand is left alone: it also matches statuses, priorities, types and sprints.
 */
export function retagQuery(query: Query, from: readonly Pick<TagRow, 'name' | 'slug'>[], to: string): Query | null {
  let changed = false;
  const clauses = query.clauses.map((clause): Clause => {
    if (clause.kind === 'aggregate') {
      const inner = retagQuery(clause.query, from, to);
      if (!inner) return clause;
      changed = true;
      return { ...clause, query: inner };
    }
    if (clause.kind !== 'attribute' || clause.attribute !== 'tag') return clause;
    const seen = new Set<string>();
    const values: Value[] = [];
    for (const value of clause.values) {
      const renamed =
        value.kind === 'literal' && from.some(tag => sameTag(value.value, tag)) ? { ...value, value: to } : value;
      if (renamed !== value) changed = true;
      const key = renamed.kind === 'literal' ? `${renamed.negated}:${slugify(renamed.value)}` : JSON.stringify(renamed);
      if (seen.has(key)) continue;
      seen.add(key);
      values.push(renamed);
    }
    return { ...clause, values };
  });
  return changed ? { ...query, clauses } : null;
}

export function tagsService(deps: TagsDeps) {
  const { access, issues, issuesRepo, tags, inTransaction, analytics } = deps;
  const now = deps.now ?? (() => new Date());

  async function fresh(principal: Principal, located: Located): Promise<Issue> {
    const row = await issuesRepo.findById(located.project.ctx, located.issue.id);
    return issues.dto(principal, located.project, row!);
  }

  /**
   * Renaming and recolouring is any Project Admin's, of any project; merging and deleting an Org
   * Admin's. Tags belong to the organisation, so the check is made where the caller holds the most.
   */
  async function managerOf(principal: Principal, hints: OrgHints, capability: Capability): Promise<OrgAccess> {
    const org = await access.current(principal, hints);
    if (can(principal, capability, org.scope)) return org;
    let closest: Scope = org.scope;
    for (const { project, role } of await deps.projects.listReadable(org.ctx, principal.userId, {
      everyProject: false,
    })) {
      if (role !== 'project_admin') continue;
      const scope: Scope = { ...org.scope, projectRole: 'project_admin', projectId: project.id };
      if (can(principal, capability, scope)) return org;
      closest = scope;
    }
    throw denial(principal, capability, closest, AppError.forbidden);
  }

  async function findTag(ctx: TenantContext, name: string, field: string): Promise<TagRow> {
    const slug = slugify(name);
    const [row] = slug ? await tags.findBySlugs(ctx, [slug]) : [];
    if (!row) throw new AppError('tag.not_found', 404, { tag: name }, field);
    return row;
  }

  async function withUsage(ctx: TenantContext, row: TagRow): Promise<Tag> {
    const { rows } = await tags.listWithUsage(ctx, { ids: [row.id], limit: 1, offset: 0 });
    return rows[0] ? tagDto(rows[0]) : tagDto({ tag: row, issue_count: 0, article_count: 0 });
  }

  /** Every saved view naming one of `from` in `tag:` names `to` instead, in the caller's transaction. */
  async function retagViews(
    repos: TenantRepos,
    ctx: TenantContext,
    from: readonly TagRow[],
    to: string,
  ): Promise<number> {
    const views = await repos.savedViews.listAll(ctx);
    if (views.length === 0) return 0;
    const registry = registryFor(await loadCatalogue(deps.customFields, ctx, await deps.projects.listIds(ctx)));
    let rewritten = 0;
    for (const view of views) {
      const next = retagQuery(view.query_ast as Query, from, to);
      if (!next) continue;
      await repos.savedViews.update(ctx, view.id, { query: render(next, registry), query_ast: next });
      rewritten++;
    }
    return rewritten;
  }

  const recordTag = (
    repos: TenantRepos,
    org: OrgAccess,
    principal: Principal,
    kind: 'tag_renamed' | 'tag_merged' | 'tag_deleted',
    tag: TagRow,
    values: { old_value: Record<string, unknown>; new_value: Record<string, unknown> | null },
  ) =>
    repos.activity.record(org.ctx, {
      actor_id: principal.userId,
      kind,
      target_type: 'tag',
      target_id: String(tag.id),
      ...values,
      ip: null,
    });

  return {
    async list(
      principal: Principal,
      query: TagListQuery,
      hints: OrgHints = {},
    ): Promise<{ data: Tag[]; pagination: Pagination }> {
      const sc = await deps.articles.scopeFor(principal, hints, query.project, { search: false });
      access.require(principal, 'org.read', sc.org.scope);
      const { rows, total } = await deps.articleSearch.tagUsage(
        sc.ctx,
        {
          userId: principal.userId,
          issueProjectIds: sc.search.projectIds,
          articleProjectIds: sc.search.projectIds,
          ownDraftProjectIds: sc.search.ownDraftProjectIds,
          adminProjectIds: sc.search.adminProjectIds,
        },
        { q: query.q, context: query.context, inUse: query.in_use, limit: query.limit, offset: query.offset },
      );
      return {
        data: rows.map(r => ({
          name: r.tag.name,
          slug: r.tag.slug,
          color: r.tag.color as LabelColor,
          issue_count: r.issue_count,
          article_count: r.article_count,
        })),
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          next_cursor: null,
          has_more: query.offset + rows.length < total,
        },
      };
    },

    /** By name or slug: `Needs Review` reuses `needs-review`, and a new one is created on first use. */
    async apply(principal: Principal, key: string, input: ApplyTags, hints: OrgHints = {}): Promise<Issue> {
      const located = await issues.locate(principal, key, hints);
      issues.requireWritable(principal, located.project, 'tag.apply');
      const wanted = wantedTags(input.tags, input.color, 'tags');
      const { ctx } = located.project;

      const counts = await inTransaction(async repos => {
        const issue = await repos.issues.lockById(ctx, located.issue.id);
        if (!issue || issue.deleted_at) throw new AppError('issue.not_found', 404, { key }, 'key');
        const at = now();
        const result = await applyTags(
          repos,
          {
            ctx,
            issueId: issue.id,
            actorId: principal.userId,
            at,
            onCreate: () => access.require(principal, 'tag.create', located.project.scope),
          },
          wanted,
        );
        if (result.applied > 0) {
          await repos.issues.update(ctx, issue.id, { updated_by: principal.userId, updated_at: at });
        }
        return result;
      });
      analytics.capture(
        'tags_applied',
        { via: principal.via, entity: 'issue', ...counts },
        { userId: principal.userId, orgId: located.project.organization.id },
      );
      return fresh(principal, located);
    },

    /** The management screen: every tag of the organisation, counted across every project. */
    async manage(
      principal: Principal,
      query: ManageTagsQuery,
      hints: OrgHints = {},
    ): Promise<{ data: Tag[]; pagination: Pagination }> {
      const org = await managerOf(principal, hints, 'tag.update');
      const { rows, total } = await tags.listWithUsage(org.ctx, query);
      return {
        data: rows.map(tagDto),
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
          next_cursor: null,
          has_more: query.offset + rows.length < total,
        },
      };
    },

    /** A new name moves the slug with it, and every saved view's `tag:` follows. */
    async update(principal: Principal, name: string, input: UpdateTag, hints: OrgHints = {}): Promise<Tag> {
      const org = await managerOf(principal, hints, 'tag.update');
      const current = await findTag(org.ctx, name, 'tag');
      const renamed = input.name !== undefined && input.name !== current.name ? input.name : undefined;
      const slug = renamed === undefined ? current.slug : slugify(renamed);
      if (!slug) throw new AppError('tag.invalid', 400, { name: renamed! }, 'name');
      if (slug !== current.slug) {
        const [taken] = await tags.findBySlugs(org.ctx, [slug]);
        if (taken) {
          throw new AppError('tag.slug_taken', 409, { name: renamed!, existing: taken.name }, 'name', [taken.name]);
        }
      }
      const recolored = input.color !== undefined && input.color !== current.color;
      if (renamed === undefined && !recolored) return withUsage(org.ctx, current);

      const views = await inTransaction(async repos => {
        const row = await repos.tags.update(org.ctx, current.id, {
          ...(renamed === undefined ? {} : { name: renamed, slug }),
          ...(recolored ? { color: input.color! } : {}),
        });
        if (!row) throw new AppError('tag.not_found', 404, { tag: name }, 'tag');
        if (renamed === undefined) return 0;
        await recordTag(repos, org, principal, 'tag_renamed', row, {
          old_value: { name: current.name },
          new_value: { name: renamed },
        });
        return retagViews(repos, org.ctx, [current], renamed);
      });
      const fresh = await withUsage(org.ctx, { ...current, name: renamed ?? current.name, slug });
      analytics.capture(
        'tag_managed',
        {
          action: renamed === undefined ? 'recolored' : 'renamed',
          via: viaOf(principal),
          sources: 1,
          issues: fresh.issue_count,
          articles: fresh.article_count,
          views_rewritten: views,
        },
        { userId: principal.userId, orgId: org.organization.id },
      );
      return fresh;
    },

    async merge(principal: Principal, input: MergeTags, hints: OrgHints = {}): Promise<Tag> {
      const org = await managerOf(principal, hints, 'tag.delete');
      const target = await findTag(org.ctx, input.into, 'into');
      const sources = new Map<number, TagRow>();
      for (const name of input.tags) {
        const row = await findTag(org.ctx, name, 'tags');
        if (row.id === target.id) throw new AppError('tag.merge_into_self', 400, { tag: target.name }, 'tags');
        sources.set(row.id, row);
      }
      const merged = [...sources.values()];
      const before = await tags.listWithUsage(org.ctx, { ids: [...sources.keys()], limit: sources.size, offset: 0 });

      const views = await inTransaction(async repos => {
        await repos.tags.mergeInto(org.ctx, [...sources.keys()], target.id);
        await recordTag(repos, org, principal, 'tag_merged', target, {
          old_value: { names: merged.map(t => t.name) },
          new_value: { name: target.name },
        });
        return retagViews(repos, org.ctx, merged, target.name);
      });
      analytics.capture(
        'tag_managed',
        {
          action: 'merged',
          via: viaOf(principal),
          sources: merged.length,
          issues: before.rows.reduce((n, r) => n + r.issue_count, 0),
          articles: before.rows.reduce((n, r) => n + r.article_count, 0),
          views_rewritten: views,
        },
        { userId: principal.userId, orgId: org.organization.id },
      );
      return withUsage(org.ctx, target);
    },

    /** The tag comes off every issue and article. Saved views naming it are left as written. */
    async remove(principal: Principal, name: string, hints: OrgHints = {}): Promise<Tag> {
      const org = await managerOf(principal, hints, 'tag.delete');
      const row = await findTag(org.ctx, name, 'tag');
      const usage = await withUsage(org.ctx, row);
      await inTransaction(async repos => {
        if (!(await repos.tags.deleteTag(org.ctx, row.id)))
          throw new AppError('tag.not_found', 404, { tag: name }, 'tag');
        await recordTag(repos, org, principal, 'tag_deleted', row, {
          old_value: { name: row.name, issue_count: usage.issue_count, article_count: usage.article_count },
          new_value: null,
        });
      });
      analytics.capture(
        'tag_managed',
        {
          action: 'deleted',
          via: viaOf(principal),
          sources: 1,
          issues: usage.issue_count,
          articles: usage.article_count,
          views_rewritten: 0,
        },
        { userId: principal.userId, orgId: org.organization.id },
      );
      return usage;
    },

    async untag(principal: Principal, key: string, tag: string, hints: OrgHints = {}): Promise<Issue> {
      const located = await issues.locate(principal, key, hints);
      issues.requireWritable(principal, located.project, 'tag.apply');
      const { ctx } = located.project;
      const notTagged = () =>
        new AppError('issue.not_tagged', 404, { key: issues.keyIn(located.project)(located.issue), tag }, 'tag');
      const slug = slugify(tag);
      const [row] = slug ? await tags.findBySlugs(ctx, [slug]) : [];
      if (!row) throw notTagged();
      await inTransaction(async repos => {
        const issue = await repos.issues.lockById(ctx, located.issue.id);
        if (!issue || issue.deleted_at) throw new AppError('issue.not_found', 404, { key }, 'key');
        if (!(await repos.tags.remove(ctx, issue.id, row.id))) throw notTagged();
        const at = now();
        await recordIssueEvent(
          repos.issueActivity,
          { ctx, issueId: issue.id, actorId: principal.userId, changeGroupId: Bun.randomUUIDv7(), at },
          'untagged',
          { old_value: { name: row.name } },
        );
        await repos.issues.update(ctx, issue.id, { updated_by: principal.userId, updated_at: at });
      });
      return fresh(principal, located);
    },
  };
}

export type TagsService = ReturnType<typeof tagsService>;

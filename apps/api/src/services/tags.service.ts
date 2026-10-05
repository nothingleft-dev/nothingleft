import {
  type ApplyTags,
  type Issue,
  type LabelColor,
  type Pagination,
  type Principal,
  type Tag,
  type TagContext,
} from '@nothingleft/types';
import type { ArticleSearchRepository, IssuesRepository, TagsRepository } from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { slugify } from '@nothingleft/format';
import { AppError } from '@lib/errors';
import type { AccessService } from '@services/access';
import type { ArticlesService } from '@services/articles.service';
import { recordIssueEvent } from '@services/issue-history';
import { applyTags, wantedTags } from '@services/issue-tag-writer';
import type { IssuesService, Located } from '@services/issues.service';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction } from '@services/transaction';

export interface TagsDeps {
  access: AccessService;
  issues: IssuesService;
  issuesRepo: IssuesRepository;
  tags: TagsRepository;
  articles: ArticlesService;
  articleSearch: ArticleSearchRepository;
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

export function tagsService(deps: TagsDeps) {
  const { access, issues, issuesRepo, tags, inTransaction, analytics } = deps;
  const now = deps.now ?? (() => new Date());

  async function fresh(principal: Principal, located: Located): Promise<Issue> {
    const row = await issuesRepo.findById(located.project.ctx, located.issue.id);
    return issues.dto(principal, located.project, row!);
  }

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

    async remove(principal: Principal, key: string, tag: string, hints: OrgHints = {}): Promise<Issue> {
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

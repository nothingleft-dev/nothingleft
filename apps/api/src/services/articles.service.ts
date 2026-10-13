import { recordArticleTouched } from '@services/notify-outbox';
import {
  ARTICLE_HIERARCHY_MAX_DEPTH,
  ARTICLE_RESTORE_WINDOW_DAYS,
  type ApplyTags,
  type Article,
  type ArticleNode,
  type ArticleRef,
  type ArticleStatus,
  type ArticleSummary,
  type CreateArticle,
  type DeleteArticleQuery,
  type GlobalSearchResult,
  type LabelColor,
  type MemberRef,
  type Pagination,
  type Principal,
  type ProjectRole,
  type Suggestion,
  type TagRef,
  type ToggleTask,
  type UpdateArticle,
  viaOf,
} from '@nothingleft/types';
import {
  systemContext,
  type ArticleRow,
  type ArticleSearchRepository,
  type ArticleSearchScope,
  type ArticlesRepository,
  type ArticleTreeRow,
  type IssuesRepository,
  type ProjectRow,
  type ProjectsRepository,
  type TagRow,
  type TagsRepository,
  type TenantContext,
  type UsersRepository,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { articleSlug, slugify, uniqueArticleSlug } from '@nothingleft/format';
import { t } from '@nothingleft/i18n';
import { checkMarkdownSize, extractReferences, markdownExcerpt, toggleTaskItem } from '@nothingleft/markdown';
import {
  articleRegistry,
  checkValues,
  dateInZone,
  parse,
  QueryError,
  sortKeysOf,
  suggest,
  vocabularyNeeds,
  type Query,
  type Vocabulary,
  type Weekday,
} from '@nothingleft/query';
import { SUGGEST_VALUES_MAX } from '@config/constants';
import { AppError } from '@lib/errors';
import { denial, type AccessService, type OrgAccess, type ProjectAccess } from '@services/access';
import { articleVisibleTo, draftReach } from '@services/article-visibility';
import { articleTree, renumber, visibleTree, type ArticleTree } from '@services/article-tree';
import { claimArticleDrafts } from '@services/attachment-writer';
import type { ObjectStores } from '@services/object-stores';
import { purgeDeleted } from '@services/deleted-purge';
import { dailyOnce, type DailyOnceStore } from '@services/daily-once';
import { ensureTags, wantedTags } from '@services/issue-tag-writer';
import type { IssuesService } from '@services/issues.service';
import { can, type Capability } from '@services/permissions';
import type { SearchService } from '@services/search.service';
import type { OrgHints } from '@services/tenancy.service';
import type { InTenantTransaction, TenantRepos } from '@services/transaction';

export interface ArticlesDeps {
  access: AccessService;
  search: SearchService;
  issues: IssuesService;
  projects: ProjectsRepository;
  articles: ArticlesRepository;
  articleSearch: ArticleSearchRepository;
  issuesRepo: IssuesRepository;
  tags: TagsRepository;
  users: UsersRepository;
  inTransaction: InTenantTransaction;
  analytics: Analytics;
  redis: DailyOnceStore;
  stores: ObjectStores;
  now?: () => Date;
}

export interface LocatedArticle {
  project: ProjectAccess;
  article: ArticleRow;
}

/** Who reads the knowledge base of one organisation, and which of its projects. */
export interface ArticleScope {
  org: OrgAccess;
  ctx: TenantContext;
  projects: ProjectRow[];
  search: ArticleSearchScope;
}

export interface ArticleListQuery {
  q?: string | undefined;
  project?: string | undefined;
  sort?: string | undefined;
  limit: number;
  offset: number;
}

const DAY_MS = 86_400_000;
const registry = articleRegistry();
const EMPTY_QUERY: Query = { clauses: [] };
const STATUS_NAMES: Record<ArticleStatus, string> = {
  draft: t('article.status.draft'),
  published: t('article.status.published'),
};

const tagRef = (row: TagRow): TagRef => ({ name: row.name, slug: row.slug, color: row.color as LabelColor });
const refOf = (row: Pick<ArticleRow, 'slug' | 'title'>): ArticleRef => ({ slug: row.slug, title: row.title });

function freeTextTerms(query: Query): string[] {
  return query.clauses.flatMap(c => (c.kind === 'text' && !c.text.startsWith('-') ? c.text.split(/\s+/) : []));
}

export function articlesService(deps: ArticlesDeps) {
  const { access, search, issues, projects, articles, articleSearch, issuesRepo, users, inTransaction, analytics } =
    deps;
  const now = deps.now ?? (() => new Date());

  const notFound = (project: string, slug: string) => new AppError('article.not_found', 404, { project, slug }, 'slug');

  function wrap<T>(body: () => T, field: string): T {
    try {
      return body();
    } catch (err) {
      if (err instanceof QueryError) throw AppError.fromQuery(err, field);
      throw err;
    }
  }

  const ownScope = (principal: Principal, project: ProjectAccess, row: Pick<ArticleRow, 'created_by'>) => ({
    ...project.scope,
    isOwnRecord: row.created_by === principal.userId,
  });

  function readable(principal: Principal, project: ProjectAccess, row: Pick<ArticleRow, 'status' | 'created_by'>) {
    return row.status === 'published'
      ? can(principal, 'article.read_published', project.scope)
      : can(principal, 'article.read_draft', ownScope(principal, project, row));
  }

  const writable = (project: ProjectAccess) => !project.project.is_archived;

  function requireWritable(principal: Principal, project: ProjectAccess, capability: Capability, own?: ArticleRow) {
    access.require(principal, capability, own ? ownScope(principal, project, own) : project.scope);
    if (!writable(project)) throw new AppError('project.archived', 409, { key: project.project.key });
  }

  async function locateProject(principal: Principal, key: string, hints: OrgHints): Promise<ProjectAccess> {
    const project = await access.project(principal, key, hints);
    if (!can(principal, 'article.read_published', project.scope)) {
      throw denial(
        principal,
        'article.read_published',
        project.scope,
        () => new AppError('project.not_found', 404, { key }, 'key'),
      );
    }
    return project;
  }

  async function locate(principal: Principal, key: string, slug: string, hints: OrgHints): Promise<LocatedArticle> {
    const project = await locateProject(principal, key, hints);
    const article = await articles.findLiveBySlug(project.ctx, project.project.id, slug);
    if (!article || !readable(principal, project, article)) throw notFound(project.project.key, slug);
    return { project, article };
  }

  /** Another article of the project by slug or title, as the caller can see it. */
  async function named(
    repos: Pick<TenantRepos, 'articles'>,
    principal: Principal,
    project: ProjectAccess,
    name: string,
    field: string,
  ): Promise<ArticleRow> {
    const bySlug = await repos.articles.findLiveBySlug(project.ctx, project.project.id, name);
    if (bySlug && readable(principal, project, bySlug)) return bySlug;
    const byTitle = (await repos.articles.findLiveByTitle(project.ctx, project.project.id, name)).filter(r =>
      readable(principal, project, r),
    );
    if (byTitle.length === 1) return byTitle[0]!;
    if (byTitle.length > 1) {
      throw new AppError(
        'article.ambiguous',
        400,
        { project: project.project.key, name },
        field,
        byTitle.map(r => r.slug),
      );
    }
    throw new AppError('article.not_found', 404, { project: project.project.key, slug: name }, field);
  }

  async function loadTree(project: ProjectAccess, repos: Pick<TenantRepos, 'articles'> = { articles }) {
    return articleTree(await repos.articles.tree(project.ctx, project.project.id));
  }

  const memberRefs = async (ctx: TenantContext, userIds: number[]): Promise<Map<number, MemberRef>> => {
    const people = await issuesRepo.findPeople(ctx, userIds);
    return new Map(people.map(p => [p.user.id, access.memberRef(p.user, p.membership)]));
  };
  const person = (refs: Map<number, MemberRef>, id: number): MemberRef =>
    refs.get(id) ?? { username: '', name: '', avatar_url: null, former_member: true, deactivated: false };

  const restorableUntil = (row: ArticleRow) =>
    row.deleted_at ? new Date(row.deleted_at.getTime() + ARTICLE_RESTORE_WINDOW_DAYS * DAY_MS).toISOString() : null;

  async function dto(principal: Principal, project: ProjectAccess, row: ArticleRow): Promise<Article> {
    const ctx = project.ctx;
    const [tree, refs, tagRows, comments, files, watchers, signals] = await Promise.all([
      loadTree(project),
      memberRefs(ctx, [row.created_by, row.updated_by]),
      articles.tagsFor(ctx, [row.id]),
      articles.commentCounts(ctx, [row.id]),
      articles.attachmentCounts(ctx, [row.id]),
      articles.watcherCounts(ctx, [row.id]),
      articles.signalsFor(ctx, [row.id], principal.userId),
    ]);
    const canRead = (r: Pick<ArticleRow, 'status' | 'created_by'>) => readable(principal, project, r);
    const path = row.deleted_at ? [] : tree.ancestors(row.id).filter(canRead);
    const live = !row.deleted_at && writable(project);
    const own = ownScope(principal, project, row);
    return {
      project: { key: project.project.key, name: project.project.name },
      slug: row.slug,
      title: row.title,
      status: row.status as ArticleStatus,
      body_md: row.body_md,
      parent: path.length > 0 ? refOf(path.at(-1)!) : null,
      path: path.map(refOf),
      position: row.position,
      child_count: row.deleted_at ? 0 : tree.childrenOf(row.id).filter(canRead).length,
      tags: tagRows.map(r => tagRef(r.tag)),
      created_by: person(refs, row.created_by),
      updated_by: person(refs, row.updated_by),
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
      published_at: row.published_at?.toISOString() ?? null,
      comment_count: comments.get(row.id) ?? 0,
      attachment_count: files.get(row.id) ?? 0,
      watcher_count: watchers.get(row.id) ?? 0,
      me: {
        starred: signals.get(row.id)?.starred ?? false,
        watching: signals.get(row.id)?.watching ?? false,
        can_edit: live && can(principal, 'article.update', project.scope),
        can_publish: live && can(principal, 'article.publish', project.scope),
        can_move: live && can(principal, 'article.reorder', project.scope),
        can_delete: live && can(principal, 'article.delete', own),
        can_comment: live && can(principal, 'article.comment', project.scope),
      },
      deleted_at: row.deleted_at?.toISOString() ?? null,
      restorable_until: restorableUntil(row),
    };
  }

  async function fresh(principal: Principal, project: ProjectAccess, id: number): Promise<Article> {
    return dto(principal, project, (await articles.findById(project.ctx, id))!);
  }

  async function summaries(
    principal: Principal,
    ctx: TenantContext,
    rows: { article: ArticleRow; project: { key: string; name: string } }[],
    visible: (row: ArticleRow) => boolean,
    terms: string[] = [],
  ): Promise<ArticleSummary[]> {
    if (rows.length === 0) return [];
    const ids = rows.map(r => r.article.id);
    const parentIds = rows.flatMap(r => (r.article.parent_id === null ? [] : [r.article.parent_id]));
    const [refs, tagRows, signals, parents] = await Promise.all([
      memberRefs(
        ctx,
        rows.flatMap(r => [r.article.created_by, r.article.updated_by]),
      ),
      articles.tagsFor(ctx, ids),
      articles.signalsFor(ctx, ids, principal.userId),
      articles.findByIds(ctx, parentIds),
    ]);
    const parentById = new Map(parents.map(p => [p.id, p]));
    return rows.map(({ article: row, project }) => {
      const parent = row.parent_id === null ? undefined : parentById.get(row.parent_id);
      return {
        project,
        slug: row.slug,
        title: row.title,
        status: row.status as ArticleStatus,
        parent: parent && !parent.deleted_at && visible(parent) ? refOf(parent) : null,
        tags: tagRows.filter(tr => tr.article_id === row.id).map(tr => tagRef(tr.tag)),
        created_by: person(refs, row.created_by),
        updated_by: person(refs, row.updated_by),
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
        published_at: row.published_at?.toISOString() ?? null,
        excerpt: markdownExcerpt(row.body_md, terms),
        starred: signals.get(row.id)?.starred ?? false,
      };
    });
  }

  function checkBody(body: string): string {
    const size = checkMarkdownSize(body);
    if (size.level === 'too_large') {
      throw new AppError('article.body_too_large', 400, { size: Math.ceil(size.bytes / 1024) }, 'body_md');
    }
    return body;
  }

  function explicitSlug(project: ProjectAccess, input: string): string {
    const slug = articleSlug(input);
    if (!slug) throw new AppError('article.slug_invalid', 400, { slug: input }, 'slug');
    return slug;
  }

  async function writeBodyDerived(repos: TenantRepos, ctx: TenantContext, articleId: number, body: string) {
    const references = extractReferences(body);
    const found = await repos.organizations.findMembersByUsernames(ctx, references.mentions);
    await repos.articles.replaceMentions(
      ctx,
      { type: 'article', id: articleId, articleId },
      found.map(f => f.user.id),
    );
    await repos.articles.replaceIssueRefs(ctx, articleId, references.issueKeys);
  }

  /** Where a moving or new article lands: its parent and its index among that parent's children. */
  async function placement(
    repos: TenantRepos,
    principal: Principal,
    project: ProjectAccess,
    tree: ArticleTree,
    input: { parent?: string | null | undefined; before?: string | undefined; after?: string | undefined },
    current: ArticleRow | null,
    label = current?.slug ?? '',
  ): Promise<{ parentId: number | null; siblings: ArticleTreeRow[]; index: number }> {
    let parentId = current?.parent_id ?? null;
    if (input.parent !== undefined) {
      parentId = input.parent === null ? null : (await named(repos, principal, project, input.parent, 'parent')).id;
    }
    if (parentId !== null) {
      const parent = tree.byId.get(parentId)!;
      if (current) {
        if (parentId === current.id) throw new AppError('article.parent_self', 400, {}, 'parent');
        if (tree.ancestors(parentId).some(a => a.id === current.id)) {
          throw new AppError('article.hierarchy_cycle', 400, { parent: parent.slug, slug: label }, 'parent');
        }
      }
      const moving = current ? tree.height(current.id) : 1;
      if (tree.depth(parentId) + moving > ARTICLE_HIERARCHY_MAX_DEPTH) {
        throw new AppError('article.hierarchy_too_deep', 400, { parent: parent.slug, slug: label }, 'parent');
      }
    }
    const siblings = tree.childrenOf(parentId).filter(s => s.id !== current?.id);
    const anchorName = input.before ?? input.after;
    let index = siblings.length;
    if (anchorName !== undefined) {
      const field = input.before !== undefined ? 'before' : 'after';
      const anchor = await named(repos, principal, project, anchorName, field);
      const at = siblings.findIndex(s => s.id === anchor.id);
      if (at < 0) throw new AppError('article.anchor_not_sibling', 400, { anchor: anchor.slug }, field);
      index = input.before !== undefined ? at : at + 1;
    } else if (current && parentId === current.parent_id) {
      index = Math.min(
        siblings.length,
        tree.childrenOf(parentId).findIndex(s => s.id === current.id),
      );
    }
    return { parentId, siblings, index };
  }

  async function projectRoles(principal: Principal, org: OrgAccess) {
    const everyProject = org.scope.isOwner || org.scope.orgRole === 'org_admin';
    const rows = await projects.listReadable(org.ctx, principal.userId, { everyProject });
    return rows.flatMap(r => {
      const scope = { ...org.scope, projectRole: (r.role as ProjectRole | null) ?? null, projectId: r.project.id };
      if (!can(principal, 'article.read_published', scope)) return [];
      return [{ project: r.project, ...draftReach(principal, scope) }];
    });
  }

  /** The caller's readable knowledge bases in their current organisation, or in one project. */
  async function scopeFor(
    principal: Principal,
    hints: OrgHints,
    projectKey?: string,
    options: { search?: boolean } = {},
  ): Promise<ArticleScope> {
    let org: OrgAccess;
    let roles: { project: ProjectRow; ownDrafts: boolean; admin: boolean }[];
    if (projectKey) {
      const project = await locateProject(principal, projectKey, hints);
      org = project;
      roles = [{ project: project.project, ...draftReach(principal, project.scope) }];
    } else {
      org = await access.current(principal, hints);
      roles = await projectRoles(principal, org);
    }
    if (options.search !== false) access.require(principal, 'search.run', org.scope);
    const user = await users.findById(systemContext('the searcher’s own timezone'), principal.userId);
    const timezone = user?.timezone ?? 'UTC';
    const at = now();
    const week = org.organization.week_starts_on;
    return {
      org,
      ctx: org.ctx,
      projects: roles.map(r => r.project),
      search: {
        orgId: org.ctx.orgId,
        userId: principal.userId,
        projectIds: roles.map(r => r.project.id),
        ownDraftProjectIds: roles.filter(r => r.ownDrafts).map(r => r.project.id),
        adminProjectIds: roles.filter(r => r.admin).map(r => r.project.id),
        timezone,
        today: dateInZone(at, timezone),
        weekStartsOn: (week === 0 ? 7 : week) as Weekday,
        now: at,
      },
    };
  }

  const visibleIn = (sc: ArticleScope) => (row: Pick<ArticleRow, 'project_id' | 'status' | 'created_by'>) =>
    articleVisibleTo(sc.search, row);

  async function compile(sc: ArticleScope, text: string | undefined, sortText: string | undefined) {
    const trimmed = text?.trim() ?? '';
    const parsed = trimmed ? wrap(() => parse(trimmed, registry), 'q') : { query: EMPTY_QUERY, spans: [] };
    const query = parsed.query;
    const needs = vocabularyNeeds(query, registry);
    if (needs.size > 0) {
      const v = await articleSearch.vocabulary(sc.ctx, sc.search, needs);
      const entry = (pairs: [accepted: string[], display: string][]) => ({
        accepted: new Set(pairs.flatMap(([accepted]) => accepted.map(a => a.toLowerCase()))),
        display: pairs.map(([, display]) => display),
      });
      const vocabulary: Vocabulary = {
        tag: entry(v.tags.map(tag => [[tag.name, tag.slug], tag.name])),
        status: entry(Object.entries(STATUS_NAMES).map(([value, name]) => [[value, name], name])),
        parent: entry(v.parents.map(p => [[p.title, p.slug], p.title])),
        user: {
          accepted: new Set(v.usernames.map(u => u.username.toLowerCase())),
          display: v.usernames.filter(u => u.removed_at === null).map(u => u.username),
        },
      };
      wrap(() => checkValues(query, registry, vocabulary, parsed.spans), 'q');
    }
    const sort = sortText?.trim()
      ? wrap(() => sortKeysOf(parse(`sort by: ${sortText}`, registry).query), 'sort')
      : sortKeysOf(query);
    return { query, sort, clauseCount: parsed.query.clauses.length };
  }

  async function runSearch(principal: Principal, sc: ArticleScope, input: ArticleListQuery) {
    const compiled = await compile(sc, input.q, input.sort);
    const { rows, total } = await articleSearch.search(sc.ctx, sc.search, compiled.query, {
      sort: compiled.sort,
      limit: input.limit,
      offset: input.offset,
    });
    const terms = freeTextTerms(compiled.query);
    return {
      data: await summaries(principal, sc.ctx, rows, visibleIn(sc), terms),
      total,
      clauseCount: compiled.clauseCount,
      hasFreeText: terms.length > 0,
    };
  }

  /** Slug and position fixes for articles coming back together; the caller holds the tree lock. */
  async function restoreGroup(
    repos: TenantRepos,
    principal: Principal,
    project: ProjectAccess,
    root: ArticleRow,
    group: ArticleRow[],
  ) {
    const ctx = project.ctx;
    const members = new Map(group.map(r => [r.id, r]));
    const inSubtree = (row: ArticleRow): boolean => {
      let at: ArticleRow | undefined = row;
      const seen = new Set<number>();
      while (at && !seen.has(at.id)) {
        if (at.id === root.id) return true;
        seen.add(at.id);
        at = at.parent_id === null ? undefined : members.get(at.parent_id);
      }
      return false;
    };
    const restoring = group.filter(inSubtree);
    if (restoring.some(r => !can(principal, 'article.delete', ownScope(principal, project, r)))) {
      throw new AppError('article.restore_subtree_forbidden', 403, { slug: root.slug });
    }
    const taken = await repos.articles.liveSlugs(ctx, project.project.id);
    const liveTree = await loadTree(project, repos);
    // The live tree may have grown above the old parent meanwhile; a branch that no longer fits goes to the top.
    const height = articleTree(restoring).height(root.id);
    const fits =
      root.parent_id !== null &&
      liveTree.byId.has(root.parent_id) &&
      liveTree.depth(root.parent_id) + height <= ARTICLE_HIERARCHY_MAX_DEPTH;
    for (const row of restoring) {
      const slug = taken.has(row.slug.toLowerCase()) ? uniqueArticleSlug(row.slug, taken) : row.slug;
      taken.add(slug.toLowerCase());
      const parentId = row.id === root.id ? (fits ? row.parent_id : null) : row.parent_id;
      const position = row.id === root.id ? liveTree.childrenOf(parentId).length : row.position;
      await repos.articles.update(ctx, row.id, { deleted_at: null, slug, parent_id: parentId, position });
    }
    return restoring;
  }

  return {
    locate,
    locateProject,
    readable,
    scopeFor,
    visibleIn,
    dto,

    async tree(
      principal: Principal,
      key: string,
      options: { deleted?: boolean | undefined },
      hints: OrgHints = {},
    ): Promise<ArticleNode[]> {
      const project = await locateProject(principal, key, hints);
      const ctx = project.ctx;
      if (options.deleted) {
        const rows = await articles.tree(ctx, project.project.id, { deleted: true });
        const cutoff = now().getTime() - ARTICLE_RESTORE_WINDOW_DAYS * DAY_MS;
        const mine = rows.filter(
          r => r.deleted_at!.getTime() > cutoff && can(principal, 'article.delete', ownScope(principal, project, r)),
        );
        const starred = await articles.starredIn(ctx, project.project.id, principal.userId);
        return mine
          .sort((a, b) => b.deleted_at!.getTime() - a.deleted_at!.getTime() || b.id - a.id)
          .map(r => ({
            slug: r.slug,
            title: r.title,
            status: r.status as ArticleStatus,
            parent: null,
            depth: 1,
            position: r.position,
            child_count: 0,
            starred: starred.has(r.id),
            updated_at: r.updated_at.toISOString(),
            deleted_at: r.deleted_at!.toISOString(),
            restorable_until: new Date(r.deleted_at!.getTime() + ARTICLE_RESTORE_WINDOW_DAYS * DAY_MS).toISOString(),
          }));
      }
      const [tree, starred] = await Promise.all([
        loadTree(project),
        articles.starredIn(ctx, project.project.id, principal.userId),
      ]);
      return visibleTree(tree, r => readable(principal, project, r)).map(node => ({
        slug: node.row.slug,
        title: node.row.title,
        status: node.row.status as ArticleStatus,
        parent: node.parent?.slug ?? null,
        depth: node.depth,
        position: node.row.position,
        child_count: node.childCount,
        starred: starred.has(node.row.id),
        updated_at: node.row.updated_at.toISOString(),
        deleted_at: null,
        restorable_until: null,
      }));
    },

    async get(principal: Principal, key: string, slug: string, hints: OrgHints = {}): Promise<Article> {
      const { project, article } = await locate(principal, key, slug, hints);
      if (await dailyOnce(deps.redis, `article_viewed:${principal.userId}:${article.id}`, now())) {
        analytics.capture(
          'article_viewed',
          { via: principal.via },
          { userId: principal.userId, orgId: project.organization.id },
        );
      }
      return dto(principal, project, article);
    },

    async create(principal: Principal, key: string, input: CreateArticle, hints: OrgHints = {}): Promise<Article> {
      const project = await locateProject(principal, key, hints);
      requireWritable(principal, project, 'article.create');
      const status = input.status ?? 'draft';
      if (status === 'published') access.require(principal, 'article.publish', project.scope);
      if (input.tags?.length) access.require(principal, 'article.tag', project.scope);
      if (input.attachment_ids?.length) access.require(principal, 'attachment.upload', project.scope);
      const body = checkBody(input.body_md ?? '');
      const wanted = input.tags?.length ? wantedTags(input.tags, input.color, 'tags') : null;
      const ctx = project.ctx;

      const { row, depth } = await inTransaction(async repos => {
        await repos.articles.lockTree(ctx, project.project.id);
        const tree = await loadTree(project, repos);
        const place = await placement(repos, principal, project, tree, input, null, input.title);
        let slug: string;
        if (input.slug !== undefined) {
          slug = explicitSlug(project, input.slug);
          if ((await repos.articles.liveSlugs(ctx, project.project.id)).has(slug)) {
            throw new AppError('article.slug_taken', 409, { project: project.project.key, slug }, 'slug');
          }
        } else {
          slug = uniqueArticleSlug(input.title, await repos.articles.liveSlugs(ctx, project.project.id));
        }
        const at = now();
        const created = await repos.articles.insert(ctx, {
          project_id: project.project.id,
          parent_id: place.parentId,
          title: input.title,
          slug,
          body_md: body,
          status,
          position: place.index,
          created_by: principal.userId,
          published_at: status === 'published' ? at : null,
          created_at: at,
        });
        const ordered = [...place.siblings];
        ordered.splice(place.index, 0, { ...created });
        await repos.articles.setPositions(ctx, renumber(ordered));
        await writeBodyDerived(repos, ctx, created.id, body);
        await repos.articles.watch(ctx, created.id, [principal.userId], 'auto');
        if (wanted) {
          const { rows } = await ensureTags(
            repos,
            {
              ctx,
              actorId: principal.userId,
              onCreate: () => access.require(principal, 'tag.create', project.scope),
            },
            wanted,
          );
          await repos.articles.applyTags(
            ctx,
            created.id,
            rows.map(r => r.id),
          );
        }
        await claimArticleDrafts(
          repos,
          { ctx, articleId: created.id, actorId: principal.userId, slug },
          input.attachment_ids,
        );
        return { row: created, depth: place.parentId === null ? 1 : tree.depth(place.parentId) + 1 };
      });
      recordArticleTouched(ctx.orgId, row.id, principal.userId, row.created_at);
      const who = { userId: principal.userId, orgId: project.organization.id };
      const via = viaOf(principal);
      analytics.capture('article_created', { via, status, depth, tag_count: wanted?.size ?? 0 }, who);
      if (status === 'published') analytics.capture('article_published', { via }, who);
      return fresh(principal, project, row.id);
    },

    async update(
      principal: Principal,
      key: string,
      slug: string,
      input: UpdateArticle,
      hints: OrgHints = {},
    ): Promise<Article> {
      const { project, article } = await locate(principal, key, slug, hints);
      const editing = input.title !== undefined || input.body_md !== undefined || input.slug !== undefined;
      const moving = input.parent !== undefined || input.before !== undefined || input.after !== undefined;
      if (editing) requireWritable(principal, project, 'article.update');
      if (input.status !== undefined) requireWritable(principal, project, 'article.publish');
      if (moving) requireWritable(principal, project, 'article.reorder');
      const body = input.body_md === undefined ? undefined : checkBody(input.body_md);
      const ctx = project.ctx;

      const outcome = await inTransaction(async repos => {
        await repos.articles.lockTree(ctx, project.project.id);
        const current = await repos.articles.lockById(ctx, article.id);
        if (!current || current.deleted_at) throw notFound(project.project.key, slug);
        const at = now();
        const patch: Parameters<ArticlesRepository['update']>[2] = {};
        if (input.title !== undefined && input.title !== current.title) patch.title = input.title;
        if (body !== undefined && body !== current.body_md) patch.body_md = body;
        if (input.slug !== undefined) {
          const next = explicitSlug(project, input.slug);
          if (next !== current.slug) {
            const clash = await repos.articles.findLiveBySlug(ctx, project.project.id, next);
            if (clash && clash.id !== current.id) {
              throw new AppError('article.slug_taken', 409, { project: project.project.key, slug: next }, 'slug');
            }
            patch.slug = next;
          }
        }
        let published = false;
        if (input.status !== undefined && input.status !== current.status) {
          patch.status = input.status;
          if (input.status === 'published') {
            patch.published_at = at;
            published = true;
          }
        }
        if (Object.keys(patch).length > 0) {
          patch.updated_by = principal.userId;
          patch.updated_at = at;
        }
        let reparented = false;
        if (moving) {
          const tree = await loadTree(project, repos);
          const place = await placement(repos, principal, project, tree, input, current);
          const oldSiblings = tree.childrenOf(current.parent_id).filter(s => s.id !== current.id);
          reparented = place.parentId !== current.parent_id;
          if (reparented) {
            patch.parent_id = place.parentId;
            await repos.articles.setPositions(ctx, renumber(oldSiblings));
          }
          const ordered = [...place.siblings];
          ordered.splice(place.index, 0, current as ArticleTreeRow);
          await repos.articles.setPositions(
            ctx,
            renumber(ordered).filter(p => p.id !== current.id),
          );
          patch.position = ordered.findIndex(r => r.id === current.id);
        }
        if (Object.keys(patch).length > 0) await repos.articles.update(ctx, current.id, patch);
        if (patch.body_md !== undefined) await writeBodyDerived(repos, ctx, current.id, patch.body_md);
        if (editing) await repos.articles.watch(ctx, current.id, [principal.userId], 'auto');
        if (patch.title !== undefined || patch.body_md !== undefined || published) {
          recordArticleTouched(ctx.orgId, current.id, principal.userId, at);
        }
        return { published, reparented };
      });
      const who = { userId: principal.userId, orgId: project.organization.id };
      if (outcome.published) {
        analytics.capture('article_published', { via: viaOf(principal) }, who);
      }
      if (moving) analytics.capture('article_moved', { via: principal.via, reparented: outcome.reparented }, who);
      return fresh(principal, project, article.id);
    },

    async remove(
      principal: Principal,
      key: string,
      slug: string,
      input: DeleteArticleQuery,
      hints: OrgHints = {},
    ): Promise<Article> {
      const { project, article } = await locate(principal, key, slug, hints);
      requireWritable(principal, project, 'article.delete', article);
      const ctx = project.ctx;
      const childCount = await inTransaction(async repos => {
        await repos.articles.lockTree(ctx, project.project.id);
        const tree = await loadTree(project, repos);
        const current = tree.byId.get(article.id);
        if (!current) throw notFound(project.project.key, slug);
        const canRead = (r: ArticleTreeRow) => readable(principal, project, r);
        const children = tree.childrenOf(current.id);
        const seen = children.filter(canRead);
        if (seen.length > 0 && !input.children) {
          throw new AppError('article.children_choice_required', 400, { slug: current.slug }, 'children', [
            'move_up',
            'delete',
          ]);
        }
        const at = now();
        const siblings = tree.childrenOf(current.parent_id);
        const index = siblings.findIndex(s => s.id === current.id);
        if (seen.length > 0 && input.children === 'delete') {
          // Only what the caller can see goes; a draft they cannot see, with what is under it, moves up instead.
          const doomed: ArticleTreeRow[] = [];
          const spared: ArticleTreeRow[] = [];
          const walk = (parentId: number) => {
            for (const child of tree.childrenOf(parentId)) {
              if (canRead(child)) {
                doomed.push(child);
                walk(child.id);
              } else spared.push(child);
            }
          };
          walk(current.id);
          if (doomed.some(r => !can(principal, 'article.delete', ownScope(principal, project, r)))) {
            throw new AppError('article.delete_subtree_forbidden', 403, { slug: current.slug });
          }
          const ordered = [...siblings.slice(0, index), ...spared, ...siblings.slice(index + 1)];
          for (const row of spared) await repos.articles.update(ctx, row.id, { parent_id: current.parent_id });
          await repos.articles.softDelete(ctx, [current.id, ...doomed.map(r => r.id)], at);
          await repos.articles.setPositions(ctx, renumber(ordered));
        } else {
          if (children.length > 0) access.require(principal, 'article.reorder', project.scope);
          const ordered = [...siblings.slice(0, index), ...children, ...siblings.slice(index + 1)];
          for (const child of children) await repos.articles.update(ctx, child.id, { parent_id: current.parent_id });
          await repos.articles.softDelete(ctx, [current.id], at);
          await repos.articles.setPositions(ctx, renumber(ordered));
        }
        return seen.length;
      });
      analytics.capture(
        'article_deleted',
        { via: principal.via, children: childCount === 0 ? 'none' : input.children!, child_count: childCount },
        { userId: principal.userId, orgId: project.organization.id },
      );
      return fresh(principal, project, article.id);
    },

    async restore(principal: Principal, key: string, slug: string, hints: OrgHints = {}): Promise<Article> {
      const project = await locateProject(principal, key, hints);
      const ctx = project.ctx;
      const expired = (r: ArticleRow) =>
        now().getTime() - r.deleted_at!.getTime() >= ARTICLE_RESTORE_WINDOW_DAYS * DAY_MS;
      const row = await articles.findDeletedBySlug(ctx, project.project.id, slug);
      if (!row || !readable(principal, project, row) || expired(row)) {
        const live = await articles.findLiveBySlug(ctx, project.project.id, slug);
        if (live && readable(principal, project, live)) return dto(principal, project, live);
        throw notFound(project.project.key, slug);
      }
      if (!can(principal, 'article.delete', ownScope(principal, project, row))) {
        throw denial(principal, 'article.delete', ownScope(principal, project, row), () =>
          notFound(project.project.key, slug),
        );
      }
      requireWritable(principal, project, 'article.delete', row);
      const restored = await inTransaction(async repos => {
        await repos.articles.lockTree(ctx, project.project.id);
        const group = await repos.articles.deletedTogether(ctx, project.project.id, row.deleted_at!);
        return restoreGroup(repos, principal, project, row, group);
      });
      analytics.capture(
        'article_restored',
        { via: principal.via, restored_count: restored.length },
        { userId: principal.userId, orgId: project.organization.id },
      );
      return fresh(principal, project, row.id);
    },

    async setSignal(
      principal: Principal,
      key: string,
      slug: string,
      signal: 'star' | 'watch',
      on: boolean,
      hints: OrgHints = {},
    ): Promise<Article> {
      const { project, article } = await locate(principal, key, slug, hints);
      access.require(principal, 'article.personal_signal', project.scope);
      const ctx = project.ctx;
      await inTransaction(async repos => {
        if (signal === 'star' && on) {
          await repos.articles.star(ctx, article.id, principal.userId);
          await repos.articles.watch(ctx, article.id, [principal.userId], 'explicit');
        } else if (signal === 'star') {
          await repos.articles.unstar(ctx, article.id, principal.userId);
        } else if (on) {
          await repos.articles.watch(ctx, article.id, [principal.userId], 'explicit');
        } else {
          await repos.articles.unwatch(ctx, article.id, principal.userId);
        }
      });
      return dto(principal, project, article);
    },

    async applyTags(principal: Principal, key: string, slug: string, input: ApplyTags, hints: OrgHints = {}) {
      const { project, article } = await locate(principal, key, slug, hints);
      requireWritable(principal, project, 'article.tag');
      const wanted = wantedTags(input.tags, input.color, 'tags');
      const ctx = project.ctx;
      const counts = await inTransaction(async repos => {
        const current = await repos.articles.lockById(ctx, article.id);
        if (!current || current.deleted_at) throw notFound(project.project.key, slug);
        const { rows, created } = await ensureTags(
          repos,
          { ctx, actorId: principal.userId, onCreate: () => access.require(principal, 'tag.create', project.scope) },
          wanted,
        );
        const applied = await repos.articles.applyTags(
          ctx,
          current.id,
          rows.map(r => r.id),
        );
        if (applied.length > 0) {
          await repos.articles.update(ctx, current.id, { updated_by: principal.userId, updated_at: now() });
        }
        return { applied: applied.length, created };
      });
      analytics.capture(
        'tags_applied',
        { via: principal.via, entity: 'article', ...counts },
        { userId: principal.userId, orgId: project.organization.id },
      );
      return fresh(principal, project, article.id);
    },

    async removeTag(principal: Principal, key: string, slug: string, tag: string, hints: OrgHints = {}) {
      const { project, article } = await locate(principal, key, slug, hints);
      requireWritable(principal, project, 'article.tag');
      const ctx = project.ctx;
      const notTagged = () => new AppError('article.not_tagged', 404, { slug: article.slug, tag }, 'tag');
      const tagSlug = slugify(tag);
      const [row] = tagSlug ? await deps.tags.findBySlugs(ctx, [tagSlug]) : [];
      if (!row) throw notTagged();
      await inTransaction(async repos => {
        if (!(await repos.articles.removeTag(ctx, article.id, row.id))) throw notTagged();
        await repos.articles.update(ctx, article.id, { updated_by: principal.userId, updated_at: now() });
      });
      return fresh(principal, project, article.id);
    },

    /** A tick is an edit of the body. */
    async toggleTask(principal: Principal, key: string, slug: string, task: ToggleTask, hints: OrgHints = {}) {
      const { project, article } = await locate(principal, key, slug, hints);
      requireWritable(principal, project, 'article.update');
      const ctx = project.ctx;
      await inTransaction(async repos => {
        const current = await repos.articles.lockById(ctx, article.id);
        if (!current || current.deleted_at) throw notFound(project.project.key, slug);
        const next = toggleTaskItem(current.body_md, task.index, task.checked);
        if (next === current.body_md) {
          if (toggleTaskItem(current.body_md, task.index, !task.checked) === current.body_md) {
            throw new AppError('article.no_task', 400, { index: task.index }, 'index');
          }
          return;
        }
        await repos.articles.update(ctx, current.id, {
          body_md: next,
          updated_by: principal.userId,
          updated_at: now(),
        });
      });
      return fresh(principal, project, article.id);
    },

    async list(
      principal: Principal,
      input: ArticleListQuery,
      hints: OrgHints = {},
    ): Promise<{ data: ArticleSummary[]; pagination: Pagination }> {
      const sc = await scopeFor(principal, hints, input.project);
      const result = await runSearch(principal, sc, input);
      analytics.capture(
        'articles_searched',
        {
          via: principal.via,
          clause_count: result.clauseCount,
          has_free_text: result.hasFreeText,
          result_count: result.total,
        },
        { userId: principal.userId, orgId: sc.org.organization.id },
      );
      return {
        data: result.data,
        pagination: {
          total: result.total,
          limit: input.limit,
          offset: input.offset,
          next_cursor: null,
          has_more: input.offset + result.data.length < result.total,
        },
      };
    },

    /** The articles whose body mentions an issue's key, among those the caller may open. */
    async referencedBy(principal: Principal, issueKey: string, hints: OrgHints = {}): Promise<ArticleSummary[]> {
      const located = await issues.locate(principal, issueKey, hints);
      const key = issues.keyIn(located.project)(located.issue);
      const sc = await scopeFor(principal, { ...hints, projectKey: located.project.project.key });
      const visible = visibleIn(sc);
      const rows = (await articles.referencing(sc.ctx, key)).filter(visible);
      const byId = new Map(sc.projects.map(p => [p.id, p]));
      return summaries(
        principal,
        sc.ctx,
        rows.map(article => ({
          article,
          project: { key: byId.get(article.project_id)!.key, name: byId.get(article.project_id)!.name },
        })),
        visible,
      );
    },

    /** Issues and articles in two groups; a group whose vocabulary cannot read the query says why instead. */
    async globalSearch(
      principal: Principal,
      input: { q: string; project?: string | undefined; limit: number },
      hints: OrgHints = {},
    ): Promise<GlobalSearchResult> {
      const refused = (err: unknown): AppError => {
        if (!(err instanceof AppError) || err.status !== 400) throw err;
        return err;
      };
      const body = (err: AppError) => ({
        code: err.code,
        message: err.message,
        ...(err.field ? { field: err.field } : {}),
        ...(err.validValues ? { valid_values: err.validValues } : {}),
        ...(err.span ? { span: err.span } : {}),
      });
      const [issueGroup, articleGroup] = await Promise.all([
        (async () => {
          try {
            const sc = await search.context(principal, hints, input.project);
            const result = await search.search(principal, sc, {
              q: input.q,
              limit: input.limit,
              offset: 0,
              record: false,
            });
            const projectsById = new Map(sc.projects.map(p => [p.id, p]));
            const rows = result.entries.map(e => e.row);
            const refs = await issues.refsOf(principal, sc.ctx, rows, projectsById);
            return {
              items: refs.map((ref, i) => {
                const project = projectsById.get(rows[i]!.project_id)!;
                return { ...ref, project: { key: project.key, name: project.name } };
              }),
              total: result.total,
              failed: null,
            };
          } catch (err) {
            return { items: [], total: 0, failed: refused(err) };
          }
        })(),
        (async () => {
          try {
            const sc = await scopeFor(principal, hints, input.project);
            const result = await runSearch(principal, sc, { q: input.q, limit: input.limit, offset: 0 });
            return { items: result.data, total: result.total, failed: null };
          } catch (err) {
            return { items: [], total: 0, failed: refused(err) };
          }
        })(),
      ]);
      if (issueGroup.failed && articleGroup.failed) throw issueGroup.failed;
      const org = await access.current(principal, hints);
      analytics.capture(
        'global_searched',
        { via: principal.via, issue_count: issueGroup.total, article_count: articleGroup.total },
        { userId: principal.userId, orgId: org.organization.id },
      );
      const group = <T>(g: { items: T[]; total: number; failed: AppError | null }) => ({
        items: g.items,
        total: g.total,
        error: g.failed ? body(g.failed) : null,
      });
      return { issues: group(issueGroup), articles: group(articleGroup) };
    },

    async suggest(principal: Principal, text: string, caret: number, hints: OrgHints = {}): Promise<Suggestion[]> {
      const sc = await scopeFor(principal, hints);
      const provider = {
        async values(attribute: { name: string; type: string }, prefix: string) {
          const needle = prefix.toLowerCase();
          const values =
            attribute.name === 'status'
              ? Object.values(STATUS_NAMES).filter(n => n.toLowerCase().startsWith(needle))
              : await articleSearch.suggestValues(
                  sc.ctx,
                  sc.search,
                  attribute.type === 'user' ? 'user' : attribute.name,
                  prefix,
                  SUGGEST_VALUES_MAX,
                );
          return values.map(value => ({ value }));
        },
        savedSearches: async () => [],
        recentSearches: async () => [],
      };
      const suggestions = await suggest(text, caret, registry, provider, {
        today: sc.search.today,
        weekStartsOn: sc.search.weekStartsOn,
      });
      return suggestions.map(s => ({
        kind: s.kind,
        label: s.label,
        insert: s.insert,
        replace: s.replace,
        description: s.description ? t(s.description.key, s.description.params) : null,
      }));
    },

    /** The nightly purge's knowledge base half, run by issues.purge. */
    async purgeExpired(): Promise<number> {
      const cutoff = new Date(now().getTime() - ARTICLE_RESTORE_WINDOW_DAYS * DAY_MS);
      const orgIds = await articles.orgsWithDeletedBefore(
        systemContext('the nightly purge has no actor and spans every organisation'),
        cutoff,
      );
      return purgeDeleted(
        { inTransaction, stores: deps.stores, analytics, storageLimit: access.storageLimit, now },
        orgIds,
        {
          claim: (repos, ctx, limit) => repos.articles.idsDeletedBefore(ctx, cutoff, limit),
          files: (repos, ctx, ids) => repos.attachments.onArticlesDeletedBefore(ctx, cutoff, ids),
          purge: (repos, ctx, ids) => repos.articles.purgeDeletedBefore(ctx, cutoff, ids),
          holder: file => file.article_id,
        },
      );
    },
  };
}

export type ArticlesService = ReturnType<typeof articlesService>;

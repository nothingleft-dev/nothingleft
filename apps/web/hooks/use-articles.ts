'use client';

import { useCallback, useMemo } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { toggleTaskItem } from '@nothingleft/markdown';
import type {
  Article,
  ArticleChildrenOnDelete,
  ArticleNode,
  CreateArticle,
  Me,
  TagRef,
  UpdateArticle,
} from '@nothingleft/types';
import {
  applyArticleTags,
  createArticle,
  deleteArticle,
  getArticle,
  listArticleAttachments,
  listArticleTree,
  listDeletedArticles,
  listReferencingArticles,
  removeArticleTag,
  restoreArticle,
  searchArticles,
  searchEverything,
  setArticleSignal,
  toggleArticleTask,
  updateArticle,
  type ArticleSearchQuery,
  type ArticleSignal,
} from '@lib/api/articles';
import { isApiError } from '@lib/api/errors';
import { applyDrop, dropBody, type DropTarget } from '@lib/articles/tree';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';
import { useSession } from '@hooks/use-session';
import { useUpdatePreferences } from '@hooks/use-me';

export const ARTICLE_PAGE_SIZE = 50;

const retryUnlessQueryError = (count: number, error: unknown) =>
  count < 1 && !(isApiError(error) && error.status === 400);

export function useArticleTree(project: string) {
  return useQuery({
    queryKey: queryKeys.articleTree(project),
    queryFn: () => listArticleTree(project).then(r => r.data),
    refetchInterval: POLL.list,
  });
}

export function useDeletedArticles(project: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.deletedArticles(project),
    queryFn: () => listDeletedArticles(project).then(r => r.data),
    refetchInterval: POLL.list,
    enabled,
  });
}

export function useArticle(project: string, slug: string | null) {
  return useQuery({
    queryKey: queryKeys.article(project, slug ?? ''),
    queryFn: () => getArticle(project, slug!).then(r => r.data),
    refetchInterval: POLL.list,
    enabled: slug !== null,
    retry: (count, error) => count < 1 && !(isApiError(error) && error.isNotFound),
  });
}

export function useArticleAttachments(project: string, slug: string) {
  return useQuery({
    queryKey: queryKeys.articleAttachments(project, slug),
    queryFn: () => listArticleAttachments(project, slug).then(r => r.data),
    refetchInterval: POLL.list,
  });
}

/** Refreshes everything a knowledge base write can move: the tree, searches, tag counts. */
export function invalidateArticles(client: QueryClient, project: string) {
  void client.invalidateQueries({ queryKey: queryKeys.articles(project) });
  void client.invalidateQueries({ queryKey: queryKeys.articleSearches() });
  void client.invalidateQueries({ queryKey: ['search', 'global'] });
}

export function useCreateArticle(project: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreateArticle; idempotencyKey?: string }) =>
      createArticle(project, body, idempotencyKey).then(r => r.data),
    onSuccess: article => client.setQueryData(queryKeys.article(project, article.slug), article),
    onSettled: () => invalidateArticles(client, project),
  });
}

interface ArticleUpdate {
  body: UpdateArticle;
  optimistic?: (article: Article) => Article;
}

export function useUpdateArticle(project: string, slug: string) {
  const client = useQueryClient();
  const key = queryKeys.article(project, slug);
  return useMutation({
    mutationFn: ({ body }: ArticleUpdate) => updateArticle(project, slug, body).then(r => r.data),
    onMutate: async ({ body, optimistic }) => {
      await client.cancelQueries({ queryKey: key, exact: true });
      const previous = client.getQueryData<Article>(key);
      if (previous && optimistic) client.setQueryData(key, optimistic(previous));
      // The rail shows the title and the draft mark too; draw them there at the same moment.
      await client.cancelQueries({ queryKey: queryKeys.articleTree(project) });
      const tree = client.getQueryData<ArticleNode[]>(queryKeys.articleTree(project));
      if (tree && (body.title !== undefined || body.status !== undefined)) {
        client.setQueryData<ArticleNode[]>(
          queryKeys.articleTree(project),
          tree.map(n =>
            n.slug === slug ? { ...n, title: body.title ?? n.title, status: body.status ?? n.status } : n,
          ),
        );
      }
      return { previous, tree };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
      if (context?.tree) client.setQueryData(queryKeys.articleTree(project), context.tree);
    },
    onSuccess: article => client.setQueryData(queryKeys.article(project, article.slug), article),
    onSettled: (_data, _error, { body }) => {
      invalidateArticles(client, project);
      if (body.body_md !== undefined) {
        void client.invalidateQueries({ queryKey: queryKeys.articleAttachments(project, slug) });
        void client.invalidateQueries({ queryKey: ['issues'], predicate: q => q.queryKey[2] === 'articles' });
      }
    },
  });
}

/** A drag in the tree: drawn at once, put back if the API refuses it. */
export function useMoveArticle(project: string) {
  const client = useQueryClient();
  const key = queryKeys.articleTree(project);
  return useMutation({
    mutationFn: ({ slug, target, nodes }: { slug: string; target: DropTarget; nodes: readonly ArticleNode[] }) =>
      updateArticle(project, slug, dropBody(nodes, target)).then(r => r.data),
    onMutate: async ({ slug, target }) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ArticleNode[]>(key);
      if (previous) client.setQueryData(key, applyDrop(previous, slug, target));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSettled: () => invalidateArticles(client, project),
  });
}

export function useDeleteArticle(project: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, children }: { slug: string; children?: ArticleChildrenOnDelete }) =>
      deleteArticle(project, slug, children).then(r => r.data),
    onSettled: () => invalidateArticles(client, project),
  });
}

export function useRestoreArticle(project: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => restoreArticle(project, slug).then(r => r.data),
    onMutate: async slug => {
      const key = queryKeys.deletedArticles(project);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ArticleNode[]>(key);
      client.setQueryData<ArticleNode[]>(key, rows => rows?.filter(n => n.slug !== slug));
      return { previous };
    },
    onError: (_error, _slug, context) => {
      if (context?.previous) client.setQueryData(queryKeys.deletedArticles(project), context.previous);
    },
    onSettled: () => invalidateArticles(client, project),
  });
}

const SIGNAL_FIELD = { star: 'starred', watch: 'watching' } as const;

export function useArticleSignal(project: string, slug: string) {
  const client = useQueryClient();
  const key = queryKeys.article(project, slug);
  return useMutation({
    mutationFn: ({ signal, on }: { signal: ArticleSignal; on: boolean }) =>
      setArticleSignal(project, slug, signal, on).then(r => r.data),
    onMutate: async ({ signal, on }) => {
      await client.cancelQueries({ queryKey: key, exact: true });
      const previous = client.getQueryData<Article>(key);
      if (previous) {
        const me = { ...previous.me, [SIGNAL_FIELD[signal]]: on };
        if (signal === 'star' && on) me.watching = true;
        client.setQueryData<Article>(key, { ...previous, me });
      }
      if (signal === 'star') {
        client.setQueryData<ArticleNode[]>(queryKeys.articleTree(project), rows =>
          rows?.map(n => (n.slug === slug ? { ...n, starred: on } : n)),
        );
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: article => client.setQueryData(key, article),
    onSettled: () => invalidateArticles(client, project),
  });
}

/** Applied by the name as typed, removed by slug; only a removal is drawn early. */
export function useArticleTag(project: string, slug: string) {
  const client = useQueryClient();
  const key = queryKeys.article(project, slug);
  return useMutation({
    mutationFn: ({ tag, on, color }: { tag: string; on: boolean; color?: TagRef['color'] | undefined }) =>
      (on
        ? applyArticleTags(project, slug, { tags: [color ? { name: tag, color } : tag] })
        : removeArticleTag(project, slug, tag)
      ).then(r => r.data),
    onMutate: async ({ tag, on }) => {
      await client.cancelQueries({ queryKey: key, exact: true });
      const previous = client.getQueryData<Article>(key);
      if (previous && !on)
        client.setQueryData<Article>(key, { ...previous, tags: previous.tags.filter(t => t.slug !== tag) });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: article => client.setQueryData(key, article),
    onSettled: () => {
      invalidateArticles(client, project);
      void client.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export function useToggleArticleTask(project: string, slug: string) {
  const client = useQueryClient();
  const key = queryKeys.article(project, slug);
  return useMutation({
    mutationFn: ({ index, checked }: { index: number; checked: boolean }) =>
      toggleArticleTask(project, slug, { index, checked }).then(r => r.data),
    onMutate: async ({ index, checked }) => {
      await client.cancelQueries({ queryKey: key, exact: true });
      const previous = client.getQueryData<Article>(key);
      if (previous) {
        client.setQueryData<Article>(key, { ...previous, body_md: toggleTaskItem(previous.body_md, index, checked) });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: article => client.setQueryData(key, article),
  });
}

type ArticlePage = Awaited<ReturnType<typeof searchArticles>>;

export function useArticleSearch(query: Omit<ArticleSearchQuery, 'offset' | 'limit'>, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.articleSearch(query),
    refetchInterval: POLL.list,
    queryFn: ({ pageParam, signal }) =>
      searchArticles({ ...query, limit: ARTICLE_PAGE_SIZE, offset: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (last: ArticlePage, pages) =>
      last.meta.pagination?.has_more ? pages.length * ARTICLE_PAGE_SIZE : undefined,
    enabled,
    retry: retryUnlessQueryError,
    placeholderData: keepPreviousData,
  });
}

export function useReferencingArticles(issueKey: string) {
  return useQuery({
    queryKey: queryKeys.referencingArticles(issueKey),
    queryFn: () => listReferencingArticles(issueKey).then(r => r.data),
    refetchInterval: POLL.list,
  });
}

export function useGlobalSearch(q: string) {
  return useQuery({
    queryKey: queryKeys.globalSearch(q),
    queryFn: ({ signal }) => searchEverything(q, signal).then(r => r.data),
    enabled: q.trim() !== '',
    retry: retryUnlessQueryError,
    staleTime: 15_000,
    placeholderData: previous => previous,
  });
}

const COLLAPSED_KEY = 'kb_collapsed';

/** Which articles a person has folded in one project's tree, kept in their preferences so it follows them. */
export function useCollapsedArticles(project: string) {
  const session = useSession();
  const update = useUpdatePreferences();
  const client = useQueryClient();
  const stored = session.status === 'signed-in' ? session.user.preferences.ui[COLLAPSED_KEY] : undefined;
  const byProject = useMemo(() => (stored ?? {}) as Record<string, string[]>, [stored]);
  const list = byProject[project];
  const collapsed = useMemo(() => new Set(list ?? []), [list]);

  const toggle = useCallback(
    (slug: string, fold: boolean) => {
      const next = new Set(collapsed);
      if (fold) next.add(slug);
      else next.delete(slug);
      const value = { ...byProject, [project]: [...next] };
      if (next.size === 0) delete value[project];
      // Drawn at once through the cached Me; the server's answer replaces it.
      client.setQueryData(queryKeys.me(), (me: Me | undefined) =>
        me ? { ...me, preferences: { ...me.preferences, ui: { ...me.preferences.ui, [COLLAPSED_KEY]: value } } } : me,
      );
      update.mutate({ ui: { [COLLAPSED_KEY]: value } });
    },
    [byProject, client, collapsed, project, update],
  );

  return { collapsed, toggle };
}

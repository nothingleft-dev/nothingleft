'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { LabelColor, Tag, TagContext } from '@nothingleft/types';
import { deleteTag, listManagedTags, listTags, listTagsInUse, mergeTags, updateTag } from '@lib/api/tags';
import { optimisticList } from '@lib/query/optimistic';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useTags(q: string, enabled = true, context?: TagContext) {
  return useQuery({
    queryKey: queryKeys.tags(q, context),
    queryFn: () => listTags(q, context).then(r => r.data),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** The knowledge base's tag cloud: tags on the project's articles, with counts. */
export function useArticleTagCloud(project: string) {
  return useQuery({
    queryKey: queryKeys.articleTagCloud(project),
    queryFn: () => listTagsInUse(project).then(r => r.data),
    refetchInterval: POLL.list,
  });
}

export const MANAGED_TAGS_PAGE = 200;

export interface ManagedTags {
  tags: Tag[];
  total: number;
}

export function useManagedTags(q: string) {
  return useQuery({
    queryKey: queryKeys.managedTags(q),
    queryFn: async (): Promise<ManagedTags> => {
      const { data, meta } = await listManagedTags(q, 0, MANAGED_TAGS_PAGE);
      return { tags: data, total: meta.pagination?.total ?? data.length };
    },
    refetchInterval: POLL.admin,
    placeholderData: keepPreviousData,
  });
}

const MANAGED = ['tags', 'manage'] as const;

// A tag's name and colour show on issues, articles, pickers and saved views, so every write refreshes them all.
function refreshTagged(client: QueryClient) {
  for (const queryKey of [['tags'], ['issues'], ['articles'], ['article-search'], queryKeys.savedViews()]) {
    void client.invalidateQueries({ queryKey });
  }
}

const without = (data: ManagedTags, slugs: readonly string[]): ManagedTags => {
  const tags = data.tags.filter(t => !slugs.includes(t.slug));
  return { tags, total: data.total - (data.tags.length - tags.length) };
};

export interface TagChange {
  tag: Tag;
  name?: string;
  color?: LabelColor;
}

/** The new name is drawn at once; its address is the server's, so the slug waits for the answer. */
export function useUpdateTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ tag, name, color }: TagChange) => updateTag(tag.slug, { name, color }).then(r => r.data),
    ...optimisticList<ManagedTags, TagChange>(client, MANAGED, (data, { tag, name, color }) => ({
      ...data,
      tags: data.tags.map(t => (t.slug === tag.slug ? { ...t, name: name ?? t.name, color: color ?? t.color } : t)),
    })),
    onSettled: () => refreshTagged(client),
  });
}

export function useMergeTags() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ tags, into }: { tags: Tag[]; into: Tag }) =>
      mergeTags({ tags: tags.map(t => t.slug), into: into.slug }).then(r => r.data),
    ...optimisticList<ManagedTags, { tags: Tag[]; into: Tag }>(client, MANAGED, (data, { tags }) =>
      without(
        data,
        tags.map(t => t.slug),
      ),
    ),
    onSettled: () => refreshTagged(client),
  });
}

export function useDeleteTag() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (tag: Tag) => deleteTag(tag.slug).then(r => r.data),
    ...optimisticList<ManagedTags, Tag>(client, MANAGED, (data, tag) => without(data, [tag.slug])),
    onSettled: () => refreshTagged(client),
  });
}

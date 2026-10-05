'use client';

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toggleTaskItem } from '@nothingleft/markdown';
import type { ApplyTags, CreateIssue, Issue, IssueActivityKind, LabelColor, UpdateIssue } from '@nothingleft/types';
import {
  createIssue,
  deleteIssue,
  getIssue,
  getIssueRefs,
  listIssueActivity,
  listIssueWatchers,
  listIssues,
  restoreIssue,
  searchIssueRefs,
  setIssueSignal,
  toggleIssueTask,
  updateIssue,
  type IssueSignal,
} from '@lib/api/issues';
import { applyTags, removeTag } from '@lib/api/tags';
import { invalidateAgile } from '@lib/query/agile';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export const DELETED_PAGE_SIZE = 50;

export function useIssue(key: string) {
  return useQuery({
    queryKey: queryKeys.issue(key),
    refetchInterval: POLL.list,
    queryFn: () => getIssue(key).then(r => r.data),
    retry: false,
  });
}

/** One batch for every key a piece of markdown cites; keys the caller cannot open are simply absent. */
export function useIssueRefs(keys: readonly string[]) {
  const sorted = [...new Set(keys)].sort();
  return useQuery({
    queryKey: queryKeys.issueRefs(sorted),
    queryFn: () => getIssueRefs(sorted).then(r => r.data),
    enabled: sorted.length > 0,
    staleTime: 60_000,
  });
}

export function useIssueRefSearch(q: string, project: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.issueRefSearch(q, project),
    queryFn: () => searchIssueRefs(q, project ?? undefined).then(r => r.data),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useIssueWatchers(key: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.issueWatchers(key),
    refetchInterval: POLL.list,
    queryFn: () => listIssueWatchers(key).then(r => r.data),
    enabled,
  });
}

export function useIssueActivity(key: string, filter: string, kinds?: readonly IssueActivityKind[]) {
  return useInfiniteQuery({
    queryKey: queryKeys.issueActivityOf(key, filter),
    refetchInterval: POLL.list,
    queryFn: ({ pageParam }) => listIssueActivity(key, pageParam, kinds),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.meta.pagination?.next_cursor ?? undefined,
  });
}

export interface IssueUpdate {
  body: UpdateIssue;
  /** What the page should show before the server answers. */
  optimistic?: (issue: Issue) => Issue;
}

const issueWriteKey = (key: string) => ['issues', key, 'write'] as const;

// Writes to one issue overlap (a picker, then another); an older response must not
// overwrite a newer optimistic value, so only the last one standing touches the cache.
function useLastWriteWins(key: string) {
  const client = useQueryClient();
  const alone = () => client.isMutating({ mutationKey: issueWriteKey(key) }) <= 1;
  return {
    mutationKey: issueWriteKey(key),
    onSuccess: (issue: Issue) => {
      if (alone()) client.setQueryData(queryKeys.issue(key), issue);
    },
    settle: () => {
      if (alone()) void client.invalidateQueries({ queryKey: queryKeys.issue(key), exact: true });
    },
  };
}

export function useUpdateIssue(key: string) {
  const client = useQueryClient();
  const lastWrite = useLastWriteWins(key);
  return useMutation({
    mutationKey: lastWrite.mutationKey,
    mutationFn: ({ body }: IssueUpdate) => updateIssue(key, body).then(r => r.data),
    onMutate: async ({ optimistic }) => {
      await client.cancelQueries({ queryKey: queryKeys.issue(key), exact: true });
      const previous = client.getQueryData<Issue>(queryKeys.issue(key));
      if (previous && optimistic) client.setQueryData(queryKeys.issue(key), optimistic(previous));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.issue(key), context.previous);
    },
    onSuccess: lastWrite.onSuccess,
    onSettled: (_data, _error, { body }, context) => {
      lastWrite.settle();
      void client.invalidateQueries({ queryKey: queryKeys.issueActivity(key) });
      invalidateAgile(client);
      // `inline` is computed against the saved description.
      if (body.description_md !== undefined)
        void client.invalidateQueries({ queryKey: queryKeys.issueAttachments(key) });
      // A new parent is a link on this issue and on both parents, old and new.
      if (body.parent !== undefined) {
        for (const k of [key, body.parent, context?.previous?.parent]) {
          if (!k) continue;
          void client.invalidateQueries({ queryKey: queryKeys.issueLinks(k) });
          if (k !== key) void client.invalidateQueries({ queryKey: queryKeys.issueActivity(k) });
        }
      }
    },
  });
}

export function useToggleIssueTask(key: string) {
  const client = useQueryClient();
  const lastWrite = useLastWriteWins(key);
  return useMutation({
    mutationKey: lastWrite.mutationKey,
    mutationFn: ({ index, checked }: { index: number; checked: boolean }) =>
      toggleIssueTask(key, { index, checked }).then(r => r.data),
    onMutate: async ({ index, checked }) => {
      await client.cancelQueries({ queryKey: queryKeys.issue(key), exact: true });
      const previous = client.getQueryData<Issue>(queryKeys.issue(key));
      if (previous?.description_md) {
        const description_md = toggleTaskItem(previous.description_md, index, checked);
        client.setQueryData<Issue>(queryKeys.issue(key), { ...previous, description_md });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.issue(key), context.previous);
    },
    onSuccess: lastWrite.onSuccess,
    onSettled: () => {
      lastWrite.settle();
      void client.invalidateQueries({ queryKey: queryKeys.issueActivity(key) });
    },
  });
}

export interface TagChange {
  /** A name or slug to apply, or the slug of an applied tag to remove. */
  tag: string;
  on: boolean;
  /** Only for a tag nobody has used yet; an existing tag keeps its own. */
  color?: LabelColor;
}

export function useIssueTag(key: string) {
  const client = useQueryClient();
  const lastWrite = useLastWriteWins(key);
  return useMutation({
    mutationKey: lastWrite.mutationKey,
    mutationFn: ({ tag, on, color }: TagChange) => {
      const body: ApplyTags = { tags: [color ? { name: tag, color } : tag] };
      return (on ? applyTags(key, body) : removeTag(key, tag)).then(r => r.data);
    },
    onMutate: async ({ tag, on }) => {
      await client.cancelQueries({ queryKey: queryKeys.issue(key), exact: true });
      const previous = client.getQueryData<Issue>(queryKeys.issue(key));
      // An added tag's name, slug and colour are the server's to decide, so only removal is drawn early.
      if (previous && !on) {
        client.setQueryData<Issue>(queryKeys.issue(key), {
          ...previous,
          tags: previous.tags.filter(t => t.slug !== tag),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.issue(key), context.previous);
    },
    onSuccess: lastWrite.onSuccess,
    onSettled: (_data, _error, { on }) => {
      lastWrite.settle();
      void client.invalidateQueries({ queryKey: queryKeys.issueActivity(key) });
      if (on) void client.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

const SIGNAL_FIELD = { star: 'starred', vote: 'voted', watch: 'watching' } as const;

export function useIssueSignal(key: string) {
  const client = useQueryClient();
  const lastWrite = useLastWriteWins(key);
  return useMutation({
    mutationKey: lastWrite.mutationKey,
    mutationFn: ({ signal, on }: { signal: IssueSignal; on: boolean }) =>
      setIssueSignal(key, signal, on).then(r => r.data),
    onMutate: async ({ signal, on }) => {
      await client.cancelQueries({ queryKey: queryKeys.issue(key), exact: true });
      const previous = client.getQueryData<Issue>(queryKeys.issue(key));
      if (previous) {
        const me = { ...previous.me, [SIGNAL_FIELD[signal]]: on };
        if (signal === 'star' && on) me.watching = true;
        const voteDelta = signal === 'vote' && on !== previous.me.voted ? (on ? 1 : -1) : 0;
        client.setQueryData<Issue>(queryKeys.issue(key), {
          ...previous,
          me,
          vote_count: previous.vote_count + voteDelta,
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(queryKeys.issue(key), context.previous);
    },
    onSuccess: lastWrite.onSuccess,
    onSettled: () => {
      lastWrite.settle();
      void client.invalidateQueries({ queryKey: queryKeys.issueWatchers(key) });
    },
  });
}

export function useCreateIssue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ body, idempotencyKey }: { body: CreateIssue; idempotencyKey: string }) =>
      createIssue(body, idempotencyKey).then(r => r.data),
    onSuccess: (issue, { body }) => {
      client.setQueryData(queryKeys.issue(issue.key), issue);
      // The first issue freezes the project key.
      void client.invalidateQueries({ queryKey: queryKeys.project(issue.project.key) });
      const linked = [issue.parent, ...(body.links ?? []).flatMap(l => l.issues)];
      for (const key of linked) {
        if (!key) continue;
        void client.invalidateQueries({ queryKey: queryKeys.issueLinks(key) });
        void client.invalidateQueries({ queryKey: queryKeys.issueActivity(key) });
      }
      if (body.tags?.length) void client.invalidateQueries({ queryKey: ['tags'] });
      invalidateAgile(client);
    },
  });
}

export function useDeleteIssue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => deleteIssue(key).then(r => r.data),
    onSuccess: issue => {
      client.removeQueries({ queryKey: queryKeys.issue(issue.key) });
      void client.invalidateQueries({ queryKey: ['projects', issue.project.key, 'deleted-issues'] });
    },
  });
}

export function useRestoreIssue() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => restoreIssue(key).then(r => r.data),
    onSuccess: issue => {
      client.setQueryData(queryKeys.issue(issue.key), issue);
      void client.invalidateQueries({ queryKey: queryKeys.issueActivity(issue.key) });
      void client.invalidateQueries({ queryKey: ['projects', issue.project.key, 'deleted-issues'] });
    },
  });
}

export function useDeletedIssues(projectKey: string, offset: number) {
  return useQuery({
    queryKey: queryKeys.deletedIssues(projectKey, offset),
    refetchInterval: POLL.admin,
    queryFn: () => listIssues({ project: projectKey, deleted: true, limit: DELETED_PAGE_SIZE, offset }),
    placeholderData: previous => previous,
  });
}

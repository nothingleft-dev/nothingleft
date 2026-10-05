'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSavedView, SavedView, UpdateSavedView } from '@nothingleft/types';
import { createSavedView, deleteSavedView, listSavedViews, updateSavedView } from '@lib/api/saved-views';
import { optimisticList } from '@lib/query/optimistic';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useSavedViews(enabled = true) {
  return useQuery({
    queryKey: queryKeys.savedViews(),
    refetchInterval: POLL.list,
    queryFn: () => listSavedViews().then(r => r.data),
    enabled,
    staleTime: 60_000,
  });
}

function useSavedViewMutation<TInput>(
  fn: (input: TInput) => Promise<SavedView>,
  draw?: (views: SavedView[], input: TInput) => SavedView[],
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    ...(draw ? optimisticList(client, queryKeys.savedViews(), draw) : {}),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: queryKeys.savedViews() });
      // A view's query may be referenced as #{Name} by any list on screen.
      void client.invalidateQueries({ queryKey: queryKeys.issueSearches() });
      void client.invalidateQueries({ queryKey: queryKeys.issueCounts() });
    },
  });
}

export const useCreateSavedView = () =>
  useSavedViewMutation((body: CreateSavedView) => createSavedView(body).then(r => r.data));

// Only what the client can know is drawn early: a new name or visibility, or the view gone.
export const useUpdateSavedView = () =>
  useSavedViewMutation(
    ({ name, body }: { name: string; body: UpdateSavedView }) => updateSavedView(name, body).then(r => r.data),
    (views, { name, body }) =>
      views.map(v =>
        v.name === name
          ? {
              ...v,
              ...(body.name ? { name: body.name } : {}),
              ...(body.visibility ? { visibility: body.visibility } : {}),
            }
          : v,
      ),
  );

export const useDeleteSavedView = () =>
  useSavedViewMutation(
    (name: string) => deleteSavedView(name).then(r => r.data),
    (views, name) => views.filter(v => v.name !== name),
  );

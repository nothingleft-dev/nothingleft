'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateSprint, FinishSprint, Sprint, StartSprint, UpdateSprint } from '@nothingleft/types';
import {
  createSprint,
  deleteSprint,
  finishSprint,
  listSprints,
  listSprintsAcross,
  startSprint,
  updateSprint,
} from '@lib/api/sprints';
import { invalidateAgile } from '@lib/query/agile';
import { optimisticList } from '@lib/query/optimistic';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

const ACTIVE = ['active'] as const;

/** Every sprint of a project, by start date with the unscheduled last. */
export function useSprints(projectKey: string | null) {
  return useQuery({
    queryKey: queryKeys.projectSprints(projectKey ?? ''),
    refetchInterval: POLL.list,
    queryFn: () => listSprints(projectKey!).then(r => r.data),
    enabled: projectKey !== null,
  });
}

/** Active sprints across every readable project: the dashboard rail and the project cards. */
export function useActiveSprints(enabled = true) {
  return useQuery({
    queryKey: queryKeys.sprintsAcross(ACTIVE),
    refetchInterval: POLL.figures,
    queryFn: () => listSprintsAcross(ACTIVE).then(r => r.data),
    enabled,
  });
}

export function useCreateSprint(projectKey: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSprint) => createSprint(projectKey, body).then(r => r.data),
    onSettled: () => invalidateAgile(client),
  });
}

export function useUpdateSprint(projectKey: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sprint, body }: { sprint: string; body: UpdateSprint }) =>
      updateSprint(projectKey, sprint, body).then(r => r.data),
    ...optimisticList<Sprint[], { sprint: string; body: UpdateSprint }>(
      client,
      queryKeys.projectSprints(projectKey),
      (list, { sprint, body }) =>
        list.map(s =>
          s.slug === sprint
            ? {
                ...s,
                ...(body.name !== undefined ? { name: body.name } : {}),
                ...(body.goal_md !== undefined ? { goal_md: body.goal_md } : {}),
                ...(body.start_date !== undefined ? { start_date: body.start_date } : {}),
                ...(body.end_date !== undefined ? { end_date: body.end_date } : {}),
              }
            : s,
        ),
    ),
    onSettled: () => invalidateAgile(client),
  });
}

export function useDeleteSprint(projectKey: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sprint: string) => deleteSprint(projectKey, sprint).then(r => r.data),
    ...optimisticList<Sprint[], string>(client, queryKeys.projectSprints(projectKey), (list, sprint) =>
      list.filter(s => s.slug !== sprint),
    ),
    onSettled: () => invalidateAgile(client),
  });
}

export function useStartSprint(projectKey: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sprint, body }: { sprint: string; body: StartSprint }) =>
      startSprint(projectKey, sprint, body).then(r => r.data),
    onSettled: () => invalidateAgile(client),
  });
}

export function useFinishSprint(projectKey: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sprint, body }: { sprint: string; body: FinishSprint }) =>
      finishSprint(projectKey, sprint, body).then(r => r.data),
    onSettled: () => {
      invalidateAgile(client);
      void client.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}

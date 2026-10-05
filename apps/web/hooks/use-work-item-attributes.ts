'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateWorkItemAttribute,
  CreateWorkItemAttributeValue,
  UpdateWorkItemAttribute,
  UpdateWorkItemAttributeValue,
  WorkItemAttribute,
} from '@nothingleft/types';
import {
  createWorkItemAttribute,
  createWorkItemAttributeValue,
  deleteWorkItemAttribute,
  deleteWorkItemAttributeValue,
  listWorkItemAttributes,
  updateWorkItemAttribute,
  updateWorkItemAttributeValue,
} from '@lib/api/work-item-attributes';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useWorkItemAttributes(projectKey: string | null) {
  return useQuery({
    queryKey: queryKeys.workItemAttributes(projectKey ?? ''),
    refetchInterval: POLL.admin,
    queryFn: () => listWorkItemAttributes(projectKey as string).then(r => r.data),
    enabled: projectKey !== null,
    staleTime: 60_000,
  });
}

const replace = (rows: WorkItemAttribute[], name: string, next: WorkItemAttribute) =>
  rows.map(r => (r.name === name ? next : r));

function moveTo<T extends { position: number }>(rows: T[], moving: T | undefined, position: number): T[] {
  if (!moving) return rows;
  const rest = rows.toSorted((a, b) => a.position - b.position).filter(r => r !== moving);
  rest.splice(position, 0, moving);
  return rest.map((r, i) => ({ ...r, position: i }));
}

function useAttributeMutation<TInput>(
  projectKey: string,
  fn: (input: TInput) => Promise<WorkItemAttribute>,
  optimistic?: (rows: WorkItemAttribute[], input: TInput) => WorkItemAttribute[],
  confirmed?: (rows: WorkItemAttribute[], input: TInput, result: WorkItemAttribute) => WorkItemAttribute[],
) {
  const client = useQueryClient();
  const key = queryKeys.workItemAttributes(projectKey);
  return useMutation({
    mutationFn: fn,
    onMutate: async (input: TInput) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<WorkItemAttribute[]>(key);
      if (previous && optimistic) client.setQueryData(key, optimistic(previous, input));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: (result, input) => {
      const rows = client.getQueryData<WorkItemAttribute[]>(key);
      if (rows && confirmed) client.setQueryData(key, confirmed(rows, input, result));
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key });
      // Renames and deletions change what every time entry shows.
      void client.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}

export const useCreateWorkItemAttribute = (projectKey: string) =>
  useAttributeMutation(
    projectKey,
    (body: CreateWorkItemAttribute) => createWorkItemAttribute(projectKey, body).then(r => r.data),
    undefined,
    (rows, _input, created) => [...rows, created],
  );

export const useUpdateWorkItemAttribute = (projectKey: string) =>
  useAttributeMutation(
    projectKey,
    ({ name, body }: { name: string; body: UpdateWorkItemAttribute }) =>
      updateWorkItemAttribute(projectKey, name, body).then(r => r.data),
    (rows, { name, body }) => {
      const merged = rows.map(r => (r.name === name ? { ...r, ...body } : r));
      return body.position === undefined
        ? merged
        : moveTo(
            merged,
            merged.find(r => r.name === (body.name ?? name)),
            body.position,
          );
    },
    (rows, { name }, result) => replace(rows, name, result),
  );

export const useDeleteWorkItemAttribute = (projectKey: string) =>
  useAttributeMutation(
    projectKey,
    (name: string) => deleteWorkItemAttribute(projectKey, name).then(r => r.data),
    (rows, name) => rows.filter(r => r.name !== name),
  );

export const useCreateWorkItemAttributeValue = (projectKey: string) =>
  useAttributeMutation(
    projectKey,
    ({ name, body }: { name: string; body: CreateWorkItemAttributeValue }) =>
      createWorkItemAttributeValue(projectKey, name, body).then(r => r.data),
    undefined,
    (rows, { name }, result) => replace(rows, name, result),
  );

export const useUpdateWorkItemAttributeValue = (projectKey: string) =>
  useAttributeMutation(
    projectKey,
    ({ name, value, body }: { name: string; value: string; body: UpdateWorkItemAttributeValue }) =>
      updateWorkItemAttributeValue(projectKey, name, value, body).then(r => r.data),
    (rows, { name, value, body }) =>
      rows.map(r => {
        if (r.name !== name) return r;
        const values = r.values.map(v => (v.name === value ? { ...v, ...body } : v));
        return {
          ...r,
          values:
            body.position === undefined
              ? values
              : moveTo(
                  values,
                  values.find(v => v.name === (body.name ?? value)),
                  body.position,
                ),
        };
      }),
    (rows, { name }, result) => replace(rows, name, result),
  );

export const useDeleteWorkItemAttributeValue = (projectKey: string) =>
  useAttributeMutation(
    projectKey,
    ({ name, value, moveTo: target }: { name: string; value: string; moveTo?: string }) =>
      deleteWorkItemAttributeValue(projectKey, name, value, target).then(r => r.data),
    undefined,
    (rows, { name }, result) => replace(rows, name, result),
  );

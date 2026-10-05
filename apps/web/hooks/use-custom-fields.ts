'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateCustomField,
  CreateCustomFieldOption,
  CustomField,
  UpdateCustomField,
  UpdateCustomFieldOption,
} from '@nothingleft/types';
import {
  createCustomField,
  createCustomFieldOption,
  deleteCustomField,
  deleteCustomFieldOption,
  listCustomFields,
  updateCustomField,
  updateCustomFieldOption,
} from '@lib/api/custom-fields';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useCustomFields(projectKey: string | null) {
  return useQuery({
    queryKey: queryKeys.customFields(projectKey ?? ''),
    refetchInterval: POLL.admin,
    queryFn: () => listCustomFields(projectKey as string).then(r => r.data),
    enabled: projectKey !== null,
    staleTime: 60_000,
  });
}

const replace = (rows: CustomField[], slug: string, next: CustomField) => rows.map(r => (r.slug === slug ? next : r));

function reorder(rows: CustomField[], slug: string, position: number): CustomField[] {
  const sorted = rows.toSorted((a, b) => a.position - b.position);
  const moving = sorted.find(r => r.slug === slug);
  if (!moving) return rows;
  const rest = sorted.filter(r => r !== moving);
  rest.splice(position, 0, moving);
  return rest.map((r, i) => ({ ...r, position: i }));
}

function useFieldMutation<TInput>(
  projectKey: string,
  fn: (input: TInput) => Promise<CustomField>,
  optimistic?: (rows: CustomField[], input: TInput) => CustomField[],
  confirmed?: (rows: CustomField[], input: TInput, result: CustomField) => CustomField[],
) {
  const client = useQueryClient();
  const key = queryKeys.customFields(projectKey);
  return useMutation({
    mutationFn: fn,
    onMutate: async (input: TInput) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<CustomField[]>(key);
      if (previous && optimistic) client.setQueryData(key, optimistic(previous, input));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: (result, input) => {
      const rows = client.getQueryData<CustomField[]>(key);
      if (rows && confirmed) client.setQueryData(key, confirmed(rows, input, result));
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key });
      // Names, options and scoping change what every issue in the project shows.
      void client.invalidateQueries({ queryKey: ['issues'] });
      void client.invalidateQueries({ queryKey: queryKeys.project(projectKey), exact: true });
    },
  });
}

export const useCreateCustomField = (projectKey: string) =>
  useFieldMutation(
    projectKey,
    (body: CreateCustomField) => createCustomField(projectKey, body).then(r => r.data),
    undefined,
    (rows, _input, created) => [...rows, created],
  );

export interface FieldUpdate {
  slug: string;
  body: UpdateCustomField;
}

export const useUpdateCustomField = (projectKey: string) =>
  useFieldMutation(
    projectKey,
    ({ slug, body }: FieldUpdate) => updateCustomField(projectKey, slug, body).then(r => r.data),
    (rows, { slug, body }) => {
      const merged = rows.map(r => (r.slug === slug ? { ...r, ...body, config: body.config ?? r.config } : r));
      return body.position === undefined ? merged : reorder(merged, slug, body.position);
    },
    (rows, { slug }, result) => replace(rows, slug, result),
  );

export const useDeleteCustomField = (projectKey: string) =>
  useFieldMutation(
    projectKey,
    (slug: string) => deleteCustomField(projectKey, slug).then(r => r.data),
    (rows, slug) => rows.filter(r => r.slug !== slug),
  );

export interface OptionChange {
  slug: string;
  name: string;
}

export const useCreateCustomFieldOption = (projectKey: string) =>
  useFieldMutation(
    projectKey,
    ({ slug, body }: { slug: string; body: CreateCustomFieldOption }) =>
      createCustomFieldOption(projectKey, slug, body).then(r => r.data),
    undefined,
    (rows, { slug }, result) => replace(rows, slug, result),
  );

export const useUpdateCustomFieldOption = (projectKey: string) =>
  useFieldMutation(
    projectKey,
    ({ slug, name, body }: OptionChange & { body: UpdateCustomFieldOption }) =>
      updateCustomFieldOption(projectKey, slug, name, body).then(r => r.data),
    (rows, { slug, name, body }) =>
      rows.map(r => {
        if (r.slug !== slug) return r;
        let options = r.options.map(o => (o.name === name ? { ...o, ...body } : o));
        if (body.position !== undefined) {
          const sorted = options.toSorted((a, b) => a.position - b.position);
          const moving = sorted.find(o => o.name === (body.name ?? name));
          if (moving) {
            const rest = sorted.filter(o => o !== moving);
            rest.splice(body.position, 0, moving);
            options = rest.map((o, position) => ({ ...o, position }));
          }
        }
        return { ...r, options };
      }),
    (rows, { slug }, result) => replace(rows, slug, result),
  );

export const useDeleteCustomFieldOption = (projectKey: string) =>
  useFieldMutation(
    projectKey,
    ({ slug, name, moveTo }: OptionChange & { moveTo?: string }) =>
      deleteCustomFieldOption(projectKey, slug, name, moveTo).then(r => r.data),
    undefined,
    (rows, { slug }, result) => replace(rows, slug, result),
  );

'use client';

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSchemaValue,
  deleteSchemaValue,
  listSchemaValues,
  updateSchemaValue,
  type SchemaTable,
  type SchemaTables,
  type SchemaValue,
} from '@lib/api/project-schema';
import { queryKeys } from '@lib/query/keys';

export function useSchemaValues<T extends SchemaTable>(projectKey: string | null, table: T) {
  return useQuery({
    queryKey: queryKeys.projectSchema(projectKey ?? '', table),
    queryFn: () => listSchemaValues(projectKey as string, table).then(r => r.data),
    enabled: projectKey !== null,
    staleTime: 5 * 60_000,
  });
}

/** One list per project, for a bulk edit that spans several: names merge, first project's colour wins. */
export function useSchemaValuesMany<T extends SchemaTable>(projectKeys: readonly string[], table: T) {
  return useQueries({
    queries: projectKeys.map(key => ({
      queryKey: queryKeys.projectSchema(key, table),
      queryFn: () => listSchemaValues(key, table).then(r => r.data),
      staleTime: 5 * 60_000,
    })),
    combine: results => ({
      isPending: results.some(r => r.isPending),
      values: results.flatMap(r => r.data ?? []) as SchemaValue<T>[],
    }),
  });
}

function useSchemaMutation<T extends SchemaTable, TInput>(
  projectKey: string,
  table: T,
  fn: (input: TInput) => Promise<SchemaValue<T>>,
  optimistic?: (rows: SchemaValue<T>[], input: TInput) => SchemaValue<T>[],
  confirmed?: (rows: SchemaValue<T>[], input: TInput, result: SchemaValue<T>) => SchemaValue<T>[],
) {
  const client = useQueryClient();
  const key = queryKeys.projectSchema(projectKey, table);
  return useMutation({
    mutationFn: fn,
    onMutate: async (input: TInput) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<SchemaValue<T>[]>(key);
      if (previous && optimistic) client.setQueryData(key, optimistic(previous, input));
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
    },
    onSuccess: (result, input) => {
      const rows = client.getQueryData<SchemaValue<T>[]>(key);
      if (rows && confirmed) client.setQueryData(key, confirmed(rows, input, result));
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: key });
      // Renames, merges and recolours change what every issue in the project shows.
      void client.invalidateQueries({ queryKey: ['issues'] });
    },
  });
}

export const useCreateSchemaValue = <T extends SchemaTable>(projectKey: string, table: T) =>
  useSchemaMutation(
    projectKey,
    table,
    (body: SchemaTables[T]['create']) => createSchemaValue(projectKey, table, body).then(r => r.data),
    undefined,
    (rows, _input, created) => [...rows, created],
  );

export interface SchemaUpdateInput<T extends SchemaTable> {
  name: string;
  body: SchemaTables[T]['update'];
}

export const useUpdateSchemaValue = <T extends SchemaTable>(projectKey: string, table: T) =>
  useSchemaMutation(
    projectKey,
    table,
    ({ name, body }: SchemaUpdateInput<T>) => updateSchemaValue(projectKey, table, name, body).then(r => r.data),
    (rows, { name, body }) => {
      let next = rows.map(r => (r.name === name ? { ...r, ...body } : r));
      if ('is_default' in body && body.is_default) {
        next = next.map(r => ('is_default' in r ? { ...r, is_default: r.name === (body.name ?? name) } : r));
      }
      if (body.position !== undefined) {
        const moving = next.find(r => r.name === (body.name ?? name));
        if (moving) {
          const rest = next.filter(r => r !== moving);
          rest.splice(body.position, 0, moving);
          next = rest.map((r, position) => ({ ...r, position }));
        }
      }
      return next as SchemaValue<T>[];
    },
  );

export const useDeleteSchemaValue = <T extends SchemaTable>(projectKey: string, table: T) =>
  useSchemaMutation(
    projectKey,
    table,
    ({ name, moveTo }: { name: string; moveTo?: string }) =>
      deleteSchemaValue(projectKey, table, name, moveTo).then(r => r.data),
    undefined,
    (rows, { name }) => rows.filter(r => r.name !== name),
  );

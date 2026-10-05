import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * The onMutate / onError pair every list mutation shares (frontend-guide.md § lib/query):
 * draw the change in every cached query under `queryKey` at once, put them back on a refusal.
 */
export function optimisticList<TData, TVars>(
  client: QueryClient,
  queryKey: QueryKey,
  apply: (data: TData, vars: TVars) => TData,
) {
  type Snapshot = { previous: [QueryKey, TData | undefined][] };
  return {
    onMutate: async (vars: TVars): Promise<Snapshot> => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueriesData<TData>({ queryKey });
      client.setQueriesData<TData>({ queryKey }, data => (data === undefined ? data : apply(data, vars)));
      return { previous };
    },
    onError: (_error: Error, _vars: TVars, context: Snapshot | undefined) => {
      for (const [key, data] of context?.previous ?? []) client.setQueryData(key, data);
    },
  };
}

import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@lib/query/keys';

/** A sprint, backlog or card change moves progress, containers and boards together. */
export function invalidateAgile(client: QueryClient) {
  void client.invalidateQueries({ queryKey: queryKeys.sprints() });
  void client.invalidateQueries({ queryKey: ['backlog'] });
  void client.invalidateQueries({ queryKey: queryKeys.boardViews() });
}

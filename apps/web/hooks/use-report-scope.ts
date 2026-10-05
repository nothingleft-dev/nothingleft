'use client';

import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import type { CustomField, WorkItemAttribute } from '@nothingleft/types';
import { isGroupable } from '@components/custom-fields/field-types';
import { useProjects } from '@hooks/use-projects';
import { listCustomFields } from '@lib/api/custom-fields';
import { listWorkItemAttributes } from '@lib/api/work-item-attributes';
import { queryKeys } from '@lib/query/keys';

/** The projects a report reads: the ones chosen, else every project the viewer can open. */
export function useScopeProjects(chosen: readonly string[]) {
  const projects = useProjects();
  const all = projects.data ?? [];
  const keys = chosen.length > 0 ? chosen : all.map(p => p.key);
  return { projects: all, keys, isPending: projects.isPending };
}

/**
 * Custom fields a report can group by, merged by slug across the projects in scope. There is no
 * organisation-wide list, so each project answers for its own; a slug means one field everywhere.
 */
export function useScopeGroupFields(keys: readonly string[]) {
  return useQueries({
    queries: keys.map(key => ({
      queryKey: queryKeys.customFields(key),
      queryFn: () => listCustomFields(key).then(r => r.data),
      staleTime: 60_000,
    })),
    combine: mergeGroupFields,
  });
}

function mergeGroupFields(results: readonly UseQueryResult<CustomField[]>[]) {
  const seen = new Map<string, Pick<CustomField, 'slug' | 'name'>>();
  for (const r of results)
    for (const f of r.data ?? []) if (!f.is_archived && isGroupable(f.type) && !seen.has(f.slug)) seen.set(f.slug, f);
  return { fields: [...seen.values()], isPending: results.some(r => r.isPending) };
}

/** Work item attribute names across the projects in scope, merged by name as the Time report merges them. */
export function useScopeAttributes(keys: readonly string[], enabled: boolean) {
  return useQueries({
    queries: keys.map(key => ({
      queryKey: queryKeys.workItemAttributes(key),
      queryFn: () => listWorkItemAttributes(key).then(r => r.data),
      staleTime: 60_000,
      enabled,
    })),
    combine: mergeAttributes,
  });
}

function mergeAttributes(results: readonly UseQueryResult<WorkItemAttribute[]>[]) {
  const seen = new Map<string, string>();
  for (const r of results)
    for (const a of r.data ?? []) if (!seen.has(a.name.toLowerCase())) seen.set(a.name.toLowerCase(), a.name);
  return {
    names: [...seen.values()].toSorted((a, b) => a.localeCompare(b)),
    isPending: results.some(r => r.isPending && r.fetchStatus !== 'idle'),
  };
}

'use client';

import { useMemo } from 'react';
import type { IssueListItem } from '@nothingleft/types';
import { useCustomFields } from '@hooks/use-custom-fields';
import type { CustomColumn } from '@lib/issue-list/columns';

/**
 * The custom fields a list can show: a project list asks for the project's live fields; a list across
 * projects reads them off the rows it has, since each row lists every field that applies to it.
 */
export function useCustomColumns(project: string | undefined, rows: readonly IssueListItem[]): CustomColumn[] {
  const fields = useCustomFields(project ?? null);
  return useMemo(() => {
    if (project) {
      return (fields.data ?? [])
        .filter(f => !f.is_archived)
        .toSorted((a, b) => a.position - b.position)
        .map(({ slug, name, type, config }) => ({ slug, name, type, decimals: config.decimals }));
    }
    const seen = new Map<string, CustomColumn>();
    for (const row of rows)
      for (const { slug, name, type } of row.custom_fields) if (!seen.has(slug)) seen.set(slug, { slug, name, type });
    return [...seen.values()];
  }, [project, fields.data, rows]);
}

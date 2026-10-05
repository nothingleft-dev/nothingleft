'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import type { ReportName } from '@nothingleft/types';
import { useSession } from '@hooks/use-session';
import { useProjects } from '@hooks/use-projects';
import { nextSearch, readParam, reportQuery, type ReportChanges } from '@lib/reports/url';

export interface ReportState {
  name: ReportName;
  params: URLSearchParams;
  query: ReturnType<typeof reportQuery>;
  get: (key: string) => string;
  /** Pickers replace the entry; committing a query pushes one, as the issue list does. */
  set: (changes: ReportChanges, mode?: 'push' | 'replace') => void;
}

/** A report's parameters live in the URL, so copying the address shares the report. */
export function useReportState(name: ReportName): ReportState {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = useMemo(() => reportQuery(name, params, 'me'), [name, params]);
  const get = useCallback((key: string) => readParam(name, params, key), [name, params]);
  const set = useCallback(
    (changes: ReportChanges, mode: 'push' | 'replace' = 'replace') => {
      const url = `${pathname}${nextSearch(name, params, changes)}` as Route;
      if (mode === 'push') router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [router, pathname, params, name],
  );
  return { name, params, query, get, set };
}

/**
 * Burndown and Gantt read one project. Without one in the address, the last project visited
 * (else the first) is written in, so the address still names what is shown.
 */
export function useDefaultProject(state: ReportState): string | null {
  const session = useSession();
  const projects = useProjects();
  const chosen = state.query.project ?? null;
  const last = session.status === 'signed-in' ? session.user.preferences.last_project_key : null;
  const fallback = projects.data
    ? (projects.data.find(p => p.key === last)?.key ?? projects.data[0]?.key ?? null)
    : null;
  const { set } = state;
  useEffect(() => {
    if (!chosen && fallback) set({ project: fallback });
  }, [chosen, fallback, set]);
  return chosen;
}

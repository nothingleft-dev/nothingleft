'use client';

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import type { ReportName } from '@nothingleft/types';
import { saveDownload } from '@lib/files';
import {
  downloadReportCsv,
  getReport,
  listTimesheetWorkItems,
  TIMESHEET_PAGE,
  type ReportQuery,
} from '@lib/api/reports';
import { queryKeys } from '@lib/query/keys';

// No polling: the API caches a report for five minutes and drops it on any write in the organisation.
export function useReport<N extends ReportName>(name: N, query: ReportQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.report(name, query),
    queryFn: () => getReport(name, query).then(r => r.data),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useTimesheetWorkItems(query: ReportQuery | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.timesheetWorkItems(query ?? {}),
    queryFn: ({ pageParam }) => listTimesheetWorkItems(query!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.length * TIMESHEET_PAGE;
      return loaded < (last.meta.pagination?.total ?? 0) ? loaded : undefined;
    },
    enabled: query !== null,
  });
}

export function useReportCsvExport() {
  return useMutation({
    mutationFn: ({ name, query }: { name: ReportName; query: ReportQuery }) => downloadReportCsv(name, query),
    onSuccess: saveDownload,
  });
}

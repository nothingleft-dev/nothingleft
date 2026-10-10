'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExportJob } from '@nothingleft/types';
import { listExports, requestExport } from '@lib/api/exports';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export const isExportPending = (job: Pick<ExportJob, 'status'>) => job.status === 'queued' || job.status === 'running';

export function useExports(slug: string) {
  return useQuery({
    queryKey: queryKeys.exports(slug),
    queryFn: () => listExports(slug).then(r => r.data),
    refetchInterval: query => (query.state.data?.some(isExportPending) ? POLL.job(query) : POLL.admin(query)),
  });
}

/** A pending export comes back as it is, so the list takes the answer's place by id. */
export function useRequestExport(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => requestExport(slug).then(r => r.data),
    onSuccess: job =>
      client.setQueryData<ExportJob[]>(queryKeys.exports(slug), list =>
        list ? [job, ...list.filter(j => j.id !== job.id)] : [job],
      ),
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.exports(slug) }),
  });
}

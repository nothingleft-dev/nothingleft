'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { IssueKey } from '@components/issue-key';
import { RelativeTime } from '@components/relative-time';
import { RowsSkeleton } from '@components/skeletons';
import { SettingsSection } from '@components/settings/section';
import { PriorityBadge, TypeBadge } from '@components/issues/value-marks';
import { DELETED_PAGE_SIZE, useDeletedIssues, useRestoreIssue } from '@hooks/use-issues';
import { formatDateTime } from '@lib/datetime';
import { issuePath } from '@lib/issue-path';

const EMPTY = '--';

export function DeletedIssues({ projectKey, canRestore }: { projectKey: string; canRestore: boolean }) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);
  const deleted = useDeletedIssues(projectKey, offset);
  const restore = useRestoreIssue();
  const rows = deleted.data?.data ?? [];
  const total = deleted.data?.meta.pagination?.total ?? 0;

  return (
    <SettingsSection
      title="Deleted issues"
      description="A deleted issue can be restored for 14 days. After that it is removed for good, with its history."
    >
      {deleted.isPending ? (
        <RowsSkeleton rows={4} />
      ) : deleted.isError ? (
        <FormAlert title="Deleted issues could not be loaded." />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing has been deleted in the last 14 days." />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-app text-left text-2xs font-medium text-text-secondary">
              <tr>
                <th className="h-7 px-3 font-medium">Issue</th>
                <th className="px-3 font-medium">Deleted</th>
                <th className="px-3 font-medium">Restorable until</th>
                <th className="px-3" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {rows.map(issue => (
                <tr key={issue.key} className="h-row">
                  <td className="px-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <PriorityBadge priority={issue.priority} />
                      <TypeBadge type={issue.type} />
                      <IssueKey issueKey={issue.key} />
                      <span className="min-w-0 truncate">{issue.title}</span>
                    </span>
                  </td>
                  <td className="px-3 text-xs whitespace-nowrap">
                    {issue.deleted_at ? <RelativeTime value={issue.deleted_at} /> : EMPTY}
                  </td>
                  <td className="px-3 text-xs whitespace-nowrap text-text-secondary">
                    {issue.restorable_until ? formatDateTime(issue.restorable_until) : EMPTY}
                  </td>
                  <td className="px-3 text-right">
                    {canRestore ? (
                      <Button
                        variant="outline"
                        size="xs"
                        disabled={restore.isPending && restore.variables === issue.key}
                        onClick={() =>
                          restore.mutate(issue.key, {
                            onSuccess: back =>
                              toast.success(`Restored ${back.key}.`, {
                                action: { label: 'Open', onClick: () => router.push(issuePath(back)) },
                              }),
                            onError: error => toast.error(error.message),
                          })
                        }
                      >
                        Restore
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > DELETED_PAGE_SIZE ? (
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Button
            variant="outline"
            size="xs"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - DELETED_PAGE_SIZE))}
          >
            Previous
          </Button>
          <span className="tabular">
            {offset + 1}–{Math.min(offset + DELETED_PAGE_SIZE, total)} of {total}
          </span>
          <Button
            variant="outline"
            size="xs"
            disabled={offset + DELETED_PAGE_SIZE >= total}
            onClick={() => setOffset(offset + DELETED_PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </SettingsSection>
  );
}

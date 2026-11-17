'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { LoadError } from '@components/query-state';
import { PendingButton } from '@components/pending-button';
import { EmptyState } from '@components/empty-state';
import { PageHeader } from '@components/page-header';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { RelativeTime } from '@components/relative-time';
import { ArticleRowsSkeleton, articlePath } from '@components/articles/article-row';
import { useDeletedArticles, useRestoreArticle } from '@hooks/use-articles';
import { useSession } from '@hooks/use-session';
import { isApiError } from '@lib/api/errors';
import { formatDate, formatDateTimeWithZone } from '@lib/datetime';

export function DeletedArticles({ project }: { project: string }) {
  const router = useRouter();
  const session = useSession();
  const timeZone = session.status === 'signed-in' ? session.user.timezone : undefined;
  const deleted = useDeletedArticles(project);
  const restore = useRestoreArticle(project);
  const [refusals, setRefusals] = useState<Record<string, string>>({});

  const onRestore = (slug: string) =>
    restore.mutate(slug, {
      onSuccess: article => {
        toast.success(`Restored ${article.title}.`, {
          action: { label: 'Open', onClick: () => router.push(articlePath(article)) },
        });
      },
      onError: e =>
        setRefusals(r => ({ ...r, [slug]: isApiError(e) ? e.message : 'The article could not be restored.' })),
    });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Deleted articles" />
      <p className="max-w-[72ch] text-sm text-text-secondary">
        Deleted articles can be restored for 14 days, with whatever was deleted along with them. After that they are
        removed for good, with their comments and files. Only articles you can restore are listed.
      </p>
      {deleted.isPending ? (
        <ArticleRowsSkeleton rows={3} />
      ) : deleted.isError ? (
        <LoadError onRetry={() => void deleted.refetch()} detail={deleted.error.message}>
          The deleted articles could not be loaded.
        </LoadError>
      ) : deleted.data.length === 0 ? (
        <EmptyState title="Nothing to restore." description="Articles deleted in the last 14 days appear here." />
      ) : (
        <ul className="divide-y divide-border-subtle rounded-md border">
          {deleted.data.map(node => (
            <li key={`${node.slug}-${node.deleted_at}`} className="flex flex-col gap-1 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate font-medium">{node.title}</span>
                <span className="flex flex-none items-center gap-1 text-xs text-text-secondary">
                  {node.deleted_at ? (
                    <span>
                      Deleted{' '}
                      <RelativeTime value={node.deleted_at} timeZone={timeZone} className="text-text-secondary" />
                    </span>
                  ) : null}
                  {node.restorable_until ? (
                    <span className="max-md:hidden">
                      <span className="text-text-muted">· </span>
                      restorable until{' '}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <time dateTime={node.restorable_until}>{formatDate(node.restorable_until, timeZone)}</time>
                        </TooltipTrigger>
                        <TooltipContent>{formatDateTimeWithZone(node.restorable_until, timeZone)}</TooltipContent>
                      </Tooltip>
                    </span>
                  ) : null}
                </span>
                <PendingButton
                  size="sm"
                  variant="outline"
                  pending={restore.isPending && restore.variables === node.slug}
                  pendingLabel="Restoring…"
                  onClick={() => onRestore(node.slug)}
                >
                  <RotateCcw /> Restore
                </PendingButton>
              </div>
              {refusals[node.slug] ? (
                <p role="alert" className="text-xs text-danger-fg">
                  {refusals[node.slug]}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { EmptyState } from '@components/empty-state';
import { PageHeader } from '@components/page-header';
import { RelativeTime } from '@components/relative-time';
import { ArticleRowsSkeleton, articlePath } from '@components/articles/article-row';
import { useDeletedArticles, useRestoreArticle } from '@hooks/use-articles';
import { useSession } from '@hooks/use-session';
import { isApiError } from '@lib/api/errors';
import { formatDateTime } from '@lib/datetime';

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
        removed for good, with their comments and files. You see the ones you could restore.
      </p>
      {deleted.isPending ? (
        <ArticleRowsSkeleton rows={3} />
      ) : deleted.isError ? (
        <FormAlert title="The deleted articles could not be loaded.">{deleted.error.message}</FormAlert>
      ) : deleted.data.length === 0 ? (
        <EmptyState title="Nothing to restore." description="Articles deleted in the last 14 days appear here." />
      ) : (
        <ul className="divide-y divide-border-subtle rounded-md border">
          {deleted.data.map(node => (
            <li key={`${node.slug}-${node.deleted_at}`} className="flex flex-col gap-1 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <FileText className="size-icon-sm flex-none text-text-muted" />
                <span className="min-w-0 flex-1 truncate font-medium">{node.title}</span>
                {node.deleted_at ? (
                  <span className="text-xs text-text-secondary">
                    Deleted <RelativeTime value={node.deleted_at} timeZone={timeZone} />
                  </span>
                ) : null}
                {node.restorable_until ? (
                  <span className="text-xs text-text-muted max-md:hidden">
                    until {formatDateTime(node.restorable_until, timeZone)}
                  </span>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={restore.isPending && restore.variables === node.slug}
                  onClick={() => onRestore(node.slug)}
                >
                  <RotateCcw /> Restore
                </Button>
              </div>
              {refusals[node.slug] ? (
                <p role="alert" className="pl-7 text-xs text-danger-fg">
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

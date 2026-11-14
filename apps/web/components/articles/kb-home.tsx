'use client';

import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@components/ui/button';
import { PageHeader } from '@components/page-header';
import { ArticleResults } from '@components/articles/article-results';
import { DeletedArticles } from '@components/articles/deleted-articles';
import { useKnowledgeBase } from '@components/articles/knowledge-base';
import { StarterCardBody, starterCardClass } from '@components/articles/new-article-dialog';
import { STARTERS, type StarterId } from '@lib/articles/starters';

export function KnowledgeBaseHome() {
  const { project, projectName, nodes, treeLoaded, canCreate, openNewArticle } = useKnowledgeBase();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get('q') ?? '';

  if (params.get('view') === 'deleted') return <DeletedArticles project={project} />;

  const commit = (next: string) => {
    const search = new URLSearchParams(params);
    if (next) search.set('q', next);
    else search.delete('q');
    const query = search.toString();
    router.replace(`${pathname}${query ? `?${query}` : ''}` as Route, { scroll: false });
  };

  const empty = treeLoaded && nodes.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Knowledge base"
        meta={projectName}
        actions={
          canCreate ? (
            <Button onClick={() => openNewArticle({ parent: null, starter: 'blank' })}>
              <Plus /> New article
            </Button>
          ) : null
        }
      />
      <ArticleResults
        project={project}
        q={q}
        onCommit={commit}
        autoFocus={params.get('focus') === '1'}
        whenEmpty={
          empty ? (
            <Starters canCreate={canCreate} onPick={s => openNewArticle({ parent: null, starter: s })} />
          ) : undefined
        }
      />
    </div>
  );
}

function Starters({ canCreate, onPick }: { canCreate: boolean; onPick: (starter: StarterId) => void }) {
  if (!canCreate) {
    return (
      <div className="rounded-md border border-dashed px-4 py-6">
        <p className="font-medium">No articles yet.</p>
        <p className="mt-1 text-xs text-text-secondary">
          Runbooks, decisions and onboarding notes appear here once a Contributor writes one.
        </p>
      </div>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="font-medium">Write the first article.</p>
        <p className="mt-1 text-xs text-text-secondary">Pick a starting point. Every article starts as a draft.</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {STARTERS.map(s => (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.id)} className={starterCardClass}>
              <StarterCardBody starter={s} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

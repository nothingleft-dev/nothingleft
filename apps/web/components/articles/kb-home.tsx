'use client';

import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BookOpen, ClipboardList, FilePlus2, Plus, Scale } from 'lucide-react';
import { Button } from '@components/ui/button';
import { PageHeader } from '@components/page-header';
import { ArticleResults } from '@components/articles/article-results';
import { DeletedArticles } from '@components/articles/deleted-articles';
import { useKnowledgeBase } from '@components/articles/knowledge-base';
import { STARTERS, type StarterId } from '@lib/articles/starters';

const STARTER_ICON: Record<StarterId, typeof BookOpen> = {
  runbook: ClipboardList,
  decision: Scale,
  onboarding: BookOpen,
  blank: FilePlus2,
};

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
          canCreate && !empty ? (
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
    <section className="flex flex-col gap-3 rounded-md border border-dashed px-4 py-5">
      <div>
        <p className="font-medium">Write the first article.</p>
        <p className="mt-1 text-xs text-text-secondary">
          Start from one of these, or from a blank page. Every article starts as a draft.
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {STARTERS.map(s => {
          const Icon = STARTER_ICON[s.id];
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s.id)}
                className="flex h-full w-full items-start gap-2.5 rounded-md border bg-surface px-3 py-2.5 text-left hover:border-border-strong hover:bg-hover"
              >
                <Icon className="mt-0.5 size-icon-sm flex-none text-text-secondary" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{s.name}</span>
                  <span className="text-xs text-text-secondary">{s.description}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

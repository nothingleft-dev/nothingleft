'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { useParams, usePathname, useSearchParams } from 'next/navigation';
import { BookOpen, PanelLeft, Plus, Star, Trash2 } from 'lucide-react';
import type { ArticleNode } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@components/ui/sheet';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { ArticleTree } from '@components/articles/article-tree';
import { DraftMark } from '@components/articles/draft-mark';
import { NewArticleDialog, type NewArticleRequest } from '@components/articles/new-article-dialog';
import { TagCloud } from '@components/articles/tag-cloud';
import { useArticleTree, useDeletedArticles } from '@hooks/use-articles';
import { useProject } from '@hooks/use-projects';
import { useRecordProjectVisit } from '@hooks/use-project-visit';
import { useArticleTagCloud } from '@hooks/use-tags';
import { cn } from '@lib/utils';

interface KnowledgeBaseContextValue {
  project: string;
  projectName: string | null;
  nodes: readonly ArticleNode[];
  treeLoaded: boolean;
  canCreate: boolean;
  canMove: boolean;
  openNewArticle: (request: NewArticleRequest) => void;
}

const KnowledgeBaseContext = createContext<KnowledgeBaseContextValue | null>(null);

export function useKnowledgeBase() {
  const value = useContext(KnowledgeBaseContext);
  if (!value) throw new Error('useKnowledgeBase needs <KnowledgeBase>');
  return value;
}

/** The rail beside every knowledge base page: stays mounted while the article under it changes. */
export function KnowledgeBase({ project, children }: { project: string; children: ReactNode }) {
  useRecordProjectVisit(project);
  const projectQuery = useProject(project);
  const tree = useArticleTree(project);
  const [request, setRequest] = useState<NewArticleRequest | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const capabilities = projectQuery.data?.knowledge_base;

  const value = useMemo<KnowledgeBaseContextValue>(
    () => ({
      project,
      projectName: projectQuery.data?.name ?? null,
      nodes: tree.data ?? [],
      treeLoaded: tree.isSuccess,
      canCreate: capabilities?.can_create ?? false,
      canMove: capabilities?.can_move ?? false,
      openNewArticle: setRequest,
    }),
    [project, projectQuery.data?.name, tree.data, tree.isSuccess, capabilities?.can_create, capabilities?.can_move],
  );

  return (
    <KnowledgeBaseContext.Provider value={value}>
      <div className="grid items-start gap-8 lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside
          aria-label="Knowledge base"
          className="sticky top-0 -my-5 h-[calc(100dvh-var(--topbar))] self-start overflow-y-auto border-r py-5 pr-3 max-lg:hidden"
        >
          <Rail loading={tree.isPending} />
        </aside>
        <div className="min-w-0">
          <Button variant="outline" size="sm" className="mb-4 lg:hidden" onClick={() => setRailOpen(true)}>
            <PanelLeft /> Articles
          </Button>
          {children}
        </div>
      </div>
      <Sheet open={railOpen} onOpenChange={setRailOpen}>
        <SheetContent side="left" className="w-[300px] overflow-y-auto p-3">
          <SheetHeader className="sr-only">
            <SheetTitle>Knowledge base</SheetTitle>
          </SheetHeader>
          <div onClick={e => e.target instanceof Element && e.target.closest('a[href]') && setRailOpen(false)}>
            <Rail loading={tree.isPending} />
          </div>
        </SheetContent>
      </Sheet>
      <NewArticleDialog
        project={project}
        nodes={value.nodes}
        request={request}
        onOpenChange={open => !open && setRequest(null)}
      />
    </KnowledgeBaseContext.Provider>
  );
}

function RailHead({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div className="mt-4 mb-1 flex h-6 items-center px-2 text-xs font-medium text-text-muted">
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

function Rail({ loading }: { loading: boolean }) {
  const { project, nodes, canCreate, canMove, openNewArticle } = useKnowledgeBase();
  const params = useParams<{ slug?: string }>();
  const pathname = usePathname();
  const search = useSearchParams();
  const current = params.slug ? decodeURIComponent(params.slug) : null;
  const tags = useArticleTagCloud(project);
  const deleted = useDeletedArticles(project);
  const starred = nodes.filter(n => n.starred);
  const home = `/projects/${project}/articles`;
  const onHome = pathname === home && search.get('view') !== 'deleted';

  return (
    <nav className="flex flex-col text-sm">
      <div className="flex items-center gap-1">
        <Link
          href={home as Route}
          aria-current={onHome ? 'page' : undefined}
          className={cn(
            'flex h-control min-w-0 flex-1 items-center gap-2 rounded-sm px-2 font-medium text-text-secondary hover:bg-hover hover:text-text',
            onHome && 'bg-active text-text',
          )}
        >
          <BookOpen className="size-icon-sm flex-none" />
          <span className="truncate">Knowledge base</span>
        </Link>
        {canCreate ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="New article"
                className="text-text-secondary"
                onClick={() => openNewArticle({ parent: null, starter: 'blank' })}
              >
                <Plus />
              </Button>
            </TooltipTrigger>
            <TooltipContent>New article</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {starred.length > 0 ? (
        <>
          <RailHead>Starred</RailHead>
          <ul className="flex flex-col">
            {starred.map(n => (
              <li key={n.slug}>
                <Link
                  href={`${home}/${n.slug}` as Route}
                  aria-current={n.slug === current ? 'page' : undefined}
                  className={cn(
                    'flex h-7 items-center gap-2 rounded-sm px-2 text-text-secondary hover:bg-hover hover:text-text',
                    n.slug === current && 'text-text',
                  )}
                >
                  <Star className="size-3.5 flex-none fill-current text-brand-text" />
                  <span className="truncate">{n.title}</span>
                  {n.status === 'draft' ? <DraftMark /> : null}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <RailHead>Articles</RailHead>
      {loading ? (
        <div className="flex flex-col gap-2 px-2 py-1" aria-hidden>
          {[70, 55, 62, 40, 58].map((w, i) => (
            <Skeleton key={i} className="h-3.5" style={{ width: `${w}%`, marginLeft: (i % 3) * 14 }} />
          ))}
        </div>
      ) : nodes.length === 0 ? (
        <p className="px-2 text-xs text-text-muted">No articles yet.</p>
      ) : (
        <ArticleTree
          project={project}
          nodes={nodes}
          current={current}
          canMove={canMove}
          canCreate={canCreate}
          onCreateChild={parent => openNewArticle({ parent, starter: 'blank' })}
        />
      )}

      <RailHead>Tags</RailHead>
      <TagCloud project={project} tags={tags.data} loading={tags.isPending} activeQuery={search.get('q') ?? ''} />

      {(deleted.data?.length ?? 0) > 0 ? (
        <Link
          href={`${home}?view=deleted` as Route}
          aria-current={search.get('view') === 'deleted' ? 'page' : undefined}
          className={cn(
            'mt-5 flex h-7 items-center gap-2 rounded-sm px-2 text-text-secondary hover:bg-hover hover:text-text',
            search.get('view') === 'deleted' && pathname === home && 'bg-active text-text',
          )}
        >
          <Trash2 className="size-3.5 flex-none" />
          <span className="flex-1">Deleted articles</span>
          <span className="tabular text-xs text-text-muted">{deleted.data!.length}</span>
        </Link>
      ) : null}
    </nav>
  );
}

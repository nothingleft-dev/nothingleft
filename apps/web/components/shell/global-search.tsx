'use client';

import { forwardRef, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { FileText, Search } from 'lucide-react';
import type { GlobalSearchResult } from '@nothingleft/types';
import { Kbd } from '@components/kbd';
import { IssueKey } from '@components/issue-key';
import { DraftMark } from '@components/articles/draft-mark';
import { articlePath } from '@components/articles/article-row';
import { StatusDot, TypeBadge } from '@components/issues/value-marks';
import { useGlobalSearch } from '@hooks/use-articles';
import { useDebounced } from '@hooks/use-debounced';
import { isApiError } from '@lib/api/errors';
import { issuePath } from '@lib/issue-path';
import { cn } from '@lib/utils';

type Hit = { kind: 'issue' | 'article' | 'all-issues' | 'all-articles'; href: Route };

export interface GlobalSearchHandle {
  focus: () => void;
}

const listHref = (base: string, q: string) => `${base}?q=${encodeURIComponent(q)}` as Route;

/** The top bar's box: issues and articles for one query, in two groups that never mix. */
export const GlobalSearch = forwardRef<GlobalSearchHandle>(function GlobalSearch(_, ref) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = useDebounced(text.trim(), 400);
  const search = useGlobalSearch(q);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

  const result = search.data;
  const hits = useMemo<Hit[]>(() => {
    if (!result || !q) return [];
    const list: Hit[] = [];
    for (const i of result.issues.items) list.push({ kind: 'issue', href: issuePath(i) });
    if (result.issues.total > result.issues.items.length)
      list.push({ kind: 'all-issues', href: listHref('/issues', q) });
    for (const a of result.articles.items) list.push({ kind: 'article', href: articlePath(a) });
    if (result.articles.total > result.articles.items.length) {
      list.push({ kind: 'all-articles', href: listHref('/articles', q) });
    }
    return list;
  }, [result, q]);

  const go = (href: Route) => {
    setOpen(false);
    setText('');
    input.current?.blur();
    router.push(href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && hits.length > 0) {
      event.preventDefault();
      setActive(i => (i + 1) % hits.length);
    } else if (event.key === 'ArrowUp' && hits.length > 0) {
      event.preventDefault();
      setActive(i => (i <= 0 ? hits.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = hits[active];
      if (hit) go(hit.href);
      else if (text.trim()) go(listHref('/issues', text.trim()));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (text) setText('');
      else input.current?.blur();
    }
  };

  const typing = text.trim() !== q;
  const showPanel = open && text.trim() !== '';
  // Both groups refused the query: the API answers 400 and names the problem once.
  const refusal = isApiError(search.error) && search.error.status === 400 ? search.error.message : null;

  const issueCount = result?.issues.items.length ?? 0;
  const articleStart = issueCount + (result && result.issues.total > issueCount ? 1 : 0);

  return (
    <div className="relative ml-auto hidden w-[440px] max-w-[40vw] md:block">
      <div className="flex h-control items-center gap-2 rounded-sm border bg-app px-2 text-text-muted focus-within:border-border-strong focus-within:bg-surface focus-within:shadow-(--focus-ring) hover:border-border-strong">
        <Search className="size-icon-sm flex-none" />
        <input
          ref={input}
          value={text}
          onChange={e => {
            setText(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-label="Search issues and articles"
          aria-expanded={showPanel}
          aria-controls="global-search-results"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search issues and articles · tag: rca"
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-xs text-text outline-none placeholder:text-text-muted focus-visible:shadow-none"
        />
        <Kbd>/</Kbd>
      </div>

      {showPanel ? (
        <div
          id="global-search-results"
          role="listbox"
          onMouseDown={e => e.preventDefault()}
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-[min(560px,70vh)] overflow-y-auto rounded-lg border bg-raised py-1 shadow-popover"
        >
          {!result && (search.isPending || typing) ? (
            <PanelNote>Searching…</PanelNote>
          ) : refusal ? (
            <PanelNote danger>{refusal}</PanelNote>
          ) : search.isError ? (
            <PanelNote danger>The search could not run. Try again in a moment.</PanelNote>
          ) : result ? (
            <>
              <Group
                label="Issues"
                group={result.issues}
                empty="No issue matches."
                seeAll={
                  result.issues.total > result.issues.items.length ? (
                    <SeeAll
                      label={`See all ${result.issues.total} issues`}
                      active={active === issueCount}
                      onClick={() => go(listHref('/issues', q))}
                    />
                  ) : null
                }
              >
                {result.issues.items.map((issue, i) => {
                  return (
                    <Row
                      key={issue.key}
                      active={active === i}
                      onHover={() => setActive(i)}
                      onClick={() => go(issuePath(issue))}
                    >
                      <TypeBadge type={issue.type} />
                      <IssueKey issueKey={issue.key} resolved={issue.resolved} />
                      <span className={cn('min-w-0 flex-1 truncate', issue.resolved && 'text-text-muted line-through')}>
                        {issue.title}
                      </span>
                      <span className="flex flex-none items-center gap-1.5 text-2xs text-text-muted">
                        <StatusDot category={issue.status.category} color={issue.status.color} />
                        {issue.status.name}
                      </span>
                    </Row>
                  );
                })}
              </Group>
              <Group
                label="Articles"
                group={result.articles}
                empty="No article matches."
                seeAll={
                  result.articles.total > result.articles.items.length ? (
                    <SeeAll
                      label={`See all ${result.articles.total} articles`}
                      active={active === hits.length - 1}
                      onClick={() => go(listHref('/articles', q))}
                    />
                  ) : null
                }
              >
                {result.articles.items.map((article, j) => {
                  const i = articleStart + j;
                  return (
                    <Row
                      key={`${article.project.key}/${article.slug}`}
                      active={active === i}
                      onHover={() => setActive(i)}
                      onClick={() => go(articlePath(article))}
                    >
                      <FileText className="size-icon-sm flex-none text-text-muted" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate">{article.title}</span>
                          {article.status === 'draft' ? <DraftMark /> : null}
                        </span>
                        {article.excerpt ? (
                          <span className="truncate text-2xs text-text-secondary">{article.excerpt}</span>
                        ) : null}
                      </span>
                      <span className="flex-none font-mono text-2xs text-text-muted">{article.project.key}</span>
                    </Row>
                  );
                })}
              </Group>
              <div className="mt-1 flex items-center gap-3 border-t px-3 pt-1.5 pb-0.5 text-2xs text-text-muted">
                <span>
                  <Kbd className="h-4 min-w-4 text-[10px]">↑</Kbd> <Kbd className="h-4 min-w-4 text-[10px]">↓</Kbd> to
                  choose
                </span>
                <span>
                  <Kbd className="h-4 min-w-4 text-[10px]">↵</Kbd> opens it, or the issue list for the query
                </span>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

type SearchGroup = GlobalSearchResult['issues'] | GlobalSearchResult['articles'];

function Group({
  label,
  group,
  empty,
  seeAll,
  children,
}: {
  label: string;
  group: SearchGroup;
  empty: string;
  seeAll: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="py-1">
      <div className="flex items-center gap-2 px-3 pt-1 pb-0.5 text-2xs font-medium text-text-muted">
        <span>{label}</span>
        {group.error ? null : <span className="tabular font-normal">{group.total}</span>}
      </div>
      {group.error ? (
        <p className="px-3 py-1.5 text-xs text-danger-fg">{group.error.message}</p>
      ) : group.items.length === 0 ? (
        <p className="px-3 py-1.5 text-xs text-text-secondary">{empty}</p>
      ) : (
        <>
          {children}
          {seeAll}
        </>
      )}
    </div>
  );
}

function Row({
  active,
  onHover,
  onClick,
  children,
}: {
  active: boolean;
  onHover: () => void;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn('flex min-h-[34px] cursor-pointer items-center gap-2.5 px-3 py-1 text-sm', active && 'bg-hover')}
    >
      {children}
    </div>
  );
}

function SeeAll({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex h-[30px] cursor-pointer items-center px-3 pl-[38px] text-xs text-brand-text hover:bg-hover',
        active && 'bg-hover',
      )}
    >
      {label}
    </div>
  );
}

function PanelNote({ children, danger }: { children: React.ReactNode; danger?: boolean }) {
  return <p className={cn('px-3 py-2 text-xs', danger ? 'text-danger-fg' : 'text-text-secondary')}>{children}</p>;
}

'use client';

import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Route } from 'next';
import { FileText, Search, X } from 'lucide-react';
import type { GlobalSearchResult } from '@nothingleft/types';
import { RetryButton } from '@components/query-state';
import { Kbd } from '@components/kbd';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { IssueKey } from '@components/issue-key';
import { DraftMark } from '@components/articles/draft-mark';
import { articlePath } from '@components/articles/article-row';
import { StatusDot, TypeBadge } from '@components/issues/value-marks';
import { useGlobalSearch } from '@hooks/use-articles';
import { useDebounced } from '@hooks/use-debounced';
import { useMediaQuery } from '@hooks/use-media-query';
import { isApiError } from '@lib/api/errors';
import { issuePath } from '@lib/issue-path';
import { cn } from '@lib/utils';

type Hit = { kind: 'issue' | 'article' | 'all-issues' | 'all-articles'; href: Route };

export interface GlobalSearchHandle {
  focus: () => void;
}

const listHref = (base: string, q: string) => `${base}?q=${encodeURIComponent(q)}` as Route;

const QUERY_BAR = '[data-query-bar]';

const subscribeToPage = (onChange: () => void) => {
  let frame = 0;
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(onChange);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
  };
};

/** `/` goes to a page's own query bar when it has one, so this box's hint would point the wrong way there. */
function usePageHasQueryBar() {
  usePathname();
  return useSyncExternalStore(
    subscribeToPage,
    () => document.querySelector(QUERY_BAR) !== null,
    () => false,
  );
}

/** The top bar's box: issues and articles for one query, in two groups that never mix. */
export const GlobalSearch = forwardRef<GlobalSearchHandle>(function GlobalSearch(_, ref) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Phones show an icon; the box opens over the top bar only when asked for.
  const [expanded, setExpanded] = useState(false);
  const q = useDebounced(text.trim(), 400);
  const search = useGlobalSearch(q);
  const wide = useMediaQuery('(min-width: 64rem)');
  const pageHasQueryBar = usePageHasQueryBar();

  const reveal = () => {
    setExpanded(true);
    requestAnimationFrame(() => input.current?.focus());
  };
  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        setExpanded(true);
        requestAnimationFrame(() => input.current?.focus());
      },
    }),
    [],
  );

  const collapse = () => {
    setExpanded(false);
    setText('');
    input.current?.blur();
  };

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
    collapse();
    router.push(href);
  };

  const typing = text.trim() !== q;
  // The first result is chosen until the arrows move, so ↵ always has something to open.
  const chosen = hits.length === 0 ? -1 : Math.min(Math.max(active, 0), hits.length - 1);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && hits.length > 0) {
      event.preventDefault();
      setActive((chosen + 1) % hits.length);
    } else if (event.key === 'ArrowUp' && hits.length > 0) {
      event.preventDefault();
      setActive(chosen <= 0 ? hits.length - 1 : chosen - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = typing ? undefined : hits[chosen];
      if (hit) go(hit.href);
      else if (text.trim()) go(listHref('/issues', text.trim()));
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (text) setText('');
      else collapse();
    }
  };

  const showPanel = open && text.trim() !== '';
  // Both groups refused the query: the API answers 400 and names the problem once.
  const refusal = isApiError(search.error) && search.error.status === 400 ? search.error.message : null;

  const issueCount = result?.issues.items.length ?? 0;
  // Keys take the width of the longest one shown, so titles start right after them and still line up.
  const keyWidth = `${Math.max(
    4,
    ...(result?.issues.items.map(i => i.key.length) ?? []),
    ...(result?.articles.items.map(a => a.project.key.length) ?? []),
  )}ch`;
  const articleStart = issueCount + (result && result.issues.total > issueCount ? 1 : 0);

  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Search" onClick={reveal} className="md:hidden">
        <Search className="size-icon" />
      </Button>
      <div
        className={cn(
          'relative ml-auto w-[440px] max-w-[30vw] lg:max-w-[40vw]',
          expanded
            ? 'max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:z-50 max-md:flex max-md:h-topbar max-md:w-auto max-md:max-w-none max-md:items-center max-md:gap-2 max-md:border-b max-md:bg-surface max-md:px-page-x-mobile'
            : 'max-md:hidden',
        )}
      >
        <div className="flex h-control min-w-0 flex-1 items-center gap-2 rounded-sm border bg-app px-2 text-text-muted focus-within:border-border-strong focus-within:bg-surface focus-within:shadow-(--focus-ring) hover:border-border-strong">
          <Search className="size-icon-sm flex-none" />
          <span className="relative flex h-full min-w-0 flex-1 items-center">
            <input
              ref={input}
              value={text}
              onChange={e => {
                setText(e.target.value);
                setActive(-1);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                setOpen(false);
                if (!text) setExpanded(false);
              }}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-label="Search issues and articles"
              aria-expanded={showPanel}
              aria-controls="global-search-results"
              aria-autocomplete="list"
              autoComplete="off"
              spellCheck={false}
              className="h-full w-full min-w-0 bg-transparent font-mono text-xs text-text outline-none focus-visible:shadow-none"
            />
            {text ? null : (
              // Prose in the sans face, the example in mono: an input's own placeholder takes one font.
              <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center">
                <span className="min-w-0 truncate text-xs text-text-muted">
                  {wide ? 'Search issues and articles · ' : 'Search · '}
                  <span className="font-mono">tag: rca</span>
                </span>
              </span>
            )}
          </span>
          <Kbd className={cn('max-lg:hidden', pageHasQueryBar && 'hidden')}>/</Kbd>
        </div>
        {expanded ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close search"
            onMouseDown={e => e.preventDefault()}
            onClick={collapse}
            className="md:hidden"
          >
            <X className="size-icon" />
          </Button>
        ) : null}

        {showPanel ? (
          <div
            id="global-search-results"
            role="listbox"
            aria-busy={Boolean(result) && (typing || search.isFetching)}
            onMouseDown={e => e.preventDefault()}
            className="absolute inset-x-0 top-full z-50 mt-1 max-h-[min(560px,70vh)] overflow-y-auto rounded-lg border bg-raised py-1 shadow-popover aria-busy:is-stale max-md:mx-2"
          >
            {!result && (search.isPending || typing) ? (
              <SearchingRows />
            ) : refusal ? (
              <div className="flex flex-col gap-0.5 px-3 py-2 text-xs">
                <p className="text-danger-fg">{refusal}</p>
                <p className="text-text-secondary">
                  Try plain words, or a field such as <span className="font-mono">tag: rca</span> or{' '}
                  <span className="font-mono">assignee: me</span>.
                </p>
              </div>
            ) : search.isError ? (
              <div className="flex items-center gap-3 px-3 py-1.5">
                <p className="min-w-0 flex-1 text-xs text-danger-fg">Search is unavailable right now.</p>
                <RetryButton onRetry={() => void search.refetch()} size="xs" />
              </div>
            ) : result ? (
              <>
                <Group
                  label="Issues"
                  group={result.issues}
                  other={result.articles}
                  q={q}
                  empty="No issue matches."
                  seeAll={
                    result.issues.total > result.issues.items.length ? (
                      <SeeAll
                        keyWidth={keyWidth}
                        label={`See all ${result.issues.total} issues`}
                        active={chosen === issueCount}
                        onHover={() => setActive(issueCount)}
                        onClick={() => go(listHref('/issues', q))}
                      />
                    ) : null
                  }
                >
                  {result.issues.items.map((issue, i) => (
                    <Row
                      key={issue.key}
                      active={chosen === i}
                      onHover={() => setActive(i)}
                      onClick={() => go(issuePath(issue))}
                    >
                      <TypeBadge type={issue.type} />
                      <span className="flex-none font-mono text-2xs" style={{ width: keyWidth }}>
                        <IssueKey issueKey={issue.key} resolved={issue.resolved} />
                      </span>
                      <span className={cn('min-w-0 flex-1 truncate', issue.resolved && 'text-text-muted line-through')}>
                        {issue.title}
                      </span>
                      <span className="flex flex-none items-center gap-1.5 text-2xs text-text-secondary">
                        <StatusDot category={issue.status.category} color={issue.status.color} />
                        {issue.status.name}
                      </span>
                    </Row>
                  ))}
                </Group>
                <Group
                  label="Articles"
                  group={result.articles}
                  other={result.issues}
                  q={q}
                  empty="No article matches."
                  seeAll={
                    result.articles.total > result.articles.items.length ? (
                      <SeeAll
                        keyWidth={keyWidth}
                        label={`See all ${result.articles.total} articles`}
                        active={chosen === hits.length - 1}
                        onHover={() => setActive(hits.length - 1)}
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
                        active={chosen === i}
                        onHover={() => setActive(i)}
                        onClick={() => go(articlePath(article))}
                        top={Boolean(article.excerpt)}
                      >
                        <span className="flex h-5 w-[18px] flex-none items-center justify-center">
                          <FileText className="size-icon-sm text-text-muted" />
                        </span>
                        <span
                          className="flex h-5 flex-none items-center font-mono text-2xs"
                          style={{ width: keyWidth }}
                        >
                          <IssueKey issueKey={article.project.key} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate">{article.title}</span>
                            {article.status === 'draft' ? <DraftMark /> : null}
                          </span>
                          {article.excerpt ? (
                            <span className="truncate text-2xs text-text-secondary">{article.excerpt}</span>
                          ) : null}
                        </span>
                      </Row>
                    );
                  })}
                </Group>
                <div className="mt-1 flex items-center gap-3 border-t px-3 pt-1.5 pb-0.5 text-2xs text-text-secondary max-md:hidden">
                  {hits.length > 0 ? (
                    <>
                      <FooterKey keys={['↑', '↓']}>move</FooterKey>
                      <FooterKey keys={['↵']}>open</FooterKey>
                    </>
                  ) : null}
                  <FooterKey keys={['Esc']}>close</FooterKey>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
});

function FooterKey({ keys, children }: { keys: string[]; children: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map(k => (
        <Kbd key={k} className="h-4 min-w-4 text-[10px]">
          {k}
        </Kbd>
      ))}
      {children}
    </span>
  );
}

type SearchGroup = GlobalSearchResult['issues'] | GlobalSearchResult['articles'];

// A filter only one group understands (`assignee:` means nothing to articles) is not a mistake in the query.
function notApplicable(group: SearchGroup, other: SearchGroup, q: string): string | null {
  const error = group.error;
  if (!error || other.error || error.code !== 'query.unknown_attribute' || !error.span) return null;
  return q.slice(error.span.start, error.span.end).replace(/:$/, '').trim() || null;
}

function Group({
  label,
  group,
  other,
  q,
  empty,
  seeAll,
  children,
}: {
  label: string;
  group: SearchGroup;
  other: SearchGroup;
  q: string;
  empty: string;
  seeAll: React.ReactNode;
  children: React.ReactNode;
}) {
  const skipped = notApplicable(group, other, q);
  return (
    <div role="group" aria-label={label} className="py-1">
      <div className="flex items-center gap-2 px-3 pt-1 pb-0.5 text-2xs font-medium text-text-secondary">
        <span>{label}</span>
        {group.error ? null : <span className="tabular font-normal text-text-muted">{group.total}</span>}
      </div>
      {skipped ? (
        <p className="px-3 py-1.5 text-xs text-text-secondary">
          {label} have no <span className="font-mono">{skipped}</span>, so none are shown.
        </p>
      ) : group.error ? (
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
  top = false,
  children,
}: {
  active: boolean;
  onHover: () => void;
  onClick: () => void;
  top?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        'flex min-h-[34px] cursor-pointer gap-2.5 px-3 py-1 text-sm',
        top ? 'items-start' : 'items-center',
        // Resolved rows are muted, which is too faint on the selected fill.
        active && 'bg-active [&_.line-through]:text-text-secondary',
      )}
    >
      {children}
    </div>
  );
}

// The label starts on the title column of the rows above it: past the type slot and the key column.
function SeeAll({
  label,
  keyWidth,
  active,
  onHover,
  onClick,
}: {
  label: string;
  keyWidth: string;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
}) {
  return (
    <div
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn('flex h-[30px] cursor-pointer items-center gap-2.5 px-3 text-xs', active && 'bg-active')}
    >
      <span className="w-[18px] flex-none" />
      <span className="flex-none font-mono text-2xs" style={{ width: keyWidth }} />
      <span className="text-brand-text">{label}</span>
    </div>
  );
}

function SearchingRows() {
  return (
    <div aria-label="Searching" className="py-1">
      <div className="px-3 pt-1 pb-0.5">
        <Skeleton className="h-3 w-12" />
      </div>
      {[62, 48, 55].map(width => (
        <div key={width} className="flex min-h-[34px] items-center gap-2.5 px-3 py-1">
          <Skeleton className="size-[18px] flex-none rounded-xs" />
          <Skeleton className="h-3 w-10 flex-none" />
          <Skeleton className="h-3" style={{ width: `${width}%` }} />
        </div>
      ))}
    </div>
  );
}

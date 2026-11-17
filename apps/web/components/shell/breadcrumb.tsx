'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useSearchParams } from 'next/navigation';
import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { parseIssueKey } from '@nothingleft/format';
import { CopyIssueButton } from '@components/issues/copy-issue';
import { useArticle } from '@hooks/use-articles';
import { useIssue } from '@hooks/use-issues';
import { useProject } from '@hooks/use-projects';
import { isReportName, reportDef } from '@lib/reports/registry';
import { cn } from '@lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@components/ui/dropdown-menu';
import { Skeleton } from '@components/ui/skeleton';

// Labels for the flat routes in frontend-guide.md § Routes.
const ROOTS: Record<string, string> = {
  dashboard: 'Home',
  inbox: 'Inbox',
  'my-issues': 'My issues',
  starred: 'Starred',
  issues: 'Issues',
  issue: 'Issues',
  projects: 'Projects',
  organization: 'Organisation',
  settings: 'Settings',
  shortcuts: 'Shortcuts',
  'new-issue': 'New issue',
  board: 'Board',
  articles: 'Knowledge base',
  reports: 'Reports',
  timesheets: 'Timesheets',
};

const SECTIONS: Record<string, string> = {
  issues: 'Issues',
  board: 'Board',
  backlog: 'Backlog',
  reports: 'Reports',
  articles: 'Knowledge base',
  settings: 'Settings',
  import: 'Import',
};

/** `project` marks the crumb that names a project by its key until the name arrives. */
type Crumb = { label: string; href?: Route; mono?: boolean; copy?: boolean; loading?: boolean; project?: boolean };

function crumbsFor(pathname: string): Crumb[] {
  const [first = 'dashboard', ...rest] = pathname.split('/').filter(Boolean);
  const root: Crumb = { label: ROOTS[first] ?? first };

  if (first === 'issue') {
    const parsed = rest[0] ? parseIssueKey(rest[0]) : null;
    if (!parsed) return [root];
    const project = parsed.projectKey;
    return [
      { label: 'Projects', href: '/projects' as Route },
      { label: project, mono: true, project: true, href: `/projects/${project}` as Route },
      { label: 'Issues', href: `/projects/${project}/issues` as Route },
      { label: `${project}-${parsed.number}`, mono: true, copy: true },
    ];
  }

  if (first === 'projects') {
    const [projectKey, section, slug] = rest;
    const crumbs: Crumb[] = [{ ...root, href: '/projects' as Route }];
    if (projectKey) {
      crumbs.push({
        label: projectKey.toUpperCase(),
        mono: true,
        project: true,
        ...(section ? { href: `/projects/${projectKey}` as Route } : {}),
      });
    }
    if (section) {
      const label = SECTIONS[section] ?? section;
      crumbs.push(slug ? { label, href: `/projects/${projectKey}/${section}` as Route } : { label });
    }
    return crumbs;
  }

  if (first === 'issues' && rest[0]) {
    return [
      { ...root, href: '/issues' as Route },
      { label: rest[0].toUpperCase(), mono: true },
    ];
  }

  if (first === 'git') {
    return [
      { label: 'Organisation', href: '/organization' as Route },
      { label: 'Integrations', href: '/organization?tab=integrations' as Route },
      { label: 'GitHub' },
    ];
  }

  if (first === 'reports' && rest[0] && isReportName(rest[0])) {
    return [{ ...root, href: '/reports' as Route }, { label: reportDef(rest[0]).title }];
  }

  return [root];
}

// The route carries the project key; the crumb reads better as the name once it is known.
function useNamedCrumbs(crumbs: Crumb[]): Crumb[] {
  const keyCrumb = crumbs.find(c => c.project);
  const project = useProject(keyCrumb ? keyCrumb.label : null);
  if (!keyCrumb || project.isError) return crumbs;
  if (!project.data) return crumbs.map(c => (c === keyCrumb ? { ...c, loading: true } : c));
  return crumbs.map(c => (c === keyCrumb ? { ...c, label: project.data.name, mono: false } : c));
}

// The same query the issue page runs, so it shares the cache; a key that failed to load has nothing to copy.
function CopyKey({ value }: { value: string }) {
  const issue = useIssue(value);
  if (issue.isError) return null;
  return <CopyIssueButton issueKey={value} title={() => issue.data?.title} />;
}

// An article's crumbs are its place in the tree, read from the article the page already loaded.
function useArticleCrumbs(pathname: string, crumbs: Crumb[]): Crumb[] {
  const [first, projectKey, section, slug] = pathname.split('/').filter(Boolean);
  const deletedView = useSearchParams().get('view') === 'deleted';
  const inKnowledgeBase = first === 'projects' && section === 'articles' && projectKey !== undefined;
  const inArticle = inKnowledgeBase && slug !== undefined;
  const project = projectKey?.toUpperCase() ?? '';
  const article = useArticle(project, inArticle ? decodeURIComponent(slug) : null);
  const base = `/projects/${project}/articles` as Route;
  if (inKnowledgeBase && !inArticle && deletedView) {
    return [...crumbs.slice(0, -1), { label: 'Knowledge base', href: base }, { label: 'Deleted articles' }];
  }
  if (!inArticle) return crumbs;
  // A missing article ends the trail at the knowledge base; its address is not a title.
  if (article.isError) return crumbs.map((c, i) => (i === crumbs.length - 1 ? { label: c.label } : c));
  const trail: Crumb[] = article.data
    ? [
        ...article.data.path.map(p => ({ label: p.title, href: `${base}/${p.slug}` as Route })),
        { label: article.data.title },
      ]
    : [{ label: '', loading: true }];
  return [...crumbs, ...trail];
}

// Past four crumbs the middle ones fold into a menu, so the ones kept stay readable.
const FOLD_AFTER = 4;
const SHORT_LABEL = 14;

type Shown = { kind: 'crumb'; crumb: Crumb } | { kind: 'fold'; crumbs: Crumb[] };

/** `tight` folds the second crumb too, so a long page title is not cut while an ancestor is. */
function fold(crumbs: Crumb[], tight: boolean): Shown[] {
  const shown = (list: Crumb[]): Shown[] => list.map(crumb => ({ kind: 'crumb', crumb }));
  if (crumbs.length <= FOLD_AFTER) return shown(crumbs);
  const kept = tight ? 1 : 2;
  return [
    ...shown(crumbs.slice(0, kept)),
    { kind: 'fold', crumbs: crumbs.slice(kept, -1) },
    ...shown(crumbs.slice(-1)),
  ];
}

// Rough widths at the trail's sizes; a guess is enough to decide whether the full trail fits.
const SEPARATOR_PX = 21;
const LABEL_CAP_PX = 256;
const naturalWidth = (shown: Shown[]) =>
  shown.reduce(
    (sum, item, i) =>
      sum +
      (i > 0 ? SEPARATOR_PX : 0) +
      (item.kind === 'fold'
        ? 20
        : Math.min(LABEL_CAP_PX, item.crumb.label.length * (item.crumb.mono ? 7.2 : 7.6)) + (item.crumb.copy ? 28 : 0)),
    0,
  );

function useRoom(shown: boolean) {
  const ref = useRef<HTMLElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const box = ref.current?.parentElement;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => entry && setRoom(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, [shown]);
  return [ref, room] as const;
}

function FoldMenu({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Show hidden breadcrumbs"
        className="shrink-0 rounded-sm px-1 text-text-secondary hover:bg-bg-hover hover:text-text max-sm:hidden"
      >
        …
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-80">
        {crumbs.map((c, i) =>
          c.href ? (
            <DropdownMenuItem key={`${c.label}-${i}`} asChild>
              <Link href={c.href} className="truncate">
                {c.label}
              </Link>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem key={`${c.label}-${i}`} disabled className="truncate">
              {c.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Breadcrumb() {
  const pathname = usePathname();
  const crumbs = useArticleCrumbs(pathname, useNamedCrumbs(crumbsFor(pathname)));
  const [ref, room] = useRoom(crumbs.length > 1);
  // A top-level page names itself in its own title; the trail starts one level down.
  if (crumbs.length === 1) return null;
  const roomy = fold(crumbs, false);
  const shown = room !== null && naturalWidth(roomy) > room ? fold(crumbs, true) : roomy;
  const last = shown.length - 1;
  return (
    <nav ref={ref} aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 font-medium whitespace-nowrap">
      {shown.map((item, i) => (
        <Fragment key={item.kind === 'fold' ? 'fold' : `${item.crumb.label}-${i}`}>
          {i > 0 ? (
            <span className={cn('shrink-0 text-text-muted max-sm:hidden', i < last && 'max-lg:hidden')}>/</span>
          ) : null}
          {item.kind === 'fold' ? (
            <FoldMenu crumbs={item.crumbs} />
          ) : (
            <CrumbItem crumb={item.crumb} current={i === last} hideBelowLg={i < last - 1} />
          )}
        </Fragment>
      ))}
    </nav>
  );
}

function CrumbItem({ crumb: c, current, hideBelowLg }: { crumb: Crumb; current: boolean; hideBelowLg: boolean }) {
  if (c.loading) {
    return <Skeleton className={cn('h-3.5 w-24 shrink-0 max-sm:hidden', hideBelowLg && 'max-lg:hidden')} />;
  }
  const ancestor = cn(
    'truncate max-sm:hidden',
    c.mono ? 'font-mono text-xs' : 'font-normal',
    // Short labels never shrink; long names give up width before the current page, down to a readable stub.
    c.mono || c.label.length <= SHORT_LABEL ? 'shrink-0' : 'max-w-[16rem] min-w-[11ch] shrink-[1000]',
    hideBelowLg && 'max-lg:hidden',
  );
  return (
    <>
      {c.href && !current ? (
        <Link href={c.href} title={c.label} className={cn(ancestor, 'text-text-secondary hover:text-text')}>
          {c.label}
        </Link>
      ) : (
        <span
          aria-current={current ? 'page' : undefined}
          title={c.label}
          className={current ? cn('max-w-64 min-w-0 truncate', c.mono && 'font-mono text-xs') : ancestor}
        >
          {c.label}
        </span>
      )}
      {c.copy ? <CopyKey value={c.label} /> : null}
    </>
  );
}

'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { Fragment } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { parseIssueKey } from '@nothingleft/format';
import type { Issue } from '@nothingleft/types';
import { CopyIssueButton } from '@components/issues/copy-issue';
import { useArticle } from '@hooks/use-articles';
import { useProject } from '@hooks/use-projects';
import { queryKeys } from '@lib/query/keys';
import { isReportName, reportDef } from '@lib/reports/registry';

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
  git: 'Organisation',
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

type Crumb = { label: string; href?: Route; mono?: boolean; copy?: boolean };

function crumbsFor(pathname: string): Crumb[] {
  const [first = 'dashboard', ...rest] = pathname.split('/').filter(Boolean);
  const root: Crumb = { label: ROOTS[first] ?? first };

  if (first === 'issue') {
    const parsed = rest[0] ? parseIssueKey(rest[0]) : null;
    if (!parsed) return [root];
    const project = parsed.projectKey;
    return [
      { label: 'Projects', href: '/projects' as Route },
      { label: project, mono: true, href: `/projects/${project}` as Route },
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

  if (first === 'reports' && rest[0] && isReportName(rest[0])) {
    return [{ ...root, href: '/reports' as Route }, { label: reportDef(rest[0]).title }];
  }

  return [root];
}

// The route carries the project key; the crumb reads better as the name once it is known.
function useNamedCrumbs(crumbs: Crumb[]): Crumb[] {
  const keyCrumb = crumbs.find(c => c.mono && c.href?.startsWith('/projects/') && c.href.split('/').length === 3);
  const project = useProject(keyCrumb ? keyCrumb.label : null);
  if (!keyCrumb || !project.data) return crumbs;
  return crumbs.map(c => (c === keyCrumb ? { ...c, label: project.data.name, mono: false } : c));
}

function CopyKey({ value }: { value: string }) {
  const client = useQueryClient();
  return <CopyIssueButton issueKey={value} title={() => client.getQueryData<Issue>(queryKeys.issue(value))?.title} />;
}

// An article's crumbs are its place in the tree, read from the article the page already loaded.
function useArticleCrumbs(pathname: string, crumbs: Crumb[]): Crumb[] {
  const [first, projectKey, section, slug] = pathname.split('/').filter(Boolean);
  const inArticle = first === 'projects' && section === 'articles' && slug !== undefined && projectKey !== undefined;
  const project = projectKey?.toUpperCase() ?? '';
  const article = useArticle(project, inArticle ? decodeURIComponent(slug) : null);
  if (!inArticle) return crumbs;
  const base = `/projects/${project}/articles`;
  const trail: Crumb[] = article.data
    ? [
        ...article.data.path.map(p => ({ label: p.title, href: `${base}/${p.slug}` as Route })),
        { label: article.data.title },
      ]
    : [{ label: decodeURIComponent(slug) }];
  return [...crumbs, ...trail];
}

export function Breadcrumb() {
  const pathname = usePathname();
  const crumbs = useArticleCrumbs(pathname, useNamedCrumbs(crumbsFor(pathname)));
  const last = crumbs.length - 1;
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 truncate font-medium">
      {crumbs.map((c, i) => (
        <Fragment key={`${c.label}-${i}`}>
          {i > 0 ? <span className="shrink-0 text-text-muted max-sm:hidden">/</span> : null}
          {c.href && i !== last ? (
            <Link
              href={c.href}
              className={
                c.mono
                  ? 'shrink-0 font-mono text-xs text-text-secondary max-sm:hidden'
                  : 'shrink-0 font-normal text-text-secondary hover:text-text max-sm:hidden'
              }
            >
              {c.label}
            </Link>
          ) : (
            <span
              aria-current={i === last ? 'page' : undefined}
              className={c.mono ? 'truncate font-mono text-xs' : 'truncate'}
            >
              {c.label}
            </span>
          )}
          {c.copy ? <CopyKey value={c.label} /> : null}
        </Fragment>
      ))}
    </nav>
  );
}

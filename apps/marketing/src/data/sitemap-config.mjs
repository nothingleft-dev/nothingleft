// A route is in the sitemap only if it is listed here; bump `lastmod` when its content meaningfully changes.
// The same `lastmod` becomes the page's JSON-LD `dateModified` (src/data/schema-config.ts).
// To drop a page, delete its entry and mark the page `noindex` in schema-config if it must leave search too.

export const SITEMAP_PAGES = {
  '/': { lastmod: '2026-10-07T16:30:00+05:30' },
  '/pricing': { lastmod: '2026-10-07T21:45:00+05:30' },
  '/features/mcp-ai-agents': { lastmod: '2026-10-07T21:45:00+05:30' },
  '/features/issue-tracking': { lastmod: '2026-10-08T00:00:00+05:30' },
  '/features/sprints-kanban-boards': { lastmod: '2026-10-08T00:00:00+05:30' },
  '/features/search-saved-views': { lastmod: '2026-10-08T00:00:00+05:30' },
  '/features/time-tracking': { lastmod: '2026-10-08T00:00:00+05:30' },
  '/features/project-reports': { lastmod: '2026-10-08T00:00:00+05:30' },
  '/features/project-knowledge-base': { lastmod: '2026-10-08T00:00:00+05:30' },
};

export function normalizePath(pathname) {
  return pathname.replace(/(index)?\.html$/, '').replace(/\/+$/, '') || '/';
}

/** The sitemap entry for a full URL, or undefined when the page is excluded. */
export function sitemapEntry(url) {
  return SITEMAP_PAGES[normalizePath(new URL(url).pathname)];
}

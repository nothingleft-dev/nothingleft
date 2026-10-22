// A route is in the sitemap only if it is listed here; bump `lastmod` when its content meaningfully changes.
// The same `lastmod` becomes the page's JSON-LD `dateModified` (src/data/schema-config.ts).
// To drop a page, delete its entry and mark the page `noindex` in schema-config if it must leave search too.

export const SITEMAP_PAGES = {
  '/': { lastmod: '2026-10-22T12:00:00+05:30' },
  '/pricing': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/features/mcp-ai-agents': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/features/issue-tracking': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/features/sprints-kanban-boards': { lastmod: '2026-10-14T08:37:50+05:30' },
  '/features/search-saved-views': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/features/time-tracking': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/features/project-reports': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/features/project-knowledge-base': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/solutions/engineering-teams': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/solutions/product-teams': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/solutions/startups': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/solutions/self-hosting': { lastmod: '2026-10-22T12:00:00+05:30' },
  '/support': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/compare/linear-alternative': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/compare/jira-alternative': { lastmod: '2026-10-22T12:00:00+05:30' },
  '/compare/youtrack-alternative': { lastmod: '2026-10-22T12:00:00+05:30' },
  '/compare/clickup-alternative': { lastmod: '2026-10-22T12:00:00+05:30' },
  '/compare/asana-alternative': { lastmod: '2026-10-22T12:00:00+05:30' },
  '/compare/notion-projects-alternative': { lastmod: '2026-10-22T12:00:00+05:30' },
  '/docs': { lastmod: '2026-10-22T12:00:00+05:30' },
  '/docs/mcp': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/getting-started': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/members': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/limits-and-billing': { lastmod: '2026-10-22T12:00:00+05:30' },
  '/docs/issues': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/custom-fields': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/search': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/agile': { lastmod: '2026-10-14T08:37:50+05:30' },
  '/docs/reports': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/knowledge-base': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/mcp-tools': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/account-security': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/permissions': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/notifications': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/tags': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/import-export': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/storage': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/self-hosting': { lastmod: '2026-10-22T12:00:00+05:30' },
  '/docs/self-hosting-aws': { lastmod: '2026-10-22T12:00:00+05:30' },
  '/docs/keyboard-shortcuts': { lastmod: '2026-10-13T11:11:10+05:30' },
  '/docs/api': { lastmod: '2026-10-13T11:11:10+05:30' },
};

export function normalizePath(pathname) {
  return pathname.replace(/(index)?\.html$/, '').replace(/\/+$/, '') || '/';
}

/** The sitemap entry for a full URL, or undefined when the page is excluded. */
export function sitemapEntry(url) {
  return SITEMAP_PAGES[normalizePath(new URL(url).pathname)];
}

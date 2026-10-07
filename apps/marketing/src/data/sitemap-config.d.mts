export interface SitemapPage {
  lastmod: string;
}
export const SITEMAP_PAGES: Record<string, SitemapPage>;
export function normalizePath(pathname: string): string;
export function sitemapEntry(url: string): SitemapPage | undefined;

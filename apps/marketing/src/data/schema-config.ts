import { HOME_FAQ, type FaqEntry } from '@lib/faq';
import { PRICING_FAQ } from '@lib/pricing';
import { SITE_DESCRIPTION } from '@lib/site';
import { SITEMAP_PAGES } from './sitemap-config.mjs';

export type SchemaNode = 'Organization' | 'WebSite' | 'WebPage' | 'SoftwareApplication' | 'FAQPage' | 'BreadcrumbList';

export interface PageSchema {
  title: string;
  description: string;
  nodes: SchemaNode[];
  breadcrumb?: { name: string; path: string }[];
  faq?: FaqEntry[];
  noindex?: boolean;
}

const HOME_CRUMB = { name: 'Home', path: '/' };

// Every route under src/pages has an entry; Base fails the build for a page without one.
export const SCHEMA_PAGES: Record<string, PageSchema> = {
  '/': {
    title: 'Nothing Left | Project Tracking for People and Agents',
    description: SITE_DESCRIPTION,
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage'],
    faq: HOME_FAQ,
  },
  '/pricing': {
    title: 'Free Project Management Software | Nothing Left',
    description:
      'Try Nothing Left free during beta, whatever your team size. The first 20 members stay free forever. See storage terms and join the beta.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Pricing', path: '/pricing' }],
    faq: PRICING_FAQ,
  },
  '/features/mcp-ai-agents': {
    title: 'Project Management MCP for AI Agents | Nothing Left',
    description:
      "Let AI agents search, create and update issues, sprints, reports and project docs through Nothing Left's MCP tools and shared API.",
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'MCP and AI agents', path: '/features/mcp-ai-agents' }],
  },
};

for (const path of Object.keys(SITEMAP_PAGES)) {
  const schema = SCHEMA_PAGES[path];
  if (!schema) throw new Error(`sitemap-config lists ${path}, which has no entry in schema-config`);
  if (schema.noindex) throw new Error(`${path} is noindex in schema-config but listed in sitemap-config`);
}
for (const [path, schema] of Object.entries(SCHEMA_PAGES)) {
  if (!schema.noindex && !SITEMAP_PAGES[path]) {
    throw new Error(`${path} is indexable but missing from sitemap-config; add it there or mark it noindex`);
  }
}

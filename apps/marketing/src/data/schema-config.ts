import { ISSUE_TRACKING_FAQ } from '@lib/features/issue-tracking';
import { SPRINTS_BOARDS_FAQ } from '@lib/features/sprints-kanban-boards';
import { SEARCH_VIEWS_FAQ } from '@lib/features/search-saved-views';
import { TIME_TRACKING_FAQ } from '@lib/features/time-tracking';
import { PROJECT_REPORTS_FAQ } from '@lib/features/project-reports';
import { KNOWLEDGE_BASE_FAQ } from '@lib/features/project-knowledge-base';
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
  '/features/issue-tracking': {
    title: 'Open Source Issue Tracking Software | Nothing Left',
    description:
      'Track bugs and tasks with clear keys, comments, subtasks, custom fields and history in a focused workspace people and agents can use.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Issue tracking', path: '/features/issue-tracking' }],
    faq: ISSUE_TRACKING_FAQ,
  },
  '/features/sprints-kanban-boards': {
    title: 'Sprints, Backlog and Kanban Boards | Nothing Left',
    description:
      'Plan sprints, order the backlog and track work on flexible boards with story points, WIP warnings and burndown reports.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Sprints and boards', path: '/features/sprints-kanban-boards' }],
    faq: SPRINTS_BOARDS_FAQ,
  },
  '/features/search-saved-views': {
    title: 'Find Issues Fast with Search and Views | Nothing Left',
    description:
      'Search issues and articles with readable filters, save team views, group results and use the same query in reports and MCP tools.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Search and saved views', path: '/features/search-saved-views' }],
    faq: SEARCH_VIEWS_FAQ,
  },
  '/features/time-tracking': {
    title: 'Time Tracking on Issues and Projects | Nothing Left',
    description:
      'Log time on issues, compare estimates with actual work and review project timesheets and time reports without losing task context.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Time tracking', path: '/features/time-tracking' }],
    faq: TIME_TRACKING_FAQ,
  },
  '/features/project-reports': {
    title: 'Project Reports You Can Trace | Nothing Left',
    description:
      'Explore nine issue, sprint and time reports with query filters, drill-downs, CSV export and matching results for AI agents.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Reports', path: '/features/project-reports' }],
    faq: PROJECT_REPORTS_FAQ,
  },
  '/features/project-knowledge-base': {
    title: 'Project Knowledge Base Linked to Issues | Nothing Left',
    description:
      'Keep private runbooks, decisions and onboarding notes beside project issues, with shared tags, search and agent access.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Knowledge base', path: '/features/project-knowledge-base' }],
    faq: KNOWLEDGE_BASE_FAQ,
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

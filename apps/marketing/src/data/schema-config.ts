import { ISSUE_TRACKING_FAQ } from '@lib/features/issue-tracking';
import { SPRINTS_BOARDS_FAQ } from '@lib/features/sprints-kanban-boards';
import { SEARCH_VIEWS_FAQ } from '@lib/features/search-saved-views';
import { TIME_TRACKING_FAQ } from '@lib/features/time-tracking';
import { PROJECT_REPORTS_FAQ } from '@lib/features/project-reports';
import { KNOWLEDGE_BASE_FAQ } from '@lib/features/project-knowledge-base';
import { ENGINEERING_TEAMS_FAQ } from '@lib/solutions/engineering-teams';
import { PRODUCT_TEAMS_FAQ } from '@lib/solutions/product-teams';
import { STARTUPS_FAQ } from '@lib/solutions/startups';
import { SELF_HOSTING_FAQ } from '@lib/solutions/self-hosting';
import { SUPPORT_FAQ } from '@lib/support';
import { LINEAR_FAQ } from '@lib/compare/linear-alternative';
import { JIRA_FAQ } from '@lib/compare/jira-alternative';
import { YOUTRACK_FAQ } from '@lib/compare/youtrack-alternative';
import { CLICKUP_FAQ } from '@lib/compare/clickup-alternative';
import { ASANA_FAQ } from '@lib/compare/asana-alternative';
import { NOTION_PROJECTS_FAQ } from '@lib/compare/notion-projects-alternative';
import { HOME_FAQ, type FaqEntry } from '@lib/faq';
import { PRICING_FAQ } from '@lib/pricing';
import { SITE_DESCRIPTION } from '@lib/site';
import { SITEMAP_PAGES } from './sitemap-config.mjs';

export type SchemaNode =
  'Organization' | 'WebSite' | 'WebPage' | 'SoftwareApplication' | 'FAQPage' | 'BreadcrumbList' | 'TechArticle';

export interface PageSchema {
  title: string;
  description: string;
  nodes: SchemaNode[];
  breadcrumb?: { name: string; path: string }[];
  faq?: FaqEntry[];
  noindex?: boolean;
  /** A doc article's own title, when the page title adds the site name. */
  headline?: string;
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
  '/solutions/engineering-teams': {
    title: 'Project Tracking for Engineering Teams | Nothing Left',
    description:
      'Give engineers a clear issue list, backlog, sprint board and searchable project context that their AI coding agents can use too.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Engineering teams', path: '/solutions/engineering-teams' }],
    faq: ENGINEERING_TEAMS_FAQ,
  },
  '/solutions/product-teams': {
    title: 'Product Backlogs and Decisions | Nothing Left',
    description:
      'Prioritize a product backlog, plan sprints and keep decisions beside the issues they affect, with reports that lead back to the work.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Product teams', path: '/solutions/product-teams' }],
    faq: PRODUCT_TEAMS_FAQ,
  },
  '/solutions/startups': {
    title: 'Focused Project Tracking for Startups | Nothing Left',
    description:
      'Start with issues, add sprints and reports as you grow, and give your AI tools useful access. Join the free Nothing Left beta.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Startups', path: '/solutions/startups' }],
    faq: STARTUPS_FAQ,
  },
  '/solutions/self-hosting': {
    title: 'Self-Host Nothing Left | Open Source Project Tracking',
    description:
      'Run the same AGPL project tracker from your own infrastructure, with PostgreSQL, S3-compatible storage and an MCP surface for agents.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Self-hosting', path: '/solutions/self-hosting' }],
    faq: SELF_HOSTING_FAQ,
    // Out of search until the install guide ships with launch.
    noindex: true,
  },
  '/support': {
    title: 'Nothing Left Support | Docs, Feedback and Contact',
    description:
      'Get help with Nothing Left, report a bug, share beta feedback or contact the team. Start with the docs or send a focused request.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Support', path: '/support' }],
    faq: SUPPORT_FAQ,
  },
  '/compare/linear-alternative': {
    title: 'Open Source Linear Alternative | Nothing Left',
    description:
      'Compare Nothing Left with Linear on issues, sprints, agent access, time logs, reports, pricing posture and self-hosting.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Linear alternative', path: '/compare/linear-alternative' }],
    faq: LINEAR_FAQ,
  },
  '/compare/jira-alternative': {
    title: 'Open Source Jira Alternative | Nothing Left',
    description:
      'Compare a simpler tracker with Jira on issues, sprints, reports, custom fields, agents and administration tradeoffs.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Jira alternative', path: '/compare/jira-alternative' }],
    faq: JIRA_FAQ,
  },
  '/compare/youtrack-alternative': {
    title: 'YouTrack Alternative for Growing Teams | Nothing Left',
    description:
      'Compare Nothing Left with YouTrack on issues, agile boards, search, time, knowledge base, MCP, hosting and setup depth.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'YouTrack alternative', path: '/compare/youtrack-alternative' }],
    faq: YOUTRACK_FAQ,
  },
  '/compare/clickup-alternative': {
    title: 'Open Source ClickUp Alternative | Nothing Left',
    description:
      "Compare a focused issue and sprint tracker with ClickUp's broad workspace on tasks, docs, time, reports, AI and setup.",
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'ClickUp alternative', path: '/compare/clickup-alternative' }],
    faq: CLICKUP_FAQ,
  },
  '/compare/asana-alternative': {
    title: 'Open Source Asana Alternative | Nothing Left',
    description:
      'Compare Nothing Left and Asana for engineering work, including issues, sprint planning, agent access, reports and team fit.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Asana alternative', path: '/compare/asana-alternative' }],
    faq: ASANA_FAQ,
  },
  '/compare/notion-projects-alternative': {
    title: 'Notion Projects Alternative | Nothing Left',
    description:
      'Compare Notion Projects with a dedicated issue tracker for bugs, sprints, reports, project docs and AI-agent workflows.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'SoftwareApplication', 'FAQPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Notion Projects alternative', path: '/compare/notion-projects-alternative' }],
    faq: NOTION_PROJECTS_FAQ,
  },
  '/docs': {
    title: 'Docs | Nothing Left',
    description:
      'Guides for Nothing Left: issues, search, sprints, reports, the knowledge base, account security and connecting an AI agent over MCP.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Docs', path: '/docs' }],
  },
  '/docs/mcp': {
    title: 'Connecting an AI Agent over MCP | Nothing Left Docs',
    headline: 'Connecting an AI agent',
    description:
      'Create a personal access token, connect Claude Code, Claude Desktop, Codex, Cursor or another MCP client, and see what an agent can do in Nothing Left.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Docs', path: '/docs' }, { name: 'Connecting an AI agent', path: '/docs/mcp' }],
  },
  '/docs/getting-started': {
    title: 'Getting started | Nothing Left Docs',
    headline: 'Getting started',
    description:
      'Sign up, name your organisation, create the first project and invite your team, or try Nothing Left on your own first.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [
      HOME_CRUMB,
      { name: 'Docs', path: '/docs' },
      { name: 'Getting started', path: '/docs/getting-started' },
    ],
  },
  '/docs/members': {
    title: 'Members | Nothing Left Docs',
    headline: 'Members',
    description:
      'Invite people by email or link, change their roles, remove them, and how invitations and the 20 free members work.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Docs', path: '/docs' }, { name: 'Members', path: '/docs/members' }],
  },
  '/docs/limits-and-billing': {
    title: 'Limits and billing | Nothing Left Docs',
    headline: 'Limits and billing',
    description:
      'What the beta includes, the first 20 members free forever, file storage limits and warnings, and other limits that apply to every organisation.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [
      HOME_CRUMB,
      { name: 'Docs', path: '/docs' },
      { name: 'Limits and billing', path: '/docs/limits-and-billing' },
    ],
  },
  '/docs/issues': {
    title: 'Issues | Nothing Left Docs',
    headline: 'Issues',
    description:
      'Keys, fields, statuses, subtasks and links, comments, attachments, time tracking, history, and deleting and restoring issues in Nothing Left.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Docs', path: '/docs' }, { name: 'Issues', path: '/docs/issues' }],
  },
  '/docs/custom-fields': {
    title: 'Custom fields | Nothing Left Docs',
    headline: 'Custom fields',
    description:
      'Add select, number, date, text and people fields to a project, scope them to issue types, and use them in search, reports and CSV export.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Docs', path: '/docs' }, { name: 'Custom fields', path: '/docs/custom-fields' }],
  },
  '/docs/search': {
    title: 'Searching for issues | Nothing Left Docs',
    headline: 'Searching for issues',
    description:
      'The search language behind the search bar, saved views, reports and agents: fields, shortcuts, people, dates, custom fields and errors.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Docs', path: '/docs' }, { name: 'Searching for issues', path: '/docs/search' }],
  },
  '/docs/agile': {
    title: 'Sprints, backlog and boards | Nothing Left Docs',
    headline: 'Sprints, backlog and boards',
    description:
      'Order the backlog, plan and finish sprints, set story points, and shape boards with columns, swimlanes and WIP limits.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [
      HOME_CRUMB,
      { name: 'Docs', path: '/docs' },
      { name: 'Sprints, backlog and boards', path: '/docs/agile' },
    ],
  },
  '/docs/reports': {
    title: 'Reports | Nothing Left Docs',
    headline: 'Reports',
    description:
      'The nine reports, what each one counts, how to scope them by project, view or query, drill into issues and export CSV.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Docs', path: '/docs' }, { name: 'Reports', path: '/docs/reports' }],
  },
  '/docs/knowledge-base': {
    title: 'Knowledge base | Nothing Left Docs',
    headline: 'Knowledge base',
    description:
      'Write runbooks, decisions and onboarding notes beside your issues: drafts and publishing, the article tree, tags, links and search.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Docs', path: '/docs' }, { name: 'Knowledge base', path: '/docs/knowledge-base' }],
  },
  '/docs/mcp-tools': {
    title: 'MCP tool reference | Nothing Left Docs',
    headline: 'MCP tool reference',
    description:
      'Every MCP tool, resource and prompt Nothing Left offers to AI agents, with its arguments and the scope it needs.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Docs', path: '/docs' }, { name: 'MCP tool reference', path: '/docs/mcp-tools' }],
  },
  '/docs/account-security': {
    title: 'Account security | Nothing Left Docs',
    headline: 'Account security',
    description:
      'Passwords, two-factor authentication, recovery codes, signed-in devices, access tokens, and deactivating or erasing an account.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [
      HOME_CRUMB,
      { name: 'Docs', path: '/docs' },
      { name: 'Account security', path: '/docs/account-security' },
    ],
  },
  '/docs/permissions': {
    title: 'Roles and permissions | Nothing Left Docs',
    headline: 'Roles and permissions',
    description:
      'The five built-in roles, what each can do across projects, issues, sprints, the knowledge base and agents, and what is deliberately not built.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [
      HOME_CRUMB,
      { name: 'Docs', path: '/docs' },
      { name: 'Roles and permissions', path: '/docs/permissions' },
    ],
  },
  '/docs/notifications': {
    title: 'Notifications | Nothing Left Docs',
    headline: 'Notifications',
    description:
      'Your inbox, which events notify you, watching issues, email and daily digests, and how to change your notification preferences.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Docs', path: '/docs' }, { name: 'Notifications', path: '/docs/notifications' }],
  },
  '/docs/storage': {
    title: 'Storage | Nothing Left Docs',
    headline: 'Storage',
    description:
      'How file storage works: the 5 GB platform limit, usage warnings, finding what takes space, and connecting your own R2 or S3 bucket.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Docs', path: '/docs' }, { name: 'Storage', path: '/docs/storage' }],
  },
  '/docs/keyboard-shortcuts': {
    title: 'Keyboard shortcuts | Nothing Left Docs',
    headline: 'Keyboard shortcuts',
    description: 'Every keyboard shortcut in Nothing Left, page by page, from the search bar to the board.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [
      HOME_CRUMB,
      { name: 'Docs', path: '/docs' },
      { name: 'Keyboard shortcuts', path: '/docs/keyboard-shortcuts' },
    ],
  },
  '/docs/api': {
    title: 'REST API Reference | Nothing Left Docs',
    headline: 'API reference',
    description:
      'The Nothing Left REST API, the same one the web app and the MCP server use: endpoints, parameters, responses and errors, from the published OpenAPI document.',
    nodes: ['Organization', 'WebSite', 'WebPage', 'TechArticle', 'BreadcrumbList'],
    breadcrumb: [HOME_CRUMB, { name: 'Docs', path: '/docs' }, { name: 'API reference', path: '/docs/api' }],
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

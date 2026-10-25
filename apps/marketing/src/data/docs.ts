export interface DocLink {
  slug: string;
  label: string;
}

export interface DocGroup {
  title: string;
  description: string;
  docs: DocLink[];
}

export const DOC_GROUPS: DocGroup[] = [
  {
    title: 'Getting started',
    description: 'Sign up, create a project, bring your team and know what the beta includes.',
    docs: [
      { slug: 'getting-started', label: 'Getting started' },
      { slug: 'members', label: 'Members and invitations' },
      { slug: 'limits-and-billing', label: 'Limits and billing' },
    ],
  },
  {
    title: 'Issues and planning',
    description: 'File and shape issues, find them again, plan sprints and read the reports.',
    docs: [
      { slug: 'issues', label: 'Issues' },
      { slug: 'custom-fields', label: 'Custom fields' },
      { slug: 'tags', label: 'Tags' },
      { slug: 'search', label: 'Search and saved views' },
      { slug: 'agile', label: 'Sprints, backlog and boards' },
      { slug: 'reports', label: 'Reports' },
    ],
  },
  {
    title: 'Knowledge',
    description: 'Runbooks, decisions and notes that live beside the issues they explain.',
    docs: [{ slug: 'knowledge-base', label: 'Knowledge base' }],
  },
  {
    title: 'Development',
    description: 'Connect GitHub or GitLab, see the work on the issue, and let merges move its status.',
    docs: [
      { slug: 'git', label: 'GitHub and GitLab' },
      { slug: 'automations', label: 'Automations' },
    ],
  },
  {
    title: 'Agents',
    description: 'Connect an AI agent over MCP and see every tool it can call.',
    docs: [
      { slug: 'mcp', label: 'Connecting an AI agent' },
      { slug: 'mcp-tools', label: 'MCP tool reference' },
    ],
  },
  {
    title: 'Account and admin',
    description: 'Sign-in and two-factor, roles, notifications, file storage, import and export.',
    docs: [
      { slug: 'account-security', label: 'Account security' },
      { slug: 'permissions', label: 'Roles and permissions' },
      { slug: 'notifications', label: 'Notifications' },
      { slug: 'storage', label: 'Files and storage' },
      { slug: 'import-export', label: 'Import and export' },
    ],
  },
  {
    title: 'Self-hosting',
    description: 'Run the whole app yourself, on one machine with Docker Compose or on AWS.',
    docs: [
      { slug: 'self-hosting', label: 'Self-hosting with Docker Compose' },
      { slug: 'self-hosting-aws', label: 'Deploying on AWS' },
    ],
  },
  {
    title: 'Reference',
    description: 'Shortcuts for every page, and the REST API the app and agents share.',
    docs: [
      { slug: 'keyboard-shortcuts', label: 'Keyboard shortcuts' },
      { slug: 'api', label: 'API reference' },
    ],
  },
];

export const DOC_ORDER: DocLink[] = DOC_GROUPS.flatMap(group => group.docs);
export const DOC_SLUGS: string[] = DOC_ORDER.map(doc => doc.slug);

export const PUBLISHED_DOCS = new Set<string>(DOC_SLUGS);

export const isPublished = (slug: string) => PUBLISHED_DOCS.has(slug);
export const docPath = (slug: string) => `/docs/${slug}`;
export const docSourcePath = (slug: string) => `docs/manual/${slug}.md`;

// One link-preview card per route, rendered to /og/<slug>.png at build time by src/pages/og/[slug].png.ts.
// Pages without an entry use the home card. Text mirrors each page's hero: the card is the hero, cropped.
export interface HeadlineCard {
  template: 'headline';
  eyebrow: string;
  title: string;
  end?: string;
  lede: string;
  alt: string;
}

export interface SampleCard {
  template: 'sample';
  eyebrow: string;
  title: string;
  alt: string;
}

export interface SolutionCard {
  template: 'solution';
  category: string;
  title: string;
  lede: [string, string];
  stats: { value: string; unit?: string; label: string }[];
  alt: string;
}

export interface CompareCard {
  template: 'compare';
  competitor: string;
  competitorHeading: string;
  title: string;
  lede: string;
  competitorPoints: [string, string, string];
  nothingLeftPoints: [string, string, string];
  alt: string;
}

export interface DocCard {
  template: 'doc';
  title: string;
  lede: string;
  alt?: string;
}

export type OgCard = HeadlineCard | SampleCard | SolutionCard | CompareCard | DocCard;

const doc = (title: string, lede: string): DocCard => ({ template: 'doc', title, lede });

export const OG_CARDS: Record<string, OgCard> & { '/': OgCard } = {
  '/': {
    template: 'headline',
    eyebrow: 'Open-source project tracking for product and engineering teams',
    title: 'Nothing left hanging',
    lede: 'Track issues, plan sprints and keep project decisions together. Connect your AI agent to find and update work with the permissions you choose.',
    alt: 'Nothing Left: Nothing left hanging. Open-source project tracking for product and engineering teams.',
  },
  '/pricing': {
    template: 'headline',
    eyebrow: 'Pricing',
    title: 'Free during beta, whatever your team size',
    lede: 'Join with a team of any size and pay no subscription while Nothing Left is in beta. When billing arrives, the first 20 members of every organisation stay free.',
    alt: 'Nothing Left pricing: Free during beta, whatever your team size.',
  },
  '/support': {
    template: 'headline',
    eyebrow: 'Support',
    title: 'What can we help with',
    end: '?',
    lede: 'Look it up in the docs, report a problem, or ask whether Nothing Left fits your team. You do not need an account for any of it.',
    alt: 'Nothing Left support: What can we help with?',
  },

  '/features/issue-tracking': {
    template: 'sample',
    eyebrow: 'Issue tracking',
    title: 'Every issue has an owner, history and next step',
    alt: 'Nothing Left issue tracking: Every issue has an owner, history and next step.',
  },
  '/features/mcp-ai-agents': {
    template: 'sample',
    eyebrow: 'MCP and AI agents',
    title: 'Give your agent the same project context your team sees',
    alt: 'Nothing Left: Give your agent the same project context your team sees.',
  },
  '/features/project-knowledge-base': {
    template: 'sample',
    eyebrow: 'Knowledge base',
    title: 'Keep the fix and the reason it worked together',
    alt: 'Nothing Left knowledge base: Keep the fix and the reason it worked together.',
  },
  '/features/project-reports': {
    template: 'sample',
    eyebrow: 'Reports',
    title: 'A chart should lead back to the work',
    alt: 'Nothing Left project reports: A chart should lead back to the work.',
  },
  '/features/search-saved-views': {
    template: 'sample',
    eyebrow: 'Search and saved views',
    title: 'Ask for the exact slice of work',
    alt: 'Nothing Left search and saved views: Ask for the exact slice of work.',
  },
  '/features/sprints-kanban-boards': {
    template: 'sample',
    eyebrow: 'Sprints and boards',
    title: 'Plan a sprint. See exactly what moved',
    alt: 'Nothing Left sprints and boards: Plan a sprint. See exactly what moved.',
  },
  '/features/time-tracking': {
    template: 'sample',
    eyebrow: 'Time tracking',
    title: 'Time belongs to the work it explains',
    alt: 'Nothing Left time tracking: Time belongs to the work it explains.',
  },
  '/features/git-integration': {
    template: 'sample',
    eyebrow: 'GitHub and GitLab',
    title: 'The pull request shows up on the issue it fixes',
    alt: 'Nothing Left GitHub and GitLab integration: The pull request shows up on the issue it fixes.',
  },

  '/solutions/engineering-teams': {
    template: 'solution',
    category: 'Engineering teams',
    title: 'Keep engineering work clear from report to resolution',
    lede: [
      'A bug gets a key, an owner, a sprint and a history the whole team can read.',
      'Developers work from the keyboard; AI agents read through documented tools.',
    ],
    stats: [
      { value: '100', unit: '%', label: 'MCP tool parity' },
      { value: '< 30', unit: 'ms', label: 'Keyboard latency' },
      { value: '5 ', unit: 'roles', label: 'Zero admin overhead' },
    ],
    alt: 'Nothing Left for engineering teams: Keep engineering work clear from report to resolution.',
  },
  '/solutions/product-teams': {
    template: 'solution',
    category: 'Product teams',
    title: 'Keep the decision beside the issue',
    lede: [
      'Group the backlog by priority or custom fields, and save views for planning meetings.',
      'Move picks into a sprint and document the rationale beside each issue.',
    ],
    stats: [
      { value: '1 ', unit: 'click', label: 'Saved views and triage' },
      { value: '9 ', unit: 'reports', label: 'Burndown, Gantt and time' },
      { value: '0 ', unit: 'seats', label: 'Agent seat tax' },
    ],
    alt: 'Nothing Left for product teams: Keep the decision beside the issue.',
  },
  '/solutions/self-hosting': {
    template: 'solution',
    category: 'Self-hosting',
    title: 'Run the tracker and agent interface on your own infrastructure',
    lede: [
      'Open source under AGPL-3.0. Runs the exact same build as the hosted service:',
      'web app, unified MCP API, PostgreSQL, Redis and S3-compatible storage.',
    ],
    stats: [
      { value: 'AGPL', unit: '-3.0', label: 'Open source license' },
      { value: '1 ', unit: 'command', label: 'Docker Compose up' },
      { value: '100', unit: '%', label: 'Local data ownership' },
    ],
    alt: 'Self-host Nothing Left: Run the tracker and agent interface on your own infrastructure.',
  },
  '/solutions/startups': {
    template: 'solution',
    category: 'Startups and growing teams',
    title: 'Start with work, not settings',
    lede: [
      'Sign up, name your organisation and create a first project in seconds.',
      'Seeded defaults for statuses, priorities and boards let your team ship today.',
    ],
    stats: [
      { value: '20 ', unit: 'users', label: 'Free forever in beta' },
      { value: '1 ', unit: 'min', label: 'Initial setup overhead' },
      { value: '100', unit: '%', label: 'Unlimited projects' },
    ],
    alt: 'Nothing Left for startups: Start with work, not settings.',
  },

  '/compare/linear-alternative': {
    template: 'compare',
    competitor: 'Linear',
    competitorHeading: 'Traditional PM (Linear / Jira)',
    title: 'The modern alternative to Linear for agent-first teams',
    lede: 'Why engineering teams building with LLMs are choosing an open MCP foundation.',
    competitorPoints: [
      'Proprietary APIs without a unified MCP server',
      'Per-seat billing penalises AI agent workers',
      'Closed source, vendor-locked database',
    ],
    nothingLeftPoints: [
      '100% MCP tool parity: agents do what humans do',
      'First 20 users free forever, zero agent seat tax',
      'Open AGPL-3.0 with one-command self-hosting',
    ],
    alt: 'Nothing Left: The modern alternative to Linear for agent-first teams.',
  },
  '/compare/jira-alternative': {
    template: 'compare',
    competitor: 'Jira',
    competitorHeading: 'Traditional PM (Jira)',
    title: 'Keep the issue, backlog and report; skip the workflow engine',
    lede: 'Why software teams choose lightweight tracking over heavy Jira administration.',
    competitorPoints: [
      'Rigid transition engines, schemes and complex maintenance',
      'Heavy multi-tier permission matrices and a sluggish UI',
      'Expensive per-seat pricing with cloud lock-in',
    ],
    nothingLeftPoints: [
      'Any status follows any status: zero rigid workflows',
      '5 fixed roles, one search language and a shared MCP server',
      'Dense 36px keyboard-driven UI with instant triage',
    ],
    alt: 'Nothing Left versus Jira: Keep the issue, backlog and report; skip the workflow engine.',
  },
  '/compare/clickup-alternative': {
    template: 'compare',
    competitor: 'ClickUp',
    competitorHeading: 'Traditional PM (ClickUp)',
    title: 'A focused issue tracker, not a workspace for everything',
    lede: 'Built for software teams that run on issues, sprints and AI agents.',
    competitorPoints: [
      'All-in-one workspace bloat (docs, whiteboards, chat)',
      'Deep nested folder hierarchies that slow down work',
      'Complex proprietary cloud with heavy configuration',
    ],
    nothingLeftPoints: [
      'Pure engineering issue tracker with zero feature bloat',
      'Flat project backlogs, agile boards and instant shortcuts',
      'Native time tracking and open AGPL-3.0 self-hosting',
    ],
    alt: 'Nothing Left versus ClickUp: A focused issue tracker, not a workspace for everything.',
  },
  '/compare/asana-alternative': {
    template: 'compare',
    competitor: 'Asana',
    competitorHeading: 'Traditional PM (Asana)',
    title: 'Engineering work needs more than a general task list',
    lede: 'When the work is bugs and sprints, you need technical issue keys and estimates.',
    competitorPoints: [
      'General task lists lacking issue keys and severity badges',
      'No native engineering burndown, velocity or story points',
      'No dedicated Model Context Protocol (MCP) server',
    ],
    nothingLeftPoints: [
      'Technical issue model: keys (NL-104), badges and history',
      '9 built-in engineering reports with CSV export and burndown',
      'Full MCP server parity: agents share the human API',
    ],
    alt: 'Nothing Left versus Asana: Engineering work needs more than a general task list.',
  },
  '/compare/youtrack-alternative': {
    template: 'compare',
    competitor: 'YouTrack',
    competitorHeading: 'Traditional PM (YouTrack)',
    title: "A simpler choice for teams that use YouTrack's core",
    lede: 'Covering issues, boards and time tracking without JVM or script maintenance.',
    competitorPoints: [
      'Heavy Java/JVM runtime with high server RAM usage',
      'Massive configuration surface and custom JS script workflows',
      'High administrative burden for small engineering teams',
    ],
    nothingLeftPoints: [
      'Lightweight TypeScript stack with a tiny resource footprint',
      'Issues, boards, time logs and docs with zero config fatigue',
      'Five fixed roles, clean Docker Compose and open AGPL-3.0',
    ],
    alt: "Nothing Left: A simpler choice for teams that use YouTrack's core.",
  },
  '/compare/notion-projects-alternative': {
    template: 'compare',
    competitor: 'Notion Projects',
    competitorHeading: 'Traditional PM (Notion Projects)',
    title: 'Keep flexibility for notes; give delivery a dedicated model',
    lede: 'Why teams keep notes in docs, but move sprint delivery into a purpose-built tracker.',
    competitorPoints: [
      'Generic database tables with manual rollup formulas',
      'Performance slows on large backlogs and dense lists',
      'No native time tracking against estimates or burndowns',
    ],
    nothingLeftPoints: [
      'Purpose-built issue model with rigid keys and sprint states',
      'High-density 36px hairline rows built for keyboard speed',
      'Native time logs, burndown tracking and dedicated MCP tools',
    ],
    alt: 'Nothing Left versus Notion Projects: Keep flexibility for notes; give delivery a dedicated model.',
  },

  '/docs': doc('Find your way around Nothing Left', 'Guides for your team, your projects, and your AI agents.'),
  '/docs/getting-started': doc('Getting started', 'From sign-up to your first issue in four short steps.'),
  '/docs/members': doc('Members', 'One handle per person, invitations, and who belongs where.'),
  '/docs/limits-and-billing': doc('Limits and billing', 'What your organisation can use, and what the beta includes.'),
  '/docs/issues': doc('Issues', 'Track the work, the discussion, and the decisions.'),
  '/docs/custom-fields': doc('Custom fields', 'Add the information your team needs to every issue.'),
  '/docs/tags': doc('Tags', 'One vocabulary for every project, shared by issues and pages.'),
  '/docs/search': doc('Searching for issues', 'One search language for the bar, saved views and boards.'),
  '/docs/agile': doc('Sprints, backlog and boards', 'Plan in sprints, order the backlog, follow it on a board.'),
  '/docs/reports': doc('Reports', 'Nine reports that lead back to the work behind them.'),
  '/docs/knowledge-base': doc('Knowledge base', 'Runbooks, decisions and notes beside the issues they explain.'),
  '/docs/git': doc('GitHub and GitLab', 'Branches, commits and pull requests on the issue they mention.'),
  '/docs/automations': doc('Automations', 'Let a merge or a closed pull request move the status for you.'),
  '/docs/mcp': doc('Connecting an AI agent', 'Give an AI agent the project context your team sees.'),
  '/docs/mcp-tools': doc('MCP tool reference', 'Every tool an agent can call, and what each one does.'),
  '/docs/account-security': doc('Account security', 'Two-factor, deactivation and transferring what you own.'),
  '/docs/permissions': doc('Roles and permissions', 'Five fixed roles and what each one can do.'),
  '/docs/notifications': doc('Notifications', 'An inbox for what needs you: assignments, mentions and replies.'),
  '/docs/storage': doc('Storage', 'Where your files live, how much room they take, and your own bucket.'),
  '/docs/import-export': doc(
    'Import and export',
    'Bring work in from a spreadsheet; take everything out in one download.',
  ),
  '/docs/self-hosting': doc('Self-hosting with Docker Compose', 'The whole app on one machine, with one command.'),
  '/docs/self-hosting-aws': doc('Deploying on AWS', 'Containers on ECS with managed Postgres, Redis and S3.'),
  '/docs/keyboard-shortcuts': doc('Keyboard shortcuts', 'Every shortcut on every page, one keypress away.'),
  '/docs/api': doc('API reference', 'The REST API the web app and MCP tools share.'),
};

export const ogImageAlt = (card: OgCard): string => card.alt ?? `Nothing Left documentation: ${card.title}.`;

export const ogImageSlug = (path: string) => (path === '/' ? 'home' : path.slice(1).replace(/\//g, '-'));

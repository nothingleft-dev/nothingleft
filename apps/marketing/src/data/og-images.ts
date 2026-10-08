// Published cards in https://static.nothingleft.dev/marketing/.
// Add a route here after uploading its PNG; filenames use ogImageSlug in page-meta.
// Pages without a dedicated card use the home image and its matching alt text.
export const OG_IMAGE_ALTS: Record<string, string> & { '/': string } = {
  '/': 'Nothing Left: Nothing left hanging. Open-source project tracking for product and engineering teams.',
  '/pricing': 'Nothing Left pricing: Free during beta, whatever your team size.',
  '/support': 'Nothing Left support: What can we help with?',
  '/features/mcp-ai-agents': 'Nothing Left: Give your agent the same project context your team sees.',
  '/features/issue-tracking': 'Nothing Left issue tracking: Every issue has an owner, history and next step.',
  '/features/sprints-kanban-boards': 'Nothing Left sprints and boards: Plan a sprint. See exactly what moved.',
  '/features/search-saved-views': 'Nothing Left search and saved views: Ask for the exact slice of work.',
  '/features/time-tracking': 'Nothing Left time tracking: Time belongs to the work it explains.',
  '/features/project-reports': 'Nothing Left project reports: A chart should lead back to the work.',
  '/features/project-knowledge-base': 'Nothing Left knowledge base: Keep the fix and the reason it worked together.',
  '/solutions/engineering-teams':
    'Nothing Left for engineering teams: Keep engineering work clear from report to resolution.',
  '/solutions/product-teams': 'Nothing Left for product teams: Keep the decision beside the issue.',
  '/solutions/startups': 'Nothing Left for startups: Start with work, not settings.',
  '/solutions/self-hosting': 'Self-host Nothing Left: Run the tracker and agent interface on your own infrastructure.',
  '/compare/asana-alternative': 'Nothing Left versus Asana: Engineering work needs more than a general task list.',
  '/compare/clickup-alternative':
    'Nothing Left versus ClickUp: A focused issue tracker, not a workspace for everything.',
  '/compare/jira-alternative':
    'Nothing Left versus Jira: Keep the issue, backlog and report; skip the workflow engine.',
  '/compare/linear-alternative': 'Nothing Left: The modern alternative to Linear for agent-first teams.',
  '/compare/notion-projects-alternative':
    'Nothing Left versus Notion Projects: Keep flexibility for notes; give delivery a dedicated model.',
  '/compare/youtrack-alternative': "Nothing Left: A simpler choice for teams that use YouTrack's core.",
  '/docs': 'Nothing Left documentation: Find your way around Nothing Left.',
  '/docs/getting-started': 'Nothing Left documentation: Getting started.',
  '/docs/members': 'Nothing Left documentation: Members.',
  '/docs/limits-and-billing': 'Nothing Left documentation: Limits and billing.',
  '/docs/issues': 'Nothing Left documentation: Issues.',
  '/docs/custom-fields': 'Nothing Left documentation: Custom fields.',
  '/docs/search': 'Nothing Left documentation: Searching for issues.',
  '/docs/agile': 'Nothing Left documentation: Sprints, backlog and boards.',
  '/docs/reports': 'Nothing Left documentation: Reports.',
  '/docs/knowledge-base': 'Nothing Left documentation: Knowledge base.',
  '/docs/mcp': 'Nothing Left documentation: Connecting an AI agent.',
  '/docs/mcp-tools': 'Nothing Left documentation: MCP tool reference.',
  '/docs/account-security': 'Nothing Left documentation: Account security.',
  '/docs/permissions': 'Nothing Left documentation: Roles and permissions.',
  '/docs/notifications': 'Nothing Left documentation: Notifications.',
  '/docs/storage': 'Nothing Left documentation: Storage.',
  '/docs/keyboard-shortcuts': 'Nothing Left documentation: Keyboard shortcuts.',
  '/docs/api': 'Nothing Left documentation: API reference.',
};

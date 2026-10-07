import type { FaqEntry } from '@lib/faq';
import type { AgentRequest } from '@lib/mcp';

export const KB_MANUAL_PATH = '/docs/manual/knowledge-base';

export interface TreeArticle {
  title: string;
  level: 1 | 2 | 3;
  draft?: boolean;
  open?: boolean;
  folded?: boolean;
}

export const TREE: TreeArticle[] = [
  { title: 'Billing sync', level: 1 },
  { title: 'Architecture overview', level: 2 },
  { title: 'Runbooks', level: 2 },
  { title: 'Restoring a failed sync', level: 3, open: true },
  { title: 'Rotating partner keys', level: 3, draft: true },
  { title: 'Decisions', level: 1 },
  { title: 'Invitation links and expiry', level: 2 },
  { title: 'Onboarding', level: 1, folded: true },
];

export const TAGS_IN_USE = [
  { tag: 'decision', count: 1 },
  { tag: 'invitations', count: 1 },
  { tag: 'onboarding', count: 2 },
  { tag: 'runbook', count: 2 },
  { tag: 'sync-outage', count: 1 },
];

export type Access = 'Yes' | 'Own' | 'No';

export const ACCESS_ROWS: { action: string; observer: Access; contributor: Access; admin: Access }[] = [
  { action: 'Read published articles', observer: 'Yes', contributor: 'Yes', admin: 'Yes' },
  { action: 'Read drafts', observer: 'No', contributor: 'Own', admin: 'Yes' },
  { action: 'Create, edit, publish, move', observer: 'No', contributor: 'Yes', admin: 'Yes' },
  { action: 'Delete articles', observer: 'No', contributor: 'Own', admin: 'Yes' },
  { action: 'Comment, tag', observer: 'No', contributor: 'Yes', admin: 'Yes' },
  { action: 'Star and watch', observer: 'Yes', contributor: 'Yes', admin: 'Yes' },
];

export const AGENT_REQUESTS: AgentRequest[] = [
  {
    area: 'Read before acting',
    prompt: 'What did we decide about expired invite links? Then look at ACME-12.',
    calls: [{ tool: 'search_articles', args: 'invite expiry' }, { tool: 'get_article' }, { tool: 'get_issue' }],
    note: 'get_article returns the article as Markdown. A client that supports resources can attach article://ACME/invitation-links-and-expiry instead.',
  },
  {
    area: 'Draft from the incident',
    prompt: '/mcp__nothingleft__document-this ACME-18',
    calls: [{ tool: 'search_articles' }, { tool: 'list_articles' }, { tool: 'create_article', args: 'status: draft' }],
    note: 'It checks what is already written, cites ACME-18 so the issue lists the article, shows you the draft and creates it only once you agree.',
  },
  {
    area: 'Publish and tag',
    prompt: 'Publish Restoring a failed sync and tag it sync-outage.',
    calls: [{ tool: 'update_article' }],
    note: 'One partial update: status and tags together.',
  },
];

export const KNOWLEDGE_BASE_FAQ: FaqEntry[] = [
  {
    question: 'Who can read an article?',
    answer: [
      "A new article is a draft: only its author and the project's admins can see it. Once published, every member of the project can read it, Observers included. Nobody outside the project can read its knowledge base, and there is no public or anonymous access.",
    ],
    link: { href: KB_MANUAL_PATH, label: 'Knowledge base manual' },
  },
  {
    question: 'Can we publish articles to customers or the public?',
    answer: [
      'No. The knowledge base is internal to the project: there is no public publishing, no share-with-anyone link and no anonymous access. Public documentation is a different product, and this one does not try to be it.',
    ],
  },
  {
    question: 'How does an article link to an issue?',
    answer: [
      'Write the issue key, such as ACME-12, anywhere in the article. It becomes a link to the issue, struck through once the issue is resolved, and the issue lists the article under Referenced by. That works even if the article was written before the issue existed. A key inside a code block is not a reference.',
    ],
  },
  {
    question: 'Are there templates?',
    answer: [
      'A new article starts from a Runbook, a Decision record, an Onboarding guide or a blank page, each with headings to fill in. There is no template editor to manage beyond those starters.',
    ],
  },
  {
    question: 'Does it keep version history?',
    answer: [
      'No. Each article shows who changed it last, and when. A deleted article can be restored for 14 days, with anything deleted along with it; after that it is removed for good, with its comments and files.',
    ],
  },
  {
    question: 'Can an AI agent read and write articles?',
    answer: [
      'Yes, through the MCP server, with your permissions and nothing more. It reads an article with get_article, writes one with create_article and publishes or tags it with update_article. The document-this prompt turns resolved issues into a draft and creates it once you agree. A token reads with issues:read and writes with issues:write.',
    ],
    link: { href: '/features/mcp-ai-agents', label: 'MCP and AI agents' },
  },
];

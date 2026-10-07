import type { FaqEntry } from './faq';
import { GITHUB_URL } from './site';

export interface CurrentTool {
  id: string;
  name: string;
  pricingUrl?: string;
}

export const CURRENT_TOOLS: CurrentTool[] = [
  { id: 'jira', name: 'Jira', pricingUrl: 'https://www.atlassian.com/software/jira/pricing' },
  { id: 'monday', name: 'monday.com', pricingUrl: 'https://monday.com/pricing' },
  { id: 'linear', name: 'Linear', pricingUrl: 'https://linear.app/pricing' },
  { id: 'youtrack', name: 'YouTrack', pricingUrl: 'https://www.jetbrains.com/youtrack/buy/' },
  { id: 'other', name: 'Another tool' },
];

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR'] as const;

export const TEAM_SIZE = { min: 20, max: 1000, initial: 20 } as const;

export const INCLUDED = [
  'Issues with subtasks, links, custom fields and attachments',
  'Sprints, backlog and boards',
  'Time tracking against the issue',
  'Nine reports, each exportable as CSV',
  'Search, saved views and bulk updates',
  'A private knowledge base per project',
  'MCP access for AI agents with scoped tokens',
  'Five built-in roles',
];

export const PRICING_FAQ: FaqEntry[] = [
  {
    question: 'Will we be charged when the beta ends?',
    answer: [
      'Not without notice. No seat is priced today and the product has no payment flow. Before any charge for seats beyond the first 20, every organisation hears about it well before it takes effect.',
    ],
  },
  {
    question: 'Which members stay free forever?',
    answer: [
      'The first 20 members of every organisation. That holds after billing arrives, and the product states it where you invite people, not only on this page.',
    ],
  },
  {
    question: 'What happens when we invite a 21st member?',
    answer: [
      'The invitation goes through. Nothing is blocked, withheld or made read-only. The invite dialog explains the seat notice, and organisation admins can see how many members are beyond the free allowance.',
    ],
  },
  {
    question: 'How much file storage do we get?',
    answer: [
      'Each organisation has 5 GB of platform storage for attachments; avatars do not count. Warnings appear at 80% and 95%. At the limit, new uploads are refused until you delete files or connect your own Cloudflare R2 or AWS S3 bucket, and the platform limit stops applying once that bucket is verified. There is no storage to buy.',
    ],
    link: { href: '/docs/limits-and-billing', label: 'Limits and storage' },
  },
  {
    question: 'Can we self-host instead?',
    answer: [
      'Yes. The code is AGPL-3.0 and the hosted service runs the same build. On your own install, the seat and storage limits are environment settings you choose.',
    ],
    link: { href: GITHUB_URL, label: 'Source on GitHub', external: true },
  },
  {
    question: 'What does beta access mean?',
    answer: [
      'You sign up and start straight away; there is no approval queue. The product is ready for real work and is still changing, and what you tell us shapes it. Issues export to CSV at any time, so trying it does not lock anything in.',
    ],
  },
  {
    question: 'Is there a paid plan we can buy now?',
    answer: ['No. There is no checkout and no paid tier to choose, and no payment details are asked for at sign-up.'],
  },
];

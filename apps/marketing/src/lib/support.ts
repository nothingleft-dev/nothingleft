import type { FaqEntry } from '@lib/faq';
import { GITHUB_URL, SUPPORT_EMAIL } from '@lib/site';
import type { RequestType } from '@lib/support-contract';

export const SECURITY_REPORT_URL = `${GITHUB_URL}/security`;
export const SECURITY_POLICY_URL = `${GITHUB_URL}/blob/main/SECURITY.md`;
export const ISSUES_URL = `${GITHUB_URL}/issues`;
export const NEW_ISSUE_URL = `${GITHUB_URL}/issues/new`;
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

export interface SupportLink {
  href: string;
  label: string;
}

export interface SupportRoute extends SupportLink {
  detail: string;
  type?: RequestType;
}

export const SUPPORT_ROUTES: SupportRoute[] = [
  {
    href: '/docs',
    label: 'Find an answer in Docs',
    detail: 'Start here for setup, agents, issues, storage and account access. Most answers are already written down.',
  },
  {
    href: '#contact',
    label: 'Report a problem',
    detail: 'Something broke, or behaved differently from what the docs say. Tell us what you did and what happened.',
    type: 'problem',
  },
  {
    href: '#contact',
    label: 'Talk to us about the beta',
    detail: 'Deciding whether it fits your team, or already trying it. No account needed to ask.',
    type: 'question',
  },
];

export interface SupportGuide extends SupportLink {
  detail: string;
  keywords: string;
}

export const SUPPORT_GUIDES: SupportGuide[] = [
  {
    href: '/docs/getting-started',
    label: 'Getting started',
    detail: 'Signing up, joining from an invitation, and landing in a first project.',
    keywords: 'setup sign up signup invite invitation join organisation organization project start onboarding',
  },
  {
    href: '/docs/mcp',
    label: 'Connecting an AI agent',
    detail: 'Create a personal access token and connect an MCP client to your organisation.',
    keywords: 'agent ai mcp token pat claude codex cursor setup connect stdio http',
  },
  {
    href: '/docs/issues',
    label: 'Issues',
    detail: 'Keys, fields, statuses, comments, time logs, attachments, deleting and restoring.',
    keywords: 'issue bug task key status comment subtask link tag attachment time log delete restore',
  },
  {
    href: '/docs/search',
    label: 'Searching for issues',
    detail: 'One search language for the search bar, saved views, filters and agents.',
    keywords: 'search query filter saved view find',
  },
  {
    href: '/docs/storage',
    label: 'Storage',
    detail: 'What counts toward the 5 GB, making room, and bringing your own R2 or S3 bucket.',
    keywords: 'storage files upload attachment quota full bucket r2 s3 space',
  },
  {
    href: '/docs/account-security',
    label: 'Account access and security',
    detail: 'Two-factor, recovery codes, access tokens, sessions, deactivating and transferring ownership.',
    keywords: 'account sign in login password two-factor 2fa recovery codes token session deactivate erase owner',
  },
  {
    href: '/docs/members',
    label: 'Members',
    detail: 'Organisation roles, handles, and removing someone from an organisation.',
    keywords: 'member people role admin remove invite handle username',
  },
  {
    href: '/docs/limits-and-billing',
    label: 'Limits and billing',
    detail: 'Beta terms, the 20 members that stay free, and the storage limit.',
    keywords: 'price pricing billing free beta seats members limit plan cost',
  },
];

export interface RequestHelp {
  heading: string;
  prompts: string[];
  links: SupportLink[];
}

export const REQUEST_HELP: Record<RequestType, RequestHelp> = {
  problem: {
    heading: 'What helps us reproduce it',
    prompts: [
      'What you did, step by step, and what you expected to happen.',
      'What happened instead, with any error message word for word.',
      'The page, the issue key such as ACME-12, or the agent tool involved.',
      'Whether it happens every time, and in which browser or agent client.',
    ],
    links: [
      { href: '/docs/issues', label: 'Issues' },
      { href: '/docs/storage', label: 'Storage' },
      { href: '/docs/mcp', label: 'Connecting an AI agent' },
    ],
  },
  feedback: {
    heading: 'Trying the beta? Tell us what worked, what did not, and what you need.',
    prompts: [
      'What you were trying to get done.',
      'What worked, and what got in the way.',
      'What you need that is not there yet, and why it matters to your team.',
    ],
    links: [
      { href: '/docs', label: 'Docs' },
      { href: '/docs/limits-and-billing', label: 'Limits and billing' },
    ],
  },
  account: {
    heading: 'Account help',
    prompts: [
      'Give the address on the account as your reply email, so we can find it.',
      'Say what you see: a sign-in error, a code that is refused, a deactivated account.',
      'To reactivate an account or have your personal data erased, say so here.',
      'Lost both your phone and your recovery codes? Nobody can switch off two-factor for you, so check the manual first.',
    ],
    links: [
      { href: '/docs/account-security', label: 'Account access and security' },
      { href: '/docs/members', label: 'Members' },
    ],
  },
  question: {
    heading: 'Asking whether it fits',
    prompts: [
      'What your team needs to track, and how you work today.',
      'Anything that would rule it out: hosting, storage, agents, import or export.',
      'You do not need an account to ask.',
    ],
    links: [
      { href: '/pricing', label: 'Pricing and beta terms' },
      { href: '/docs/limits-and-billing', label: 'Limits and billing' },
      { href: '/docs/mcp', label: 'Connecting an AI agent' },
    ],
  },
};

export const SUPPORT_FAQ: FaqEntry[] = [
  {
    question: 'Do I need an account to contact you?',
    answer: [
      'No. The form asks only for an email address to reply to. Questions about fit are as welcome before you sign up as after.',
    ],
  },
  {
    question: 'Is there a support plan or a guaranteed response time?',
    answer: [
      'No. Nothing Left is in beta: there is no paid support tier and no promised response time. Requests go to the team building the product.',
    ],
  },
  {
    question: 'I lost my phone and my recovery codes. Can you let me back in?',
    answer: [
      'No. Two-factor exists so that nobody else can sign in as you, and that includes us. Each recovery code signs you in once; if you still have one, use it and create new codes. If you signed in with Google or GitHub, that route never asks for a code.',
    ],
    link: { href: '/docs/account-security', label: 'Account security' },
  },
  {
    question: 'How do I reactivate my account, or have my data erased?',
    answer: [
      `Email ${SUPPORT_EMAIL} from the address on the account, or send the form with that address as the reply email. Reactivation brings your memberships back as they were. Erasure is done by hand and replaces your name with Deleted user; what you wrote in issues and comments is not rewritten.`,
    ],
    link: { href: '/docs/account-security', label: 'Deactivating your account' },
  },
  {
    question: 'Where do I report a security vulnerability?',
    answer: [
      'Privately, through GitHub: the repository’s Security tab, then Report a vulnerability. Please do not use this form, a public issue or a pull request for it.',
    ],
    link: { href: SECURITY_POLICY_URL, label: 'Security policy', external: true },
  },
  {
    question: 'Does sending a request sign me up for anything?',
    answer: [
      'No. We use what you send only to answer it. It is never added to a mailing list, and we do not record your IP address with it.',
    ],
  },
];

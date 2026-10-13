import { HOME_FAQ, type FaqEntry } from '../lib/faq';
import { INCLUDED, PRICING_FAQ } from '../lib/pricing';
import { LIMITS, RESPONSIBILITIES, SELF_HOSTING_FAQ, TIERS } from '../lib/solutions/self-hosting';
import { SECURITY_REPORT_URL, SUPPORT_FAQ, SUPPORT_GUIDES } from '../lib/support';
import {
  GITHUB_URL,
  LICENSE_URL,
  PRODUCT_CONTEXT,
  SIGN_UP_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  SUPPORT_EMAIL,
} from '../lib/site';
import { publishableMarkdown } from '../lib/docs-markdown';

interface MarketingMarkdownPage {
  path: string;
  label: string;
  description: string;
  body: string;
}

function faqMarkdown(entries: FaqEntry[]): string {
  return entries
    .map(entry =>
      [
        `### ${entry.question}`,
        ...entry.answer,
        ...(entry.link ? [`[${entry.link.label}](${entry.link.href})`] : []),
      ].join('\n\n'),
    )
    .join('\n\n');
}

const features = INCLUDED.map(feature => `- ${feature}`).join('\n');

// Curated text counterparts. Reuse the visible pages' feature lists and FAQs so
// changes to pricing, capabilities and limitations reach both representations.
export const MARKETING_MARKDOWN_PAGES: MarketingMarkdownPage[] = [
  {
    path: '/',
    label: 'Product overview',
    description: 'Who Nothing Left is for, core features, beta terms, hosting options and current limitations.',
    body: `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${PRODUCT_CONTEXT}

## What is included

${features}

## Get started

- [Join the hosted beta](${SIGN_UP_URL})
- [Getting started](/docs/getting-started)
- [Pricing and beta terms](/pricing)
- [Self-hosting](/solutions/self-hosting)
- [Connecting an AI agent](/docs/mcp)
- [Source repository](${GITHUB_URL})
- [AGPL-3.0 licence](${LICENSE_URL})

## Questions about the product

${faqMarkdown(HOME_FAQ)}`,
  },
  {
    path: '/pricing',
    label: 'Pricing and beta terms',
    description: 'Free beta access, the permanent first-20-members allowance, storage and future billing.',
    body: `# Pricing and beta terms

> Free during beta, whatever your team size. When billing arrives, the first 20 members of every organisation stay free.

No seat beyond the 20th is priced today. We will give advance notice before charging for additional seats.

## Included features

${features}

## Questions about cost

${faqMarkdown(PRICING_FAQ)}

## Further details

- [Limits and billing](/docs/limits-and-billing): Storage limits, seat notices and other product limits.
- [Pricing calculator](${SITE_URL}/pricing#compare): Interactive illustration of subscription spend avoided during beta, based on the plan and amount you enter; not a future price quote.
- [Join the beta](${SIGN_UP_URL})`,
  },
  {
    path: '/solutions/self-hosting',
    label: 'Self-hosting',
    description:
      'AGPL-3.0, the shared hosted/self-hosted build, infrastructure responsibilities and install-guide availability.',
    body: `# Self-hosting Nothing Left

> Run the tracker and its agent interface on your infrastructure. The software is open source under AGPL-3.0 and uses the same build as the hosted service.

The production install guide ships with launch. The repository's Docker Compose file runs development data services only; it does not run the web app or API.

## Architecture

${TIERS.flatMap(tier => tier.nodes.map(node => `### ${node.name}\n\n${node.tech}\n\n${node.body.join('\n\n')}`)).join('\n\n')}

## Configurable limits

${LIMITS.map(limit => `- \`${limit.name}\` (default: ${limit.fallback}): ${limit.effect}`).join('\n')}

## Operating responsibilities

${RESPONSIBILITIES.map(row => `### ${row.area}\n\nHosted: ${row.hosted}\n\nSelf-hosted: ${row.self}`).join('\n\n')}

## Questions before self-hosting

${faqMarkdown(SELF_HOSTING_FAQ)}

## Source and guides

- [Source repository](${GITHUB_URL})
- [AGPL-3.0 licence](${LICENSE_URL}): The licence text is authoritative.
- [Storage manual](/docs/storage)
- [Connecting an AI agent](/docs/mcp)`,
  },
  {
    path: '/support',
    label: 'Support',
    description: 'Setup guides, contact options, beta support expectations and private vulnerability reporting.',
    body: `# Support

> Get help with Nothing Left, report a problem or share feedback about the beta.

## Guides

${SUPPORT_GUIDES.map(guide => `- [${guide.label}](${guide.href}): ${guide.detail}`).join('\n')}

## Contact

Use the [support form](${SITE_URL}/support#contact) or email [${SUPPORT_EMAIL}](mailto:${SUPPORT_EMAIL}). You do not need an account to ask a question. For a problem, include what you did, what you expected and the error message, if any.

Report security vulnerabilities privately through the [repository's Security tab](${SECURITY_REPORT_URL}), not through a public issue or the support form.

## Questions about getting help

${faqMarkdown(SUPPORT_FAQ)}`,
  },
];

export function marketingMarkdown(page: MarketingMarkdownPage): string {
  // Append the HTML source after rewriting so it remains a link to the visible page.
  return `${publishableMarkdown(page.body)}\n\n---\n\n[Read the web page](${SITE_URL}${page.path})\n`;
}

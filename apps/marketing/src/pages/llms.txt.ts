import type { APIRoute } from 'astro';
import { DOC_GROUPS, docPath, isPublished } from '@data/docs';
import { SCHEMA_PAGES } from '@data/schema-config';
import { MARKETING_MARKDOWN_PAGES } from '@data/marketing-markdown';
import { MARKETING_MARKDOWN_PATHS } from '@lib/markdown-source';
import { GITHUB_URL, LICENSE_URL, PRODUCT_CONTEXT, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@lib/site';

// The llms.txt convention: a plain index an agent can read before fetching individual pages.
export const GET: APIRoute = () => {
  const sections = DOC_GROUPS.map(group => {
    const docs = group.docs.filter(doc => isPublished(doc.slug));
    if (docs.length === 0) return '';
    const lines = docs.map(doc => {
      const description = SCHEMA_PAGES[docPath(doc.slug)]?.description;
      // The API reference has no Markdown twin; its source is the OpenAPI document itself.
      const source = doc.slug === 'api' ? '/docs/openapi.yaml' : `${docPath(doc.slug)}.md`;
      return `- [${doc.label}](${SITE_URL}${source})${description ? `: ${description}` : ''}`;
    });
    return `## ${group.title}\n\n${lines.join('\n')}`;
  }).filter(Boolean);
  const productLinks = MARKETING_MARKDOWN_PAGES.map(
    page => `- [${page.label}](${SITE_URL}${MARKETING_MARKDOWN_PATHS[page.path]}): ${page.description}`,
  );
  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${PRODUCT_CONTEXT}

Start with the product overview for context, then follow the relevant guides. Product summaries and documentation links provide plain Markdown; the API reference is OpenAPI YAML. Repository and licence links point to GitHub.

## Product

${productLinks.join('\n')}

${sections.join('\n\n')}

## Optional

- [Source repository](${GITHUB_URL}): Source code, development setup and contribution information.
- [Licence](${LICENSE_URL}): Authoritative AGPL-3.0 licence text.
`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};

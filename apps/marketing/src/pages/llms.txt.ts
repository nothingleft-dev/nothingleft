import type { APIRoute } from 'astro';
import { DOC_GROUPS, docPath, isPublished } from '@data/docs';
import { SCHEMA_PAGES } from '@data/schema-config';
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@lib/site';

// The llms.txt convention: a plain index an agent can read before fetching individual pages.
export const GET: APIRoute = () => {
  const sections = DOC_GROUPS.map(group => {
    const docs = group.docs.filter(doc => isPublished(doc.slug));
    if (docs.length === 0) return '';
    const lines = docs.map(doc => {
      const description = SCHEMA_PAGES[docPath(doc.slug)]?.description;
      return `- [${doc.label}](${SITE_URL}${docPath(doc.slug)}.md)${description ? `: ${description}` : ''}`;
    });
    return `## ${group.title}\n\n${lines.join('\n')}`;
  }).filter(Boolean);
  const body = `# ${SITE_NAME}\n\n> ${SITE_DESCRIPTION}\n\nEvery page below is plain Markdown.\n\n${sections.join('\n\n')}\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};

import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { isPublished } from '@data/docs';
import { publishableMarkdown } from '@lib/docs-markdown';

export const getStaticPaths: GetStaticPaths = async () => {
  const docs = await getCollection('docs');
  return docs
    .filter(doc => isPublished(doc.id))
    .map(doc => ({ params: { slug: doc.id }, props: { body: doc.body ?? '' } }));
};

export const GET: APIRoute = ({ props }) =>
  new Response(publishableMarkdown(props.body as string), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });

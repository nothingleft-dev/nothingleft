import type { APIRoute, GetStaticPaths } from 'astro';
import { MARKETING_MARKDOWN_PAGES, marketingMarkdown } from '@data/marketing-markdown';
import { MARKETING_MARKDOWN_PATHS } from '@lib/markdown-source';

export const getStaticPaths: GetStaticPaths = () =>
  MARKETING_MARKDOWN_PAGES.map(page => ({
    params: { page: MARKETING_MARKDOWN_PATHS[page.path]!.slice(1, -3) },
    props: { body: marketingMarkdown(page) },
  }));

export const GET: APIRoute = ({ props }) =>
  new Response(props.body as string, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });

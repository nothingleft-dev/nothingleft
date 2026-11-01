import type { APIRoute, GetStaticPaths } from 'astro';
import { OG_CARDS, ogImageSlug } from '@data/og-cards';
import { renderOgCard } from '@lib/og/render';

export const getStaticPaths = (() =>
  Object.keys(OG_CARDS).map(path => ({
    params: { slug: ogImageSlug(path) },
    props: { path },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ path: string }> = async ({ props }) =>
  new Response(await renderOgCard(props.path), { headers: { 'Content-Type': 'image/png' } });

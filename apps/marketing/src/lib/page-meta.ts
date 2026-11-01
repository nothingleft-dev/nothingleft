import { OG_CARDS, ogImageAlt, ogImageSlug } from '../data/og-cards';
import { SCHEMA_PAGES, type PageSchema } from '../data/schema-config';
import { SITEMAP_PAGES, normalizePath } from '../data/sitemap-config.mjs';
import {
  breadcrumb,
  faqPage,
  graph,
  organization,
  softwareApplication,
  techArticle,
  walkthroughVideo,
  webPage,
  website,
  type JsonLd,
} from './structured-data';
import { SITE_URL } from './site';

export interface PageMeta {
  path: string;
  schema: PageSchema;
  jsonLd: string;
  ogImage: string;
  ogImageAlt: string;
}

export const OG_IMAGE = { width: 1200, height: 630 };

const ogCardPath = (path: string) => (OG_CARDS[path] ? path : '/');

export const ogImagePath = (path: string) => `${SITE_URL}/og/${ogImageSlug(ogCardPath(normalizePath(path)))}.png`;

export function pageMeta(pathname: string): PageMeta {
  const path = normalizePath(pathname);
  const schema = SCHEMA_PAGES[path];
  if (!schema) throw new Error(`${path} has no entry in src/data/schema-config.ts`);
  const lastmod = SITEMAP_PAGES[path]?.lastmod;

  const builders: Record<string, () => JsonLd | undefined> = {
    Organization: organization,
    WebSite: website,
    WebPage: () => webPage(path, schema.title, schema.description, lastmod),
    SoftwareApplication: softwareApplication,
    TechArticle: () =>
      techArticle(path, schema.headline ?? schema.title, schema.description, lastmod, ogImagePath(path)),
    FAQPage: () => (schema.faq ? faqPage(path, schema.faq) : undefined),
    VideoObject: walkthroughVideo,
    BreadcrumbList: () => (schema.breadcrumb ? breadcrumb(schema.breadcrumb) : undefined),
  };
  // A page may list FAQPage before its questions are written; it emits once they exist.
  const wanted = schema.nodes.filter(node => node !== 'FAQPage' || (schema.faq?.length ?? 0) > 0);
  const nodes = wanted.map(node => {
    const built = builders[node]?.();
    if (!built) throw new Error(`${path} lists ${node} in schema-config without the data it needs`);
    return built;
  });
  return {
    path,
    schema,
    jsonLd: graph(nodes),
    ogImage: ogImagePath(path),
    ogImageAlt: ogImageAlt(OG_CARDS[ogCardPath(path)] ?? OG_CARDS['/']),
  };
}

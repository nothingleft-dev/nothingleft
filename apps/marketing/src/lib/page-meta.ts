import { SCHEMA_PAGES, type PageSchema } from '../data/schema-config';
import { SITEMAP_PAGES, normalizePath } from '../data/sitemap-config.mjs';
import {
  breadcrumb,
  faqPage,
  graph,
  organization,
  softwareApplication,
  techArticle,
  webPage,
  website,
  type JsonLd,
} from './structured-data';

export interface PageMeta {
  path: string;
  schema: PageSchema;
  jsonLd: string;
}

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
    TechArticle: () => techArticle(path, schema.headline ?? schema.title, schema.description, lastmod),
    FAQPage: () => (schema.faq ? faqPage(path, schema.faq) : undefined),
    BreadcrumbList: () => (schema.breadcrumb ? breadcrumb(schema.breadcrumb) : undefined),
  };
  // A page may list FAQPage before its questions are written; it emits once they exist.
  const wanted = schema.nodes.filter(node => node !== 'FAQPage' || (schema.faq?.length ?? 0) > 0);
  const nodes = wanted.map(node => {
    const built = builders[node]?.();
    if (!built) throw new Error(`${path} lists ${node} in schema-config without the data it needs`);
    return built;
  });
  return { path, schema, jsonLd: graph(nodes) };
}

import { OG_IMAGE_ALTS } from '../data/og-images';
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

export interface PageMeta {
  path: string;
  schema: PageSchema;
  jsonLd: string;
  ogImage: string;
  ogImageAlt: string;
}

export const OG_IMAGE = { width: 1200, height: 630 };

export const ogImageSlug = (path: string) => (path === '/' ? 'home' : path.slice(1).replace(/\//g, '-'));

// Uploaded cards are tracked explicitly so builds never depend on local PNGs.
export function ogImagePath(path: string): string {
  const normalized = normalizePath(path);
  const imagePath = OG_IMAGE_ALTS[normalized] ? normalized : '/';
  return `https://static.nothingleft.dev/marketing/${ogImageSlug(imagePath)}.png`;
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
    ogImageAlt: OG_IMAGE_ALTS[path] ?? OG_IMAGE_ALTS['/'],
  };
}

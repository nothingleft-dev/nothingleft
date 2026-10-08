import { defineConfig, envField } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { sitemapEntry } from './src/data/sitemap-config.mjs';
import { remarkDocLinks } from './src/lib/markdown/doc-links';
import { rehypeDropTitle } from './src/lib/markdown/drop-title';
import { rehypeWrapTables } from './src/lib/markdown/wrap-tables';

export default defineConfig({
  site: 'https://nothingleft.dev',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file', inlineStylesheets: 'always' },
  integrations: [
    sitemap({
      filter: page => Boolean(sitemapEntry(page)),
      serialize: item => {
        const meta = sitemapEntry(item.url);
        return meta ? { url: item.url, lastmod: meta.lastmod } : undefined;
      },
    }),
  ],
  env: {
    schema: {
      PUBLIC_GA_MEASUREMENT_ID: envField.string({ context: 'client', access: 'public', optional: true }),
      PUBLIC_CLARITY_PROJECT_ID: envField.string({ context: 'client', access: 'public', optional: true }),
      TURSO_DATABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      TURSO_AUTH_TOKEN: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
  markdown: {
    remarkPlugins: [remarkDocLinks],
    rehypePlugins: [rehypeDropTitle, rehypeWrapTables],
    // Shiki's css-variables theme leaves every colour to the site's tokens.
    shikiConfig: { theme: 'css-variables' },
  },
  vite: { plugins: [tailwindcss()] },
});

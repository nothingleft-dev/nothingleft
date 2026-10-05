import { defineConfig } from 'drizzle-kit';

// Direct (unpooled) URL: migrations take advisory locks, which pgBouncer breaks.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
  verbose: true,
});

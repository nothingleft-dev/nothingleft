import { loadEnv, type Env } from '@config/env';
import { buildApp, type BuildOptions } from '../src/app.ts';

if (!process.env.DATABASE_URL_POOLED || !process.env.REDIS_URL) {
  throw new Error('API tests need DATABASE_URL_POOLED and REDIS_URL — run `bun run test` so apps/api/.env is loaded');
}

export const testEnv = loadEnv({
  ...process.env,
  NODE_ENV: 'test',
  LOG_LEVEL: 'fatal',
  LOG_TARGETS: 'json',
  // Customer buckets in tests are a second bucket on the local store, at its own endpoint.
  BYO_ALLOW_ANY_ENDPOINT: 'true',
});

// The breach list and Gravatar are stubbed out: a test must not depend on the network.
export const isolatedRateLimit = () => ({ rateLimitNamespace: `rl:test:${crypto.randomUUID()}:` });

export async function testApp(opts: BuildOptions = {}, env: Env = testEnv) {
  const app = await buildApp(env, {
    ...isolatedRateLimit(),
    isPasswordBreached: async () => false,
    resolveAvatarUrl: async ({ providerUrl }) => providerUrl ?? null,
    // No test resolves a provider's host for real.
    gitResolveHost: async () => ['93.184.216.34'],
    ...opts,
  });
  await app.ready();
  return app;
}

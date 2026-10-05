import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { pingDb, type Db } from '@nothingleft/db';
import { DeepHealthSchema, HealthSchema, successEnvelope, type DeepHealth, type Health } from '@nothingleft/types';
import {
  HEALTH_CHECK_TIMEOUT_MS,
  HEALTH_DEEP_MAX_PER_MINUTE,
  HEALTH_DEEP_MEMO_MS,
  RATE_LIMIT_WINDOW_MS,
} from '@config/constants';
import type { Storage } from '@lib/storage';

type Deps = { db: Db; storage: Storage; now?: () => Date };
type DeepResult = { status: 200 | 503; body: DeepHealth };

const withTimeout = <T>(p: Promise<T>) =>
  Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), HEALTH_CHECK_TIMEOUT_MS)),
  ]);

const HealthResponse = successEnvelope(HealthSchema);
const DeepHealthResponse = successEnvelope(DeepHealthSchema);

const healthRoutes: FastifyPluginAsyncZod<Deps> = async (app, { db, storage, now = () => new Date() }) => {
  let inflight: Promise<DeepResult> | null = null;
  let last: { at: number; result: DeepResult } | null = null;

  async function probe(): Promise<DeepResult> {
    const [dbResult, redisResult, storageResult] = await Promise.allSettled([
      withTimeout(pingDb(db)),
      withTimeout(app.redis.ping()),
      storage.private ? withTimeout(storage.private.probe()) : Promise.resolve(),
    ]);
    const checks = {
      db: dbResult.status === 'fulfilled' ? 'ok' : 'fail',
      redis: redisResult.status === 'fulfilled' ? 'ok' : 'fail',
      storage: !storage.private ? 'not_configured' : storageResult.status === 'fulfilled' ? 'ok' : 'fail',
    } as const;
    const healthy = Object.values(checks).every(c => c !== 'fail');
    return { status: healthy ? 200 : 503, body: { status: healthy ? 'ok' : 'degraded', checks } };
  }

  // Anonymous, and a probe holds a pool connection that a timeout does not release: one probe at a time, its answer shared.
  function deepCheck(): Promise<DeepResult> {
    if (last && now().getTime() - last.at < HEALTH_DEEP_MEMO_MS) return Promise.resolve(last.result);
    inflight ??= probe()
      .then(result => {
        last = { at: now().getTime(), result };
        return result;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  }

  app.get(
    '/health',
    { config: { rateLimit: false }, schema: { response: { 200: HealthResponse } } },
    async (_request, reply) => reply.ok<Health>({ status: 'ok' }),
  );

  app.get(
    '/health/deep',
    {
      config: { rateLimit: { max: HEALTH_DEEP_MAX_PER_MINUTE, timeWindow: RATE_LIMIT_WINDOW_MS } },
      schema: { response: { 200: DeepHealthResponse, 503: DeepHealthResponse } },
    },
    async (_request, reply) => {
      const { status, body } = await deepCheck();
      return reply.ok(body, { status });
    },
  );
};

export default healthRoutes;

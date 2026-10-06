import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { FastifyRedis } from '@fastify/redis';
import type { Principal } from '@nothingleft/types';
import { AppError } from '@lib/errors';
import { orgHints } from '@lib/request';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_REPLAYED_HEADER,
  IDEMPOTENCY_TTL_SECONDS,
  REQUEST_ID_HEADER,
} from '@config/constants';

declare module 'fastify' {
  interface FastifyRequest {
    idempotency: { storeKey: string; fingerprint: string } | null;
    touchedProjects: Map<number, number> | null;
  }
}

/** Project id → organisation id, for every project the current request resolved through the access layer. */
const touchedProjects = new AsyncLocalStorage<Map<number, number>>();

export const recordProjectTouched = (orgId: number, projectId: number): void => {
  touchedProjects.getStore()?.set(projectId, orgId);
};

export interface IdempotencyStore {
  /** Sets the key only if absent; false when another request already holds it. */
  claim(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
  /** Overwrites the value and keeps the original expiry: 24 hours from the first request. */
  replace(key: string, value: string): Promise<void>;
  release(key: string): Promise<void>;
}

export const redisIdempotencyStore = (redis: FastifyRedis): IdempotencyStore => ({
  claim: async (key, value, ttl) => (await redis.set(key, value, 'EX', ttl, 'NX')) === 'OK',
  get: key => redis.get(key),
  replace: async (key, value) => {
    await redis.set(key, value, 'KEEPTTL');
  },
  release: async key => {
    await redis.del(key);
  },
});

interface Pending {
  state: 'pending';
  fingerprint: string;
}

interface Done {
  state: 'done';
  fingerprint: string;
  status: number;
  contentType: string;
  body: string;
  /** The organisations the first request acted in; a replay re-checks membership of each. */
  orgIds: number[];
  /** `[orgId, projectId]` for each project it acted in; a replay re-checks that each is still readable. */
  projects?: [number, number][];
}

export interface ReplayScope {
  orgIds: readonly number[];
  projects: readonly (readonly [orgId: number, projectId: number])[];
}

export interface IdempotencyOptions {
  store: IdempotencyStore;
  /** Throws, as the route itself would, when the principal can no longer read one of these organisations or projects. */
  recheckAccess: (principal: Principal, scope: ReplayScope) => Promise<void>;
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const credential = (p: Principal) => (p.via === 'session' ? `s:${p.sessionId}` : `t:${p.tokenId}`);

// A session acts in its current organisation and ignores X-Organization; a PAT names its own.
const organisation = (request: FastifyRequest, p: Principal): string =>
  p.via === 'session' ? String(p.currentOrgId ?? '') : (orgHints(request).slug ?? '');

// Keyed by credential, organisation and key — docs/api-conventions.md#idempotency. A Redis failure
// degrades to no replay protection, never to a failed request.
const idempotencyPlugin: FastifyPluginAsync<IdempotencyOptions> = async (app, { store, recheckAccess }) => {
  app.decorateRequest('idempotency', null);
  app.decorateRequest('touchedProjects', null);
  app.addHook('onRequest', (request, _reply, done) => {
    const projects = new Map<number, number>();
    request.touchedProjects = projects;
    touchedProjects.run(projects, done);
  });

  app.addHook('preHandler', async (request, reply) => {
    const raw = request.headers[IDEMPOTENCY_KEY_HEADER];
    if (!MUTATING.has(request.method) || typeof raw !== 'string' || !request.principal) return;
    if (raw.length === 0 || raw.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      throw new AppError('validation_failed', 400, {}, IDEMPOTENCY_KEY_HEADER);
    }
    const storeKey = `idem:${credential(request.principal)}:${organisation(request, request.principal)}:${raw}`;
    const fingerprint = createHash('sha256')
      .update(`${request.method} ${request.url} ${JSON.stringify(request.body ?? null)}`)
      .digest('base64url');

    let stored: Pending | Done | null;
    try {
      const pending: Pending = { state: 'pending', fingerprint };
      if (await store.claim(storeKey, JSON.stringify(pending), IDEMPOTENCY_TTL_SECONDS)) {
        request.idempotency = { storeKey, fingerprint };
        return;
      }
      const value = await store.get(storeKey);
      stored = value ? (JSON.parse(value) as Pending | Done) : null;
    } catch (err) {
      request.log.warn({ err }, 'idempotency store unavailable');
      return;
    }
    if (!stored) return;
    if (stored.fingerprint !== fingerprint)
      throw new AppError('idempotency.key_reused', 422, {}, IDEMPOTENCY_KEY_HEADER);
    if (stored.state === 'pending') throw new AppError('idempotency.in_progress', 409, {}, IDEMPOTENCY_KEY_HEADER);
    await recheckAccess(request.principal, { orgIds: stored.orgIds ?? [], projects: stored.projects ?? [] });

    reply
      .header(REQUEST_ID_HEADER, request.id)
      .header(IDEMPOTENCY_REPLAYED_HEADER, 'true')
      .header('content-type', stored.contentType)
      .status(stored.status)
      .send(stored.body);
    return reply;
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const claim = request.idempotency;
    if (!claim) return payload;
    try {
      // A server failure or a throttle says nothing about the request, so the key is released for a retry.
      if (reply.statusCode >= 500 || reply.statusCode === 429 || typeof payload !== 'string') {
        await store.release(claim.storeKey);
      } else {
        const done: Done = {
          state: 'done',
          fingerprint: claim.fingerprint,
          status: reply.statusCode,
          contentType: String(reply.getHeader('content-type') ?? 'application/json; charset=utf-8'),
          body: payload,
          orgIds: [...(request.touchedOrgs ?? [])],
          projects: [...(request.touchedProjects ?? [])].map(([projectId, orgId]): [number, number] => [
            orgId,
            projectId,
          ]),
        };
        await store.replace(claim.storeKey, JSON.stringify(done));
      }
    } catch (err) {
      request.log.warn({ err }, 'idempotency store unavailable');
    }
    return payload;
  });
};

export default fp(idempotencyPlugin, { name: 'idempotency', dependencies: ['report-version'] });

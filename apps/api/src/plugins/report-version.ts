import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { IDEMPOTENCY_REPLAYED_HEADER } from '@config/constants';

declare module 'fastify' {
  interface FastifyRequest {
    touchedOrgs: Set<number> | null;
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The organisations the current request acted in, recorded by the access layer as it resolves them. */
export const touchedOrgs = new AsyncLocalStorage<Set<number>>();

export const recordOrgTouched = (orgId: number): void => {
  touchedOrgs.getStore()?.add(orgId);
};

/**
 * Every write bumps the report data version of the organisations it acted in, so a cached report is
 * never served over data it did not see. One hook covers every route, MCP included. A refused write
 * bumps too, since it may have committed part of its work first; the bump lands before the response.
 */
const reportVersion: FastifyPluginAsync<{ bump: (orgId: number) => Promise<void> }> = async (app, { bump }) => {
  app.decorateRequest('touchedOrgs', null);
  app.addHook('onRequest', (request, _reply, done) => {
    const orgs = new Set<number>();
    request.touchedOrgs = orgs;
    touchedOrgs.run(orgs, done);
  });
  app.addHook('onSend', async (request, reply, payload) => {
    if (MUTATING.has(request.method) && !reply.hasHeader(IDEMPOTENCY_REPLAYED_HEADER)) {
      for (const orgId of request.touchedOrgs ?? []) await bump(orgId);
    }
    return payload;
  });
};

export default fp(reportVersion, { name: 'report-version' });

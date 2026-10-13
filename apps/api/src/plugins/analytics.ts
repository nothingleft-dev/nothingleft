import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import type { Actor, Analytics } from '@nothingleft/analytics';

declare module 'fastify' {
  interface FastifyInstance {
    analytics: Analytics;
  }
}

export function requestAttribution(request: FastifyRequest): {
  via: 'session' | 'pat' | 'anonymous';
  org: { org_id: number } | Record<string, never>;
  actor: Actor | undefined;
} {
  const principal = request.principal;
  const orgId = principal?.via === 'session' ? principal.currentOrgId : null;
  return {
    via: principal?.via ?? 'anonymous',
    org: orgId !== null ? { org_id: orgId } : {},
    actor: principal ? { userId: principal.userId, ...(orgId !== null ? { orgId } : {}) } : undefined,
  };
}

const analyticsPlugin: FastifyPluginAsync<{ analytics: Analytics }> = async (app, { analytics }) => {
  app.decorate('analytics', analytics);

  app.addHook('onResponse', async (request, reply) => {
    // Route pattern, never the URL: URLs can carry customer content.
    const route = request.routeOptions.url;
    if (!route || route.startsWith('/health')) return;
    const { via, org, actor } = requestAttribution(request);
    analytics.capture(
      'api_request',
      {
        route,
        method: request.method,
        status_code: reply.statusCode,
        duration_ms: Math.round(reply.elapsedTime),
        via,
        ...org,
      },
      actor,
    );
  });

  app.addHook('onClose', async () => {
    await analytics.shutdown();
  });
};

export default fp(analyticsPlugin, { name: 'analytics' });

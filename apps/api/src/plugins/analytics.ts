import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { Analytics } from '@nothingleft/analytics';

declare module 'fastify' {
  interface FastifyInstance {
    analytics: Analytics;
  }
}

const analyticsPlugin: FastifyPluginAsync<{ analytics: Analytics }> = async (app, { analytics }) => {
  app.decorate('analytics', analytics);

  app.addHook('onResponse', async (request, reply) => {
    // Route pattern, never the URL: URLs can carry customer content.
    const route = request.routeOptions.url;
    if (!route || route.startsWith('/health')) return;
    analytics.capture(
      'api_request',
      {
        route,
        method: request.method,
        status_code: reply.statusCode,
        duration_ms: Math.round(reply.elapsedTime),
        via: request.principal?.via ?? 'anonymous',
        ...(request.principal?.via === 'session' && request.principal.currentOrgId !== null
          ? { org_id: request.principal.currentOrgId }
          : {}),
      },
      request.principal
        ? {
            userId: request.principal.userId,
            ...(request.principal.via === 'session' && request.principal.currentOrgId !== null
              ? { orgId: request.principal.currentOrgId }
              : {}),
          }
        : undefined,
    );
  });

  app.addHook('onClose', async () => {
    await analytics.shutdown();
  });
};

export default fp(analyticsPlugin, { name: 'analytics' });

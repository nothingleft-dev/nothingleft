import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { AppError } from '@lib/errors';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * SameSite=Lax already blocks cross-site form posts; this is the second layer, and it
 * applies only to cookie-authenticated calls — a PAT carries no ambient credential and
 * is exempt by design (docs/auth-and-tenancy.md#csrf).
 */
const originPlugin: FastifyPluginAsync<{ allowedOrigin: string }> = async (app, { allowedOrigin }) => {
  app.addHook('onRequest', async request => {
    if (request.principal?.via !== 'session') return;
    if (!MUTATING_METHODS.has(request.method)) return;
    if (request.headers.origin !== allowedOrigin) throw new AppError('auth.origin_mismatch', 403);
  });
};

export default fp(originPlugin, { name: 'origin-check', dependencies: ['auth'] });

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import {
  MCP_CLIENT_HEADER,
  PAT_PREFIX,
  SESSION_COOKIE_NAME,
  type Credential,
  type Principal,
} from '@nothingleft/types';
import { AppError } from '@lib/errors';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null;
  }
}

export type PrincipalResolver = (credential: Credential) => Promise<Principal | null>;

interface AuthOptions {
  resolvePrincipal: PrincipalResolver;
  cookieDomain: string | undefined;
}

const authPlugin: FastifyPluginAsync<AuthOptions> = async (app, { resolvePrincipal, cookieDomain }) => {
  app.decorateRequest('principal', null);

  app.addHook('onRequest', async (request, reply) => {
    const credential = extractCredential(request);
    const principal = credential ? await resolvePrincipal(credential) : null;
    // The web app treats the cookie's presence as signed in, so a dead one must not outlive this answer.
    if (credential?.kind === 'session' && !principal) {
      reply.clearCookie(SESSION_COOKIE_NAME, { path: '/', ...(cookieDomain ? { domain: cookieDomain } : {}) });
    }
    request.principal =
      principal?.via === 'pat' && request.headers[MCP_CLIENT_HEADER] === 'mcp'
        ? { ...principal, client: 'mcp' }
        : principal;
  });
};

export function extractCredential(request: FastifyRequest): Credential | null {
  const auth = request.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim();
    if (token.startsWith(PAT_PREFIX)) return { kind: 'pat', token };
  }
  const sid = request.cookies?.[SESSION_COOKIE_NAME];
  if (sid) return { kind: 'session', token: sid };
  return null;
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!request.principal) throw AppError.unauthorized();
}

export default fp(authPlugin, { name: 'auth', dependencies: ['@fastify/cookie'] });

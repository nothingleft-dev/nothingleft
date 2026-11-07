import type { FastifyPluginAsync } from 'fastify';
import { mcpHttpHandler, type McpHttpOptions } from '@nothingleft/mcp-server';
import { AppError } from '@lib/errors';

const FORWARDED_HEADERS = [
  'content-type',
  'accept',
  'mcp-protocol-version',
  'mcp-method',
  'mcp-name',
  'mcp-session-id',
  'last-event-id',
];

const mcpRoutes: FastifyPluginAsync<McpHttpOptions> = async (app, options) => {
  const mcp = mcpHttpHandler(options);
  app.addHook('onClose', () => mcp.close());

  // JSON-RPC answers a malformed body with -32700; the API-wide parser would answer the REST envelope first.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => done(null, body));

  app.route({
    method: ['GET', 'POST', 'DELETE'],
    url: '/mcp',
    handler: async (request, reply) => {
      const principal = request.principal;
      if (principal?.via !== 'pat') throw new AppError('auth.pat_required', 401);

      const headers = new Headers();
      for (const name of FORWARDED_HEADERS) {
        const value = request.headers[name];
        if (typeof value === 'string') headers.set(name, value);
      }
      const post = request.method === 'POST';
      const raw = typeof request.body === 'string' ? request.body : '';
      let parsed: unknown;
      try {
        parsed = post ? JSON.parse(raw) : undefined;
      } catch {
        parsed = undefined;
      }
      const gone = new AbortController();
      reply.raw.on('close', () => gone.abort());
      const response = await mcp.handle(
        new Request(new URL(request.url, 'http://mcp.local').href, {
          method: request.method,
          headers,
          signal: gone.signal,
          ...(post ? { body: raw } : {}),
        }),
        {
          token: request.headers.authorization!.slice('Bearer '.length).trim(),
          userId: principal.userId,
          requestId: request.id,
          scopes: principal.scopes,
        },
        parsed,
      );

      reply.status(response.status);
      response.headers.forEach((value, name) => {
        if (name !== 'content-length') reply.header(name, value);
      });
      // A subscription stream never ends: buffering it sent no bytes until the edge gave up at 100 s.
      const streamed = (response.headers.get('content-type') ?? '').includes('text/event-stream');
      return reply.send(streamed && response.body ? response.body : await response.text());
    },
  });
};

export default mcpRoutes;

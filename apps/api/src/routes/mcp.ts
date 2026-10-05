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
      const response = await mcp.handle(
        new Request(new URL(request.url, 'http://mcp.local').href, {
          method: request.method,
          headers,
          ...(post ? { body: JSON.stringify(request.body ?? null) } : {}),
        }),
        {
          token: request.headers.authorization!.slice('Bearer '.length).trim(),
          userId: principal.userId,
          requestId: request.id,
        },
        post ? request.body : undefined,
      );

      reply.status(response.status);
      response.headers.forEach((value, name) => {
        if (name !== 'content-length') reply.header(name, value);
      });
      return reply.send(await response.text());
    },
  });
};

export default mcpRoutes;

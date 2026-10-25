import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { GitWebhookAcceptedSchema, successEnvelope } from '@nothingleft/types';
import {
  GIT_WEBHOOK_BODY_LIMIT_BYTES,
  GIT_WEBHOOK_RATE_LIMIT_PER_APP,
  GIT_WEBHOOK_RATE_LIMIT_PER_HOOK,
  RATE_LIMIT_WINDOW_MS,
} from '@config/constants';
import { AppError } from '@lib/errors';
import type { GitIngestService } from '@services/git-ingest.service';

type Deps = { ingest: GitIngestService; now?: () => Date };

const ProviderParams = z.object({ provider: z.string().min(1).max(30) });
const HookParams = ProviderParams.extend({ hook_id: z.string().regex(/^[A-Za-z0-9]{32,64}$/) });
const Accepted = successEnvelope(GitWebhookAcceptedSchema);

// Called by the provider, never by a person: no session, no organisation header. The body is
// kept as raw bytes because the signature covers them exactly.
const gitWebhookRoutes: FastifyPluginAsyncZod<Deps> = async (app, { ingest, now = () => new Date() }) => {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: GIT_WEBHOOK_BODY_LIMIT_BYTES }, (_req, body, done) =>
    done(null, body),
  );

  app.post(
    '/v1/git/webhooks/:provider',
    {
      bodyLimit: GIT_WEBHOOK_BODY_LIMIT_BYTES,
      config: {
        rateLimit: {
          max: GIT_WEBHOOK_RATE_LIMIT_PER_APP,
          timeWindow: RATE_LIMIT_WINDOW_MS,
          // Per sender: one address flooding the app URL cannot starve every installation.
          keyGenerator: request => `git-app:${request.ip}`,
        },
      },
      schema: { params: ProviderParams, response: { 202: Accepted } },
    },
    async (request, reply) =>
      reply.ok(
        await ingest.receive({
          provider: request.params.provider,
          hookId: null,
          headers: request.headers,
          rawBody: (request.body as Buffer | undefined) ?? Buffer.alloc(0),
          now: now(),
        }),
        { status: 202 },
      ),
  );

  app.post(
    '/v1/git/webhooks/:provider/:hook_id',
    {
      bodyLimit: GIT_WEBHOOK_BODY_LIMIT_BYTES,
      config: {
        rateLimit: {
          max: GIT_WEBHOOK_RATE_LIMIT_PER_HOOK,
          timeWindow: RATE_LIMIT_WINDOW_MS,
          keyGenerator: request => `git-hook:${(request.params as { hook_id: string }).hook_id}`,
        },
      },
      schema: { params: HookParams, response: { 202: Accepted } },
      // An unknown hook is refused before its body is read.
      onRequest: async request => {
        const { provider, hook_id } = request.params as { provider: string; hook_id: string };
        if (!(await ingest.knowsHook(provider, hook_id))) throw new AppError('not_found', 404);
      },
    },
    async (request, reply) =>
      reply.ok(
        await ingest.receive({
          provider: request.params.provider,
          hookId: request.params.hook_id,
          headers: request.headers,
          rawBody: (request.body as Buffer | undefined) ?? Buffer.alloc(0),
          now: now(),
        }),
        { status: 202 },
      ),
  );
};

export default gitWebhookRoutes;

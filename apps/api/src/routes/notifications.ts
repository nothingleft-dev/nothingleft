import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  MarkedReadSchema,
  MarkNotificationsReadSchema,
  NOTIFICATION_KINDS,
  NotificationFacetsSchema,
  NotificationGroupSchema,
  NotificationPreferencesSchema,
  NotificationSchema,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  UnreadCountSchema,
  UnsubscribeSchema,
  UpdateNotificationPreferencesSchema,
  successEnvelope,
} from '@nothingleft/types';
import { orgHints } from '@lib/request';
import { requireAuth } from '@middleware/auth';
import type { NotificationsService } from '@services/notifications.service';

type Deps = { notifications: NotificationsService };

const flag = z.enum(['true', 'false']).transform(v => v === 'true');
const kinds = z
  .string()
  .transform(s =>
    s
      .split(',')
      .map(k => k.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.enum(NOTIFICATION_KINDS)).min(1));
const page = {
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION_MAX_LIMIT).default(PAGINATION_DEFAULT_LIMIT),
  unread: flag.optional(),
};
const InboxQuery = z.object({
  ...page,
  kind: kinds.optional(),
  project: z.string().min(1).max(40).optional(),
  org: z.string().min(1).max(100).optional(),
});
// The subject's organisation, for an entry outside the session's current one; absent resolves as usual.
const SubjectQuery = z.object({ ...page, org: z.string().min(1).max(100).optional() });
const TokenQuery = z.object({ token: z.string().min(1).max(500) });
const KeyParams = z.object({ key: z.string().min(1).max(40) });
const ArticleParams = KeyParams.extend({ slug: z.string().min(1).max(200) });

const notificationsRoutes: FastifyPluginAsyncZod<Deps> = async (app, { notifications }) => {
  // RFC 8058 one-click unsubscribe posts `List-Unsubscribe=One-Click` as a form.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) =>
    done(null, Object.fromEntries(new URLSearchParams(body as string))),
  );

  app.get(
    '/v1/notifications',
    {
      preHandler: requireAuth,
      schema: { querystring: InboxQuery, response: { 200: successEnvelope(z.array(NotificationGroupSchema)) } },
    },
    async (request, reply) => {
      const { data, pagination } = await notifications.list(request.principal!, request.query);
      return reply.ok(data, { pagination });
    },
  );

  app.get(
    '/v1/notifications/facets',
    { preHandler: requireAuth, schema: { response: { 200: successEnvelope(NotificationFacetsSchema) } } },
    async (request, reply) => reply.ok(await notifications.facets(request.principal!)),
  );

  app.get(
    '/v1/notifications/unread-count',
    { preHandler: requireAuth, schema: { response: { 200: successEnvelope(UnreadCountSchema) } } },
    async (request, reply) => reply.ok(await notifications.unreadCount(request.principal!)),
  );

  app.post(
    '/v1/notifications/read',
    {
      preHandler: requireAuth,
      schema: { body: MarkNotificationsReadSchema, response: { 200: successEnvelope(MarkedReadSchema) } },
    },
    async (request, reply) => reply.ok(await notifications.markRead(request.principal!, request.body)),
  );

  app.get(
    '/v1/notifications/preferences',
    { preHandler: requireAuth, schema: { response: { 200: successEnvelope(NotificationPreferencesSchema) } } },
    async (request, reply) => reply.ok(await notifications.getPreferences(request.principal!)),
  );

  app.patch(
    '/v1/notifications/preferences',
    {
      preHandler: requireAuth,
      schema: {
        body: UpdateNotificationPreferencesSchema,
        response: { 200: successEnvelope(NotificationPreferencesSchema) },
      },
    },
    async (request, reply) => reply.ok(await notifications.setPreferences(request.principal!, request.body)),
  );

  app.get(
    '/v1/issues/:key/notifications',
    {
      preHandler: requireAuth,
      schema: {
        params: KeyParams,
        querystring: SubjectQuery,
        response: { 200: successEnvelope(z.array(NotificationSchema)) },
      },
    },
    async (request, reply) => {
      const { data, pagination } = await notifications.listForIssue(
        request.principal!,
        request.params.key,
        request.query,
        orgHints(request),
        request.query.org,
      );
      return reply.ok(data, { pagination });
    },
  );

  app.get(
    '/v1/projects/:key/articles/:slug/notifications',
    {
      preHandler: requireAuth,
      schema: {
        params: ArticleParams,
        querystring: SubjectQuery,
        response: { 200: successEnvelope(z.array(NotificationSchema)) },
      },
    },
    async (request, reply) => {
      const { data, pagination } = await notifications.listForArticle(
        request.principal!,
        request.params.key,
        request.params.slug,
        request.query,
        orgHints(request),
        request.query.org,
      );
      return reply.ok(data, { pagination });
    },
  );

  // No sign-in: the signed token in the email is the credential, and it can only turn email off.
  app.get(
    '/v1/notifications/unsubscribe',
    { schema: { querystring: TokenQuery, response: { 200: successEnvelope(UnsubscribeSchema) } } },
    async (request, reply) => reply.ok(await notifications.previewUnsubscribe(request.query.token)),
  );

  app.post(
    '/v1/notifications/unsubscribe',
    {
      schema: {
        querystring: TokenQuery,
        body: z.object({ 'List-Unsubscribe': z.string().optional() }).passthrough().nullish(),
        response: { 200: successEnvelope(UnsubscribeSchema) },
      },
    },
    async (request, reply) =>
      reply.ok(
        await notifications.unsubscribe(request.query.token, request.body?.['List-Unsubscribe'] === 'One-Click'),
      ),
  );
};

export default notificationsRoutes;

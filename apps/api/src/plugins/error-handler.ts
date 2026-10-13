import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import type { ErrorBody } from '@nothingleft/types';
import type { Analytics } from '@nothingleft/analytics';
import { errorKey, t } from '@nothingleft/i18n';
import { AppError } from '@lib/errors';
import { isUniqueViolation } from '@lib/pg-errors';
import { REQUEST_ID_HEADER } from '@config/constants';
import { requestAttribution } from '@plugins/analytics';

const errorHandlerPlugin: FastifyPluginAsync<{ analytics: Analytics }> = async (app, { analytics }) => {
  app.setErrorHandler((err, request, reply) => {
    const request_id = request.id;
    const rawStatus = (err as { statusCode?: unknown }).statusCode;
    const httpStatus = typeof rawStatus === 'number' ? rawStatus : undefined;
    let status = 500;
    let body: ErrorBody = { code: 'internal', message: t('error.internal'), request_id };

    if (err instanceof AppError) {
      status = err.status;
      body = { code: err.code, message: err.message, request_id };
      if (err.field) body.field = err.field;
      if (err.validValues) body.valid_values = err.validValues;
      if (err.span) body.span = err.span;
      if (err.scope) body.scope = err.scope;
    } else if (hasZodFastifySchemaValidationErrors(err)) {
      status = 400;
      const first = err.validation[0];
      body = { code: 'validation_failed', message: t('error.validation_failed'), request_id };
      if (first?.instancePath) body.field = first.instancePath.replace(/^\//, '').replaceAll('/', '.');
    } else if (isResponseSerializationError(err)) {
      request.log.error({ err }, 'response failed schema validation');
    } else if (isUniqueViolation(err)) {
      status = 409;
      body = { code: 'conflict', message: t('error.conflict'), request_id };
    } else if (httpStatus === 429) {
      status = 429;
      body = { code: 'rate_limited', message: t('error.rate_limited'), request_id };
    } else if (httpStatus !== undefined && httpStatus < 500) {
      status = httpStatus;
      const code = httpStatus === 405 ? 'method_not_allowed' : 'validation_failed';
      body = { code, message: t(errorKey(code)), request_id };
    } else {
      // Unknown errors keep the generic message so internals never reach a client.
      request.log.error({ err }, 'unhandled error');
    }

    const route = request.routeOptions.url;
    if (route) {
      const { via, org, actor } = requestAttribution(request);
      analytics.capture(
        'api_error',
        { route, method: request.method, status_code: status, error_code: body.code, via, ...org },
        actor,
      );
    }

    if (status >= 500) {
      analytics.captureException(err, {
        request_id,
        ...(route ? { route } : {}),
        method: request.method,
        status_code: status,
        ...(request.principal ? { user_id: request.principal.userId } : {}),
      });
    }

    reply.header(REQUEST_ID_HEADER, request_id).status(status).send({ error: body });
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ErrorBody = { code: 'not_found', message: t('error.not_found'), request_id: request.id };
    reply.header(REQUEST_ID_HEADER, request.id).status(404).send({ error: body });
  });
};

export default fp(errorHandlerPlugin, { name: 'error-handler' });

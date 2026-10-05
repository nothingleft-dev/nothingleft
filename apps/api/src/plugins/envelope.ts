import { Readable } from 'node:stream';
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { IssueGroup, Meta, Pagination } from '@nothingleft/types';
import { REQUEST_ID_HEADER } from '@config/constants';

declare module 'fastify' {
  interface FastifyReply {
    ok<T>(
      data: T,
      extra?: { pagination?: Pagination; groups?: IssueGroup[] | undefined; status?: number },
    ): FastifyReply;
    /** A collection with no paging of its own still carries meta.pagination — api-conventions.md#rules. */
    okList<T>(data: T[], extra?: { status?: number }): FastifyReply;
    /** The one success that is not an envelope: a download. Errors still use the envelope. */
    csv(filename: string, body: string | AsyncIterable<string>): FastifyReply;
  }
}

const envelopePlugin: FastifyPluginAsync = async app => {
  app.decorateReply('ok', function (data, extra = {}) {
    const meta: Meta = { request_id: this.request.id };
    if (extra.pagination) meta.pagination = extra.pagination;
    if (extra.groups) meta.groups = extra.groups;
    this.header(REQUEST_ID_HEADER, this.request.id);
    return this.status(extra.status ?? 200).send({ data, meta });
  });

  app.decorateReply('okList', function (data, extra = {}) {
    return this.ok(data, {
      pagination: {
        total: data.length,
        limit: Math.max(data.length, 1),
        offset: 0,
        next_cursor: null,
        has_more: false,
      },
      ...extra,
    });
  });

  app.decorateReply('csv', function (filename: string, body: string | AsyncIterable<string>) {
    this.header(REQUEST_ID_HEADER, this.request.id);
    this.header('content-type', 'text/csv; charset=utf-8');
    this.header('content-disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`);
    return this.status(200).send(typeof body === 'string' ? body : Readable.from(body));
  });
};

export default fp(envelopePlugin, { name: 'envelope' });

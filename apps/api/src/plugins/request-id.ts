import { LogController, type FastifyServerOptions } from 'fastify';
import { REQUEST_ID_HEADER } from '@config/constants';

// v7 sorts by time in logs; an inbound id is kept so client trace and server log match.
export const requestIdOptions: Pick<FastifyServerOptions, 'genReqId' | 'requestIdHeader' | 'logController'> = {
  requestIdHeader: REQUEST_ID_HEADER,
  logController: new LogController({ requestIdLogLabel: 'request_id' }),
  genReqId: () => Bun.randomUUIDv7(),
};

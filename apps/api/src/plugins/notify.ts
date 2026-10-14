import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { JobQueue } from '@lib/jobs';
import { pending } from '@services/notify-outbox';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** After a successful write, each subject it touched gets one fan-out, deferred past the coalescing window. */
const notify: FastifyPluginAsync<{ queue: () => JobQueue; report: (error: unknown) => void }> = async (
  app,
  { queue, report },
) => {
  app.addHook('onRequest', (_request, _reply, done) => {
    pending.run(new Map(), done);
  });
  // onSend rather than onResponse: the write has committed, and the job is queued before the caller hears back.
  app.addHook('onSend', async (request, reply, payload) => {
    const store = pending.getStore();
    if (!store || store.size === 0 || !MUTATING.has(request.method) || reply.statusCode >= 400) return payload;
    const sent = await Promise.allSettled(
      [...store.values()].map(async entry =>
        queue().send('notify.fanout', entry.job, { startAfter: entry.startAfter, singletonKey: entry.key }),
      ),
    );
    for (const result of sent) if (result.status === 'rejected') report(result.reason);
    store.clear();
    return payload;
  });
};

export default fp(notify, { name: 'notify' });

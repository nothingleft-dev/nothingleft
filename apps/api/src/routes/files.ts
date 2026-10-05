import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '@middleware/auth';
import type { AttachmentsService } from '@services/attachments.service';

type Deps = { attachments: AttachmentsService; mountPath: string };

// The filename segment is for people reading the URL; the id alone finds the file.
const FileParams = z.object({ id: z.uuid(), filename: z.string().min(1).max(1024) });

const filesRoutes: FastifyPluginAsyncZod<Deps> = async (app, { attachments, mountPath }) => {
  app.get(
    `${mountPath}/:id/:filename`,
    { preHandler: requireAuth, schema: { params: FileParams } },
    async (request, reply) => {
      const { location, maxAge } = await attachments.download(request.principal!, request.params.id);
      return reply.header('Cache-Control', `private, max-age=${maxAge}`).redirect(location, 302);
    },
  );
};

export default filesRoutes;

import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { PALETTE_HUES } from '@nothingleft/types';
import { AVATAR_CACHE_SECONDS, AVATAR_SEED_MAX_LENGTH } from '@config/constants';
import { AVATAR_KINDS, renderAvatar } from '@lib/avatar';

const AvatarParams = z.object({ kind: z.enum(AVATAR_KINDS) });
const AvatarQuery = z.object({
  seed: z.string().min(1).max(AVATAR_SEED_MAX_LENGTH),
  color: z.enum(PALETTE_HUES).optional(),
});

// Anonymous like any image an <img> loads; the seed is already in the URL the API handed out.
const avatarsRoutes: FastifyPluginAsyncZod = async app => {
  app.get('/avatars/:kind', { schema: { params: AvatarParams, querystring: AvatarQuery } }, async (request, reply) =>
    reply.svg(renderAvatar(request.params.kind, request.query.seed, request.query.color), AVATAR_CACHE_SECONDS),
  );
};

export default avatarsRoutes;

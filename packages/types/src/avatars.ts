import { z } from 'zod';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from './constants.ts';

export const AvatarPresignRequestSchema = z.object({
  mime: z.enum(AVATAR_MIME_TYPES),
  size: z.number().int().positive().max(AVATAR_MAX_BYTES),
});
export type AvatarPresignRequest = z.infer<typeof AvatarPresignRequestSchema>;

export const AvatarPresignSchema = z.object({
  object_key: z.string(),
  upload_url: z.url(),
  expires_in: z.number().int().positive(),
});
export type AvatarPresign = z.infer<typeof AvatarPresignSchema>;

export const AvatarCompleteSchema = z.object({ object_key: z.string().min(1).max(200) });
export type AvatarComplete = z.infer<typeof AvatarCompleteSchema>;

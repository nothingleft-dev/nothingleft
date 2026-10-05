import { z } from 'zod';
import { PAT_SCOPES } from './constants.ts';

export const PersonalAccessTokenSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  token_prefix: z.string(),
  scopes: z.array(z.enum(PAT_SCOPES)),
  // Keys, not ids: rule 8 — a human identifier in every public interface.
  project_keys: z.array(z.string()).nullable(),
  expires_at: z.string().nullable(),
  last_used_at: z.string().nullable(),
  created_at: z.string(),
  revoked_at: z.string().nullable(),
});
export type PersonalAccessToken = z.infer<typeof PersonalAccessTokenSchema>;

// The token making the request, on GET /v1/me: an agent learns what it may do before it tries.
export const CurrentTokenSchema = PersonalAccessTokenSchema.pick({
  name: true,
  token_prefix: true,
  scopes: true,
  project_keys: true,
  expires_at: true,
});
export type CurrentToken = z.infer<typeof CurrentTokenSchema>;

export const CreatedPersonalAccessTokenSchema = PersonalAccessTokenSchema.extend({
  token: z.string(),
});
export type CreatedPersonalAccessToken = z.infer<typeof CreatedPersonalAccessTokenSchema>;

export const CreatePersonalAccessTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.enum(PAT_SCOPES)).min(1),
  project_keys: z.array(z.string().trim().min(1).max(10)).nullable().optional(),
  expires_at: z.iso.datetime().nullable().optional(),
});
export type CreatePersonalAccessToken = z.infer<typeof CreatePersonalAccessTokenSchema>;

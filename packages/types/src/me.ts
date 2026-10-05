import { z } from 'zod';
import { OAUTH_PROVIDERS, USER_THEMES } from './constants.ts';
import { CurrentTokenSchema } from './tokens.ts';
import { TwoFactorStatusSchema } from './security.ts';

export const UpdateMeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
});
export type UpdateMe = z.infer<typeof UpdateMeSchema>;

export const UpdatePreferencesSchema = z.object({
  theme: z.enum(USER_THEMES).optional(),
  // Where a returning user lands; null forgets it.
  last_project_key: z.string().trim().min(1).max(20).nullable().optional(),
  // Merged into the stored `ui` by top-level key; a key sent as null is removed.
  ui: z.record(z.string().min(1).max(100), z.unknown()).optional(),
});
export type UpdatePreferences = z.infer<typeof UpdatePreferencesSchema>;

export const UserPreferencesSchema = z.object({
  theme: z.enum(USER_THEMES),
  // The key, not last_project_id: a client routes on /projects/<key>, and rule 8 makes keys the public interface.
  last_project_key: z.string().nullable(),
  ui: z.record(z.string(), z.unknown()),
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const MeSchema = z.object({
  id: z.number().int(),
  email: z.email(),
  name: z.string(),
  avatar_url: z.string().nullable(),
  timezone: z.string(),
  email_verified_at: z.string().nullable(),
  has_password: z.boolean(),
  linked_providers: z.array(z.enum(OAUTH_PROVIDERS)),
  preferences: UserPreferencesSchema,
  // The session's organisation; null for a PAT, or a session in none yet.
  current_organization_slug: z.string().nullable(),
  // Null for a session.
  token: CurrentTokenSchema.nullable(),
  two_factor: TwoFactorStatusSchema,
});
export type Me = z.infer<typeof MeSchema>;

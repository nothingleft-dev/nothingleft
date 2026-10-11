import { z } from 'zod';
import { OAUTH_PROVIDERS } from './constants.ts';
import { TimezoneSchema } from './auth.ts';
import { MeSchema } from './me.ts';

export const OAuthProviderSchema = z.enum(OAUTH_PROVIDERS);

export const OAuthStartSchema = z.object({ authorize_url: z.url() });
export type OAuthStart = z.infer<typeof OAuthStartSchema>;

export const OAuthCallbackSchema = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(200),
  timezone: TimezoneSchema.optional(),
});
export type OAuthCallback = z.infer<typeof OAuthCallbackSchema>;

// Set only when the sign-in linked to an account whose address was never confirmed, which
// removes that account's password; the callback page explains it once.
export const OAuthNoticeSchema = z.object({
  kind: z.literal('unverified_account_linked'),
  account_created_at: z.string(),
});
export type OAuthNotice = z.infer<typeof OAuthNoticeSchema>;

export const OAuthSignInSchema = z.object({
  me: MeSchema,
  created: z.boolean(),
  notice: OAuthNoticeSchema.nullable(),
});
export type OAuthSignIn = z.infer<typeof OAuthSignInSchema>;

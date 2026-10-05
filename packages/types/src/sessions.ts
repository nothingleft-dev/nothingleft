import { z } from 'zod';

export const SessionSchema = z.object({
  id: z.number().int(),
  current: z.boolean(),
  user_agent: z.string().nullable(),
  ip: z.string().nullable(),
  country_code: z.string().nullable(),
  current_organization_slug: z.string().nullable(),
  created_at: z.string(),
  last_seen_at: z.string(),
  expires_at: z.string(),
});
export type Session = z.infer<typeof SessionSchema>;

export const SetCurrentOrganizationSchema = z.object({ slug: z.string().trim().min(1).max(100) });
export type SetCurrentOrganization = z.infer<typeof SetCurrentOrganizationSchema>;

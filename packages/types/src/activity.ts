import { z } from 'zod';
import { ORG_ACTIVITY_KINDS } from './constants.ts';

// A username is null when the actor never belonged to the organisation, such as an invitee declining.
export const ActivityActorSchema = z.object({
  username: z.string().nullable(),
  name: z.string(),
  avatar_url: z.string().nullable(),
  former_member: z.boolean(),
  // The account is deactivated: the real name still renders, greyed out.
  deactivated: z.boolean(),
});
export type ActivityActor = z.infer<typeof ActivityActorSchema>;

export const OrgActivitySchema = z.object({
  id: z.number().int(),
  kind: z.enum(ORG_ACTIVITY_KINDS),
  actor: ActivityActorSchema.nullable(),
  target_type: z.string(),
  target_id: z.string(),
  old_value: z.unknown().nullable(),
  new_value: z.unknown().nullable(),
  ip: z.string().nullable(),
  created_at: z.string(),
});
export type OrgActivity = z.infer<typeof OrgActivitySchema>;

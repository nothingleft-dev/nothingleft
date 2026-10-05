import { z } from 'zod';
import {
  EMAIL_INVITATION_BATCH_MAX,
  INVITATION_KINDS,
  INVITATION_STATUSES,
  ORG_ROLES,
  PROJECT_ROLES,
} from './constants.ts';
import { EmailSchema } from './auth.ts';
import { MemberRefSchema, OrganizationSchema } from './organizations.ts';

export const InvitationSchema = z.object({
  id: z.number().int(),
  kind: z.enum(INVITATION_KINDS),
  status: z.enum(INVITATION_STATUSES),
  email: z.string().nullable(),
  // Share links only; an email invitation's token exists only in the email.
  url: z.string().nullable(),
  project_key: z.string().nullable(),
  org_role: z.enum(ORG_ROLES),
  project_role: z.enum(PROJECT_ROLES).nullable(),
  max_uses: z.number().int().nullable(),
  use_count: z.number().int(),
  expires_at: z.string().nullable(),
  allowed_email_domain: z.string().nullable(),
  created_by: MemberRefSchema,
  created_at: z.string(),
  revoked_at: z.string().nullable(),
});
export type Invitation = z.infer<typeof InvitationSchema>;

export const InvitationUseSchema = MemberRefSchema.extend({ used_at: z.string() });
export type InvitationUse = z.infer<typeof InvitationUseSchema>;

export const CreateEmailInvitationsSchema = z.object({
  emails: z.array(EmailSchema).min(1).max(EMAIL_INVITATION_BATCH_MAX),
  org_role: z.enum(ORG_ROLES).optional(),
  project_role: z.enum(PROJECT_ROLES).optional(),
});
export type CreateEmailInvitations = z.infer<typeof CreateEmailInvitationsSchema>;

const DomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);

export const CreateInvitationLinkSchema = z.object({
  org_role: z.enum(ORG_ROLES).optional(),
  project_role: z.enum(PROJECT_ROLES).optional(),
  max_uses: z.number().int().positive().nullable().optional(),
  expires_at: z.iso.datetime().nullable().optional(),
  allowed_email_domain: DomainSchema.nullable().optional(),
});
export type CreateInvitationLink = z.infer<typeof CreateInvitationLinkSchema>;

export const InvitationTokenSchema = z.object({ token: z.string().min(1).max(200) });
export type InvitationToken = z.infer<typeof InvitationTokenSchema>;

export const InvitationPreviewSchema = z.object({
  kind: z.enum(INVITATION_KINDS),
  organization: z.object({ slug: z.string(), name: z.string(), avatar_url: z.string() }),
  project: z.object({ key: z.string(), name: z.string() }).nullable(),
  invited_by: z.object({ name: z.string(), avatar_url: z.string().nullable() }),
  org_role: z.enum(ORG_ROLES),
  project_role: z.enum(PROJECT_ROLES).nullable(),
  email: z.string().nullable(),
  allowed_email_domain: z.string().nullable(),
  expires_at: z.string().nullable(),
  // null when the caller is not signed in.
  already_member: z.boolean().nullable(),
});
export type InvitationPreview = z.infer<typeof InvitationPreviewSchema>;

export const AcceptedInvitationSchema = z.object({
  organization: OrganizationSchema,
  project_key: z.string().nullable(),
  already_member: z.boolean(),
});
export type AcceptedInvitation = z.infer<typeof AcceptedInvitationSchema>;

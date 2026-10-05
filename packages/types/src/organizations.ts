import { z } from 'zod';
import {
  BYO_STATUSES,
  ORG_PLANS,
  ORG_ROLES,
  STORAGE_LEVELS,
  WORKDAY_MINUTES_MAX,
  WORKWEEK_DAYS_MAX,
} from './constants.ts';

export const MemberRefSchema = z.object({
  username: z.string(),
  name: z.string(),
  avatar_url: z.string().nullable(),
  // Removed from the organisation: rendered with a Former member chip, never hidden.
  former_member: z.boolean(),
  // The account is deactivated: the real name still renders, greyed out.
  deactivated: z.boolean(),
});
export type MemberRef = z.infer<typeof MemberRefSchema>;

export const SeatsSchema = z.object({
  used: z.number().int().nonnegative(),
  // null on a plan with unlimited seats.
  free: z.number().int().positive().nullable(),
  over: z.number().int().nonnegative(),
});
export type Seats = z.infer<typeof SeatsSchema>;

export const StorageUsageSchema = z.object({
  used_bytes: z.number().int().nonnegative(),
  limit_bytes: z.number().int().positive(),
  // ok < 80% ≤ warning < 95% ≤ critical < 100% ≤ full, of limit_bytes.
  level: z.enum(STORAGE_LEVELS),
  // false where the server has no private bucket: every upload would answer storage.not_configured.
  configured: z.boolean(),
  // The organisation's own bucket, when one is connected. While verified, uploads go there,
  // nothing counts against limit_bytes and level stays ok. failed only after it had verified;
  // a setup whose first check failed reads pending.
  bring_your_own: z.enum(BYO_STATUSES).nullable(),
});
export type StorageUsage = z.infer<typeof StorageUsageSchema>;

export const OrganizationMembershipSchema = z.object({
  username: z.string(),
  org_role: z.enum(ORG_ROLES),
  is_owner: z.boolean(),
});
export type OrganizationMembership = z.infer<typeof OrganizationMembershipSchema>;

export const OrganizationDeletionSchema = z.object({
  scheduled_at: z.string(),
  deletes_at: z.string(),
});
export type OrganizationDeletion = z.infer<typeof OrganizationDeletionSchema>;

export const OrganizationSchema = z.object({
  slug: z.string(),
  name: z.string(),
  avatar_url: z.string(),
  plan: z.enum(ORG_PLANS),
  owner: MemberRefSchema,
  workday_minutes: z.number().int(),
  workweek_days: z.number().int(),
  week_starts_on: z.number().int(),
  seats: SeatsSchema,
  storage: StorageUsageSchema,
  membership: OrganizationMembershipSchema,
  // Set while the Owner's deletion request runs its grace period; every member sees it.
  deletion: OrganizationDeletionSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Organization = z.infer<typeof OrganizationSchema>;

const OrganizationNameSchema = z.string().trim().min(1).max(100);
// Format rules live in @nothingleft/format; this only bounds the input.
const SlugInputSchema = z.string().trim().min(1).max(100);

export const CreateOrganizationSchema = z.object({
  name: OrganizationNameSchema,
  slug: SlugInputSchema.optional(),
});
export type CreateOrganization = z.infer<typeof CreateOrganizationSchema>;

export const UpdateOrganizationSchema = z.object({
  name: OrganizationNameSchema.optional(),
  slug: SlugInputSchema.optional(),
  workday_minutes: z.number().int().min(1).max(WORKDAY_MINUTES_MAX).optional(),
  workweek_days: z.number().int().min(1).max(WORKWEEK_DAYS_MAX).optional(),
  week_starts_on: z.number().int().min(0).max(6).optional(),
});
export type UpdateOrganization = z.infer<typeof UpdateOrganizationSchema>;

export const MemberSchema = MemberRefSchema.extend({
  // Visible to org admins and to the member themselves; null for everyone else.
  email: z.string().nullable(),
  // Ownership can only be offered to a member whose address is verified.
  email_verified: z.boolean(),
  org_role: z.enum(ORG_ROLES),
  is_owner: z.boolean(),
  joined_at: z.string(),
  invited_by: z.string().nullable(),
});
export type Member = z.infer<typeof MemberSchema>;

const UsernameInputSchema = z.string().trim().min(1).max(40);

export const UpdateMemberSchema = z.object({
  username: UsernameInputSchema.optional(),
  org_role: z.enum(ORG_ROLES).optional(),
});
export type UpdateMember = z.infer<typeof UpdateMemberSchema>;

export const RemovalPreviewSchema = z.object({
  member: MemberRefSchema,
  open_assigned: z.number().int().nonnegative(),
  resolved_assigned: z.number().int().nonnegative(),
  created: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  time_logged_minutes: z.number().int().nonnegative(),
  saved_views: z.number().int().nonnegative(),
  sessions: z.number().int().nonnegative(),
  access_tokens: z.number().int().nonnegative(),
  // Assignable in every project holding one of their open issues; empty when there are none.
  reassign_candidates: z.array(MemberRefSchema),
});
export type RemovalPreview = z.infer<typeof RemovalPreviewSchema>;

// Query parameters, since a DELETE body is dropped by some proxies. Absent leaves the
// open issues unassigned and deletes the saved views.
export const RemoveMemberSchema = z.object({
  reassign_to: UsernameInputSchema.optional(),
  transfer_views_to: UsernameInputSchema.optional(),
});
export type RemoveMember = z.infer<typeof RemoveMemberSchema>;

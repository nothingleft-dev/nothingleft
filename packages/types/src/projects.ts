import { z } from 'zod';
import { ORG_ROLES, PALETTE_HUES, PROJECT_ROLES } from './constants.ts';
import { MemberRefSchema } from './organizations.ts';

export const ProjectSchema = z.object({
  key: z.string(),
  name: z.string(),
  slug: z.string(),
  description_md: z.string().nullable(),
  avatar_color: z.enum(PALETTE_HUES),
  avatar_initials: z.string(),
  // DiceBear initials seeded by the key; avatar_color and avatar_initials draw the mark while it loads.
  avatar_url: z.string(),
  lead: MemberRefSchema.nullable(),
  is_archived: z.boolean(),
  // Off hides Estimation, Spent time and logging; work items already written are kept.
  time_tracking_enabled: z.boolean(),
  // A duration custom field standing in for the built-in Estimation or Spent time; null is the built-in.
  estimation_field: z.object({ slug: z.string(), name: z.string() }).nullable(),
  spent_time_field: z.object({ slug: z.string(), name: z.string() }).nullable(),
  // False once the first issue exists: PROJ-123 is said out loud, so the key freezes.
  key_editable: z.boolean(),
  // The caller's effective role: an org admin reads as project_admin everywhere.
  my_role: z.enum(PROJECT_ROLES),
  // What the caller may do in the knowledge base as a whole; each article carries its own `me`.
  knowledge_base: z.object({ can_create: z.boolean(), can_move: z.boolean() }),
  // It has a linked repository: the git surfaces show.
  git_enabled: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

const ProjectNameSchema = z.string().trim().min(1).max(100);
const ProjectKeyInputSchema = z.string().trim().min(1).max(20);
const DescriptionSchema = z.string().max(20_000);

export const CreateProjectSchema = z.object({
  name: ProjectNameSchema,
  key: ProjectKeyInputSchema.optional(),
  description_md: DescriptionSchema.optional(),
  avatar_color: z.enum(PALETTE_HUES).optional(),
});
export type CreateProject = z.infer<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z.object({
  name: ProjectNameSchema.optional(),
  key: ProjectKeyInputSchema.optional(),
  description_md: DescriptionSchema.nullable().optional(),
  avatar_color: z.enum(PALETTE_HUES).optional(),
  lead: z.string().trim().min(1).max(40).nullable().optional(),
  time_tracking_enabled: z.boolean().optional(),
  // A duration custom field's slug or name; null returns to the built-in.
  estimation_field: z.string().trim().min(1).max(100).nullable().optional(),
  spent_time_field: z.string().trim().min(1).max(100).nullable().optional(),
});
export type UpdateProject = z.infer<typeof UpdateProjectSchema>;

export const ProjectMemberSchema = MemberRefSchema.extend({
  role: z.enum(PROJECT_ROLES),
  org_role: z.enum(ORG_ROLES),
  added_at: z.string(),
});
export type ProjectMember = z.infer<typeof ProjectMemberSchema>;

export const AddProjectMemberSchema = z.object({
  username: z.string().trim().min(1).max(40),
  role: z.enum(PROJECT_ROLES),
});
export type AddProjectMember = z.infer<typeof AddProjectMemberSchema>;

export const UpdateProjectMemberSchema = z.object({ role: z.enum(PROJECT_ROLES) });
export type UpdateProjectMember = z.infer<typeof UpdateProjectMemberSchema>;

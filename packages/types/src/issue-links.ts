import { z } from 'zod';
import { ISSUE_LINK_MAX_TARGETS, ISSUE_LINK_TYPES, LINK_DIRECTIONS } from './constants.ts';
import { IssueRefSchema } from './issues.ts';

export const IssueLinkGroupSchema = z.object({
  // As read from this issue: `depends on`, `parent for`…
  link: z.string(),
  type: z.enum(ISSUE_LINK_TYPES),
  direction: z.enum(LINK_DIRECTIONS),
  count: z.number().int(),
  issues: z.array(IssueRefSchema),
});
export type IssueLinkGroup = z.infer<typeof IssueLinkGroupSchema>;

const LinkNameSchema = z.string().trim().min(1).max(40);
const IssueKeySchema = z.string().trim().min(1).max(40);

export const CreateIssueLinksSchema = z.object({
  link: LinkNameSchema,
  issues: z.array(IssueKeySchema).min(1).max(ISSUE_LINK_MAX_TARGETS),
});
export type CreateIssueLinks = z.infer<typeof CreateIssueLinksSchema>;

export const DeleteIssueLinkQuerySchema = z.object({ link: LinkNameSchema });

import { z } from 'zod';
import { EMAIL_INVITATION_BATCH_MAX, type Invitation } from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { resolveOrganization } from '../organizations.ts';
import { code, date, facts, join, roleLabel, table } from '../render.ts';

const scopeInput = {
  org: arg.org,
  project: arg.project
    .optional()
    .describe('Project key, e.g. "PP". Invites into that project as well as its organisation.'),
  org_role: arg.orgRole.optional().describe('Role in the organisation. Default Member.'),
  project_role: arg.projectRole.optional().describe('Role in `project`. Default Contributor. Needs `project`.'),
};

async function target(ctx: ToolContext, args: { org?: string | undefined; project?: string | undefined }) {
  if (args.project) {
    const key = args.project.toUpperCase();
    return { base: path`/v1/projects/${key}/invitations`, label: `project ${key}`, org: args.org };
  }
  const org = await resolveOrganization(ctx, args.org);
  return { base: path`/v1/organizations/${org.slug}/invitations`, label: `${org.name} (${code(org.slug)})` };
}

const roles = (args: {
  org_role?: keyof typeof arg.ORG_ROLES | undefined;
  project_role?: keyof typeof arg.PROJECT_ROLES | undefined;
}) => ({
  ...(args.org_role ? { org_role: arg.ORG_ROLES[args.org_role] } : {}),
  ...(args.project_role ? { project_role: arg.PROJECT_ROLES[args.project_role] } : {}),
});

const expires = (i: Invitation) => (i.expires_at ? date(i.expires_at) : 'never');

export const inviteMember = defineTool({
  name: 'invite_member',
  title: 'Invite by email',
  description: `Emails an invitation to join an organisation, or a project within it. Up to ${EMAIL_INVITATION_BATCH_MAX} addresses per call; someone already invited gets a fresh email.`,
  input: z.strictObject({
    emails: z.array(z.email()).min(1).max(EMAIL_INVITATION_BATCH_MAX).describe('Email addresses to invite.'),
    ...scopeInput,
  }),
  kind: 'write',
  endpoints: [
    'GET /v1/organizations',
    'POST /v1/organizations/{slug}/invitations/emails',
    'POST /v1/projects/{key}/invitations/emails',
  ],
  async run(ctx, args) {
    const where = await target(ctx, args);
    const { data } = await ctx.api.send<Invitation[]>('POST', `${where.base}/emails`, {
      body: { emails: args.emails, ...roles(args) },
      ...(where.org ? { org: where.org } : {}),
    });
    return {
      markdown: join(
        `Invited ${data.length} ${data.length === 1 ? 'person' : 'people'} to ${where.label}.`,
        table(
          ['Email', 'Org role', 'Project', 'Project role', 'Expires'],
          data.map(i => [
            i.email ?? '—',
            roleLabel(i.org_role),
            i.project_key ?? '—',
            i.project_role ? roleLabel(i.project_role) : '—',
            expires(i),
          ]),
        ),
      ),
    };
  },
});

export const createInviteLink = defineTool({
  name: 'create_invite_link',
  title: 'Create invite link',
  description:
    'Creates a share link that lets anyone who opens it join the organisation, or a project within it. Optionally limit its uses, its expiry date or the email domain allowed to use it.',
  input: z.strictObject({
    ...scopeInput,
    max_uses: z
      .number()
      .int()
      .min(1)
      .max(10_000)
      .optional()
      .describe('How many people may join with it. Default unlimited.'),
    expires_on: z.iso
      .date()
      .optional()
      .describe('Last day the link works, as YYYY-MM-DD (UTC). Default: it never expires.'),
    allowed_email_domain: z
      .string()
      .trim()
      .min(3)
      .max(253)
      .optional()
      .describe('Only accounts with an email at this domain may join, e.g. "acme.com".'),
  }),
  kind: 'write',
  endpoints: [
    'GET /v1/organizations',
    'POST /v1/organizations/{slug}/invitations/links',
    'POST /v1/projects/{key}/invitations/links',
  ],
  async run(ctx, args) {
    const where = await target(ctx, args);
    const { data: link } = await ctx.api.send<Invitation>('POST', `${where.base}/links`, {
      body: {
        ...roles(args),
        ...(args.max_uses ? { max_uses: args.max_uses } : {}),
        ...(args.expires_on ? { expires_at: `${args.expires_on}T23:59:59Z` } : {}),
        ...(args.allowed_email_domain ? { allowed_email_domain: args.allowed_email_domain } : {}),
      },
      ...(where.org ? { org: where.org } : {}),
    });
    return {
      markdown: join(
        `Created an invite link for ${where.label}. Anyone who opens it can join, within the limits below.`,
        link.url,
        facts([
          ['Joins as', roleLabel(link.org_role)],
          ['Project', link.project_key],
          ['Project role', link.project_role ? roleLabel(link.project_role) : null],
          ['Uses', link.max_uses === null ? `${link.use_count}, unlimited` : `${link.use_count} of ${link.max_uses}`],
          ['Expires', expires(link)],
          ['Email domain', link.allowed_email_domain],
        ]),
      ),
    };
  },
});

import { z } from 'zod';
import { t } from '@nothingleft/i18n';
import type { Invitation, InvitationUse, Member, Organization, RemovalPreview } from '@nothingleft/types';
import * as arg from '../args.ts';
import { path } from '../api.ts';
import { ToolError } from '../errors.ts';
import { defineTool, type ToolContext } from '../tool.ts';
import { resolveOrganization } from '../organizations.ts';
import { calendarOf, projectOrganization, resolveUsername } from '../resolve.ts';
import { code, date, facts, instant, join, person, roleLabel, table } from '../render.ts';
import { duration } from '../render-issue.ts';

const removalInput = z.strictObject({
  user: arg.person,
  reassign_to: arg.person
    .optional()
    .describe('Who takes over their open issues. Default: the issues become unassigned.'),
  transfer_views_to: arg.person.optional().describe('Who receives their saved views. Default: the views are deleted.'),
  org: arg.org,
});

async function removal(ctx: ToolContext, args: z.output<typeof removalInput>) {
  const org = await resolveOrganization(ctx, args.org);
  const username = await resolveUsername(ctx, org, args.user);
  const reassign = args.reassign_to ? await resolveUsername(ctx, org, args.reassign_to) : undefined;
  const transfer = args.transfer_views_to ? await resolveUsername(ctx, org, args.transfer_views_to) : undefined;
  return { org, username, reassign, transfer };
}

export const removeMember = defineTool({
  name: 'remove_member',
  title: 'Remove a member',
  description:
    'Removes someone from the organisation: their open issues go to `reassign_to` or become unassigned, their saved views go to `transfer_views_to` or are deleted, their sessions and organisation-only tokens end. Their history stays, marked as a former member. Asks you to confirm before acting, with the real counts. Needs an Org Admin and admin:org.',
  input: removalInput,
  kind: 'destructive',
  endpoints: [
    'GET /v1/organizations',
    'GET /v1/organizations/{slug}/members',
    'GET /v1/organizations/{slug}/members/{username}/removal',
    'DELETE /v1/organizations/{slug}/members/{username}',
  ],
  async describeAction(ctx, args) {
    const { org, username, reassign, transfer } = await removal(ctx, args);
    const { data: p } = await ctx.api.get<RemovalPreview>(
      path`/v1/organizations/${org.slug}/members/${username}/removal`,
    );
    const action = t('mcp.action.member_remove', {
      username: person(p.member),
      org: org.name,
      open: p.open_assigned,
      reassign: reassign ? `reassigned to @${reassign}` : 'left unassigned',
      views: p.saved_views,
      transfer: transfer ? `moved to @${transfer}` : 'deleted',
      tokens: p.access_tokens,
      sessions: p.sessions,
    });
    const candidates = p.reassign_candidates.length
      ? ` Can take over every open issue: ${p.reassign_candidates.map(c => `@${c.username}`).join(', ')}.`
      : '';
    return `${action}. They keep ${p.created} created issues, ${p.comments} comments and ${duration(p.time_logged_minutes, calendarOf(org))} logged, shown under their name.${candidates}`;
  },
  async run(ctx, args) {
    const { org, username, reassign, transfer } = await removal(ctx, args);
    const { data: m } = await ctx.api.send<Member>('DELETE', path`/v1/organizations/${org.slug}/members/${username}`, {
      query: { reassign_to: reassign, transfer_views_to: transfer },
    });
    return {
      markdown: join(
        `Removed ${person(m)} from ${org.name} (${code(org.slug)}).`,
        facts([
          ['Open issues', reassign ? `reassigned to @${reassign}` : 'unassigned'],
          ['Saved views', transfer ? `moved to @${transfer}` : 'deleted'],
          ['History', 'kept, marked former member'],
        ]),
      ),
    };
  },
});

const invitationArg = z
  .string()
  .trim()
  .min(3)
  .max(500)
  .describe('The invited email address, or the share link (the whole URL or its last part).');
const where = {
  project: arg.project.optional().describe('For an invitation into a project, its key.'),
  org: arg.org,
};

async function listFor(ctx: ToolContext, args: { project?: string | undefined; org?: string | undefined }) {
  const key = args.project?.toUpperCase();
  const org: Organization = key
    ? await projectOrganization(ctx, key, args.org)
    : await resolveOrganization(ctx, args.org);
  const { data } = key
    ? await ctx.api.get<Invitation[]>(path`/v1/projects/${key}/invitations`, { org: org.slug })
    : await ctx.api.get<Invitation[]>(path`/v1/organizations/${org.slug}/invitations`);
  return { org, key, invitations: data };
}

const tokenOf = (url: string) =>
  url
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .split('/')
    .pop() ?? '';

async function findInvitation(
  ctx: ToolContext,
  args: { invitation: string; project?: string | undefined; org?: string | undefined },
) {
  const { org, invitations } = await listFor(ctx, args);
  const wanted = args.invitation.toLowerCase();
  const matches = invitations.filter(i =>
    wanted.includes('@') && !wanted.includes('/')
      ? i.email?.toLowerCase() === wanted
      : i.url && tokenOf(i.url) === tokenOf(args.invitation),
  );
  const found = matches.find(i => i.status === 'active') ?? matches[0];
  if (!found) {
    const live = invitations.filter(i => i.status === 'active');
    throw ToolError.local(
      'mcp.invitation_not_found',
      { invitation: args.invitation },
      { field: 'invitation', valid_values: live.map(i => i.email ?? i.url ?? '').filter(Boolean) },
    );
  }
  return { org, invitation: found };
}

const label = (i: Invitation) => i.email ?? i.url ?? `invitation ${i.id}`;
const roles = (i: Invitation) =>
  i.project_key ? `${roleLabel(i.project_role ?? 'contributor')} in ${i.project_key}` : roleLabel(i.org_role);

function invitationFacts(i: Invitation) {
  return facts([
    ['Kind', i.kind === 'email' ? 'Email invitation' : 'Share link'],
    ['Status', i.status],
    ['Grants', roles(i)],
    ['Link', i.url],
    ['Uses', i.kind === 'email' ? null : `${i.use_count}${i.max_uses ? ` of ${i.max_uses}` : ''}`],
    ['Email domain', i.allowed_email_domain],
    ['Expires', i.expires_at ? date(i.expires_at) : 'never'],
    ['Created', `${instant(i.created_at)} by ${person(i.created_by)}`],
    ['Revoked', i.revoked_at ? instant(i.revoked_at) : null],
  ]);
}

export const listInvitations = defineTool({
  name: 'list_invitations',
  title: 'List invitations',
  description:
    "The organisation's invitations - or one project's - with status, the role each grants, and uses for share links.",
  input: z.strictObject(where),
  kind: 'read',
  endpoints: [
    'GET /v1/organizations',
    'GET /v1/organizations/{slug}/invitations',
    'GET /v1/projects/{key}/invitations',
  ],
  async run(ctx, args) {
    const { org, key, invitations } = await listFor(ctx, args);
    return {
      markdown: join(
        `**${key ? `Project ${key}` : org.name}** — ${invitations.length} invitations`,
        invitations.length
          ? table(
              ['Invitation', 'Status', 'Grants', 'Uses', 'Expires', 'By'],
              invitations.map(i => [
                label(i),
                i.status,
                roles(i),
                i.kind === 'email' ? '—' : `${i.use_count}${i.max_uses ? `/${i.max_uses}` : ''}`,
                i.expires_at ? date(i.expires_at) : 'never',
                person(i.created_by),
              ]),
            )
          : null,
      ),
    };
  },
});

export const getInvitation = defineTool({
  name: 'get_invitation',
  title: 'Get invitation',
  description: 'One invitation by email or link, with everyone who joined through it.',
  input: z.strictObject({ invitation: invitationArg, ...where }),
  kind: 'read',
  endpoints: [
    'GET /v1/organizations',
    'GET /v1/organizations/{slug}/invitations',
    'GET /v1/projects/{key}/invitations',
    'GET /v1/organizations/{slug}/invitations/{id}',
    'GET /v1/organizations/{slug}/invitations/{id}/uses',
  ],
  async run(ctx, args) {
    const { org, invitation } = await findInvitation(ctx, args);
    const id = String(invitation.id);
    const [{ data: i }, { data: uses }] = await Promise.all([
      ctx.api.get<Invitation>(path`/v1/organizations/${org.slug}/invitations/${id}`),
      ctx.api.get<InvitationUse[]>(path`/v1/organizations/${org.slug}/invitations/${id}/uses`),
    ]);
    return {
      markdown: join(
        `**${label(i)}**`,
        invitationFacts(i),
        uses.length
          ? `**Joined through it**\n${uses.map(u => `- ${person(u)} · ${instant(u.used_at)}`).join('\n')}`
          : 'Nobody has joined through it.',
      ),
    };
  },
});

export const revokeInvitation = defineTool({
  name: 'revoke_invitation',
  title: 'Revoke invitation',
  description:
    'Stops an invitation or share link from working. People who already joined stay. Asks you to confirm before acting.',
  input: z.strictObject({ invitation: invitationArg, ...where }),
  kind: 'destructive',
  endpoints: [
    'GET /v1/organizations',
    'GET /v1/organizations/{slug}/invitations',
    'GET /v1/projects/{key}/invitations',
    'DELETE /v1/organizations/{slug}/invitations/{id}',
  ],
  async describeAction(ctx, args) {
    const { invitation } = await findInvitation(ctx, args);
    return t('mcp.action.invitation_revoke', { invitation: `${label(invitation)} (${roles(invitation)})` });
  },
  async run(ctx, args) {
    const { org, invitation } = await findInvitation(ctx, args);
    const { data: i } = await ctx.api.send<Invitation>(
      'DELETE',
      path`/v1/organizations/${org.slug}/invitations/${String(invitation.id)}`,
    );
    return { markdown: join(`Revoked **${label(i)}**.`, invitationFacts(i)) };
  },
});

export const rotateInviteLink = defineTool({
  name: 'rotate_invite_link',
  title: 'Replace a share link',
  description:
    'Replaces a share link with a new URL carrying the same role and limits; the old URL stops working. Asks you to confirm before acting.',
  input: z.strictObject({ link: invitationArg.describe('The share link to replace.'), ...where }),
  kind: 'destructive',
  endpoints: [
    'GET /v1/organizations',
    'GET /v1/organizations/{slug}/invitations',
    'GET /v1/projects/{key}/invitations',
    'POST /v1/organizations/{slug}/invitations/{id}/rotate',
  ],
  async describeAction(ctx, args) {
    const { invitation } = await findInvitation(ctx, { ...args, invitation: args.link });
    return t('mcp.action.invite_link_rotate', { invitation: `${label(invitation)} (${roles(invitation)})` });
  },
  async run(ctx, args) {
    const { org, invitation } = await findInvitation(ctx, { ...args, invitation: args.link });
    const { data: i } = await ctx.api.send<Invitation>(
      'POST',
      path`/v1/organizations/${org.slug}/invitations/${String(invitation.id)}/rotate`,
    );
    return { markdown: join(`New link: ${i.url}`, invitationFacts(i)) };
  },
});

import type {
  AcceptedInvitation,
  Acknowledgement,
  CreateEmailInvitations,
  CreateInvitationLink,
  Invitation,
  InvitationPreview,
  InvitationUse,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

const orgBase = (slug: string) => `/v1/organizations/${encodeURIComponent(slug)}/invitations`;
const projectBase = (key: string) => `/v1/projects/${encodeURIComponent(key)}/invitations`;

/** Which scope an invitation is created in. Revoke, rotate and uses are addressed by id under the organisation either way. */
export type InviteScope = { kind: 'organization'; slug: string } | { kind: 'project'; key: string };

const createBase = (scope: InviteScope) =>
  scope.kind === 'organization' ? orgBase(scope.slug) : projectBase(scope.key);

export const listInvitations = (scope: InviteScope) => api.get<Invitation[]>(createBase(scope));

export const createEmailInvitations = (scope: InviteScope, body: CreateEmailInvitations) =>
  api.post<Invitation[]>(`${createBase(scope)}/emails`, { body });

export const createInvitationLink = (scope: InviteScope, body: CreateInvitationLink) =>
  api.post<Invitation>(`${createBase(scope)}/links`, { body });

export const revokeInvitation = (slug: string, id: number) => api.delete<Invitation>(`${orgBase(slug)}/${id}`);

export const rotateInvitation = (slug: string, id: number) => api.post<Invitation>(`${orgBase(slug)}/${id}/rotate`);

export const listInvitationUses = (slug: string, id: number) => api.get<InvitationUse[]>(`${orgBase(slug)}/${id}/uses`);

// The token travels in the body so it never reaches an access log — auth-and-tenancy.md § Invitations.
export const previewInvitation = (token: string) =>
  api.post<InvitationPreview>('/v1/invitations/preview', { body: { token }, idempotencyKey: false });

export const acceptInvitation = (token: string) =>
  api.post<AcceptedInvitation>('/v1/invitations/accept', { body: { token } });

export const declineInvitation = (token: string) =>
  api.post<Acknowledgement>('/v1/invitations/decline', { body: { token } });

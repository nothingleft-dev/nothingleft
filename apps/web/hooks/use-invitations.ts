'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateEmailInvitations, CreateInvitationLink } from '@nothingleft/types';
import {
  acceptInvitation,
  createEmailInvitations,
  createInvitationLink,
  declineInvitation,
  listInvitationUses,
  listInvitations,
  previewInvitation,
  revokeInvitation,
  rotateInvitation,
  type InviteScope,
} from '@lib/api/invitations';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useInvitations(scope: InviteScope, enabled = true) {
  return useQuery({
    queryKey: queryKeys.invitations(scope),
    refetchInterval: POLL.admin,
    queryFn: () => listInvitations(scope).then(r => r.data),
    enabled,
  });
}

export function useInvitationUses(slug: string, id: number | null) {
  return useQuery({
    queryKey: queryKeys.invitationUses(slug, id ?? 0),
    refetchInterval: POLL.admin,
    queryFn: () => listInvitationUses(slug, id as number).then(r => r.data),
    enabled: id !== null,
  });
}

function useInvitationMutation<TInput, TResult>(scope: InviteScope, fn: (input: TInput) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.invitations(scope) }),
  });
}

export const useInviteByEmail = (scope: InviteScope) =>
  useInvitationMutation(scope, (body: CreateEmailInvitations) => createEmailInvitations(scope, body).then(r => r.data));

export const useCreateInvitationLink = (scope: InviteScope) =>
  useInvitationMutation(scope, (body: CreateInvitationLink) => createInvitationLink(scope, body).then(r => r.data));

export const useRevokeInvitation = (scope: InviteScope, slug: string) =>
  useInvitationMutation(scope, (id: number) => revokeInvitation(slug, id).then(r => r.data));

export const useRotateInvitation = (scope: InviteScope, slug: string) =>
  useInvitationMutation(scope, (id: number) => rotateInvitation(slug, id).then(r => r.data));

/** Anonymous and cheap; the landing page asks for nothing until this has answered. */
export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: ['invitations', 'preview', token] as const,
    queryFn: () => previewInvitation(token).then(r => r.data),
    retry: false,
    staleTime: 0,
  });
}

export function useAcceptInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => acceptInvitation(token).then(r => r.data),
    onSuccess: () => {
      // Accepting switches the session into the organisation joined.
      void client.invalidateQueries({ queryKey: queryKeys.me() });
      void client.invalidateQueries({ queryKey: queryKeys.organizations() });
      void client.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export const useDeclineInvitation = () => useMutation({ mutationFn: (token: string) => declineInvitation(token) });

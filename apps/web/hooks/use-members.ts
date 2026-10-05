'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Member, RemoveMember, UpdateMember } from '@nothingleft/types';
import { getRemovalPreview, listMembers, removeMember, updateMember, type MemberQuery } from '@lib/api/members';
import { POLL } from '@lib/query/poll';
import { optimisticList } from '@lib/query/optimistic';
import { queryKeys } from '@lib/query/keys';

export function useMembers(slug: string | null, query: MemberQuery = {}) {
  return useQuery({
    queryKey: queryKeys.members(slug ?? '', query),
    refetchInterval: POLL.admin,
    queryFn: () => listMembers(slug as string, query).then(r => r.data),
    enabled: slug !== null,
  });
}

function useMemberMutation<TInput>(
  slug: string,
  fn: (input: TInput) => Promise<unknown>,
  draw: (members: Member[], input: TInput) => Member[],
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    ...optimisticList(client, ['organizations', slug, 'members'], draw),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['organizations', slug, 'members'] });
      void client.invalidateQueries({ queryKey: queryKeys.organization(slug) });
    },
  });
}

export const useUpdateMember = (slug: string) =>
  useMemberMutation(
    slug,
    ({ username, body }: { username: string; body: UpdateMember }) =>
      updateMember(slug, username, body).then(r => r.data),
    (members, { username, body }) =>
      members.map(m => (m.username === username && body.org_role ? { ...m, org_role: body.org_role } : m)),
  );

export function useRemovalPreview(slug: string, username: string | null) {
  return useQuery({
    queryKey: queryKeys.removalPreview(slug, username ?? ''),
    queryFn: () => getRemovalPreview(slug, username as string).then(r => r.data),
    enabled: username !== null,
    staleTime: 0,
  });
}

// Removal rewrites assignees, saved views and seats, so every list that shows one refreshes.
export function useRemoveMember(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ username, choices }: { username: string; choices: RemoveMember }) =>
      removeMember(slug, username, choices).then(r => r.data),
    ...optimisticList<Member[], { username: string }>(
      client,
      ['organizations', slug, 'members'],
      (members, { username }) => members.filter(m => m.username !== username),
    ),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ['organizations', slug] });
      void client.invalidateQueries({ queryKey: ['issues'] });
      void client.invalidateQueries({ queryKey: queryKeys.savedViews() });
      void client.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

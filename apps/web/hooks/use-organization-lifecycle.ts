'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InitiateOwnershipTransfer, Organization, StepUp } from '@nothingleft/types';
import {
  acceptTransfer,
  cancelDeletion,
  cancelTransfer,
  declineTransfer,
  getPendingTransfer,
  offerOwnership,
  previewTransfer,
  scheduleDeletion,
} from '@lib/api/ownership-transfers';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

function useStoreOrganization() {
  const client = useQueryClient();
  return (organization: Organization) => {
    client.setQueryData(queryKeys.organization(organization.slug), organization);
    client.setQueryData<Organization[]>(queryKeys.organizations(), list =>
      list?.map(o => (o.slug === organization.slug ? organization : o)),
    );
  };
}

export function useScheduleDeletion(slug: string) {
  const client = useQueryClient();
  const store = useStoreOrganization();
  return useMutation({
    mutationFn: (body: StepUp) => scheduleDeletion(slug, body).then(r => r.data),
    onSuccess: organization => {
      store(organization);
      // Scheduling drops a pending transfer.
      client.setQueryData(queryKeys.pendingTransfer(slug), null);
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ['organizations', slug, 'activity'] }),
  });
}

export function useCancelDeletion(slug: string) {
  const client = useQueryClient();
  const store = useStoreOrganization();
  return useMutation({
    mutationFn: () => cancelDeletion(slug).then(r => r.data),
    onMutate: async () => {
      const key = queryKeys.organization(slug);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<Organization>(key);
      if (previous) store({ ...previous, deletion: null });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) store(context.previous);
    },
    onSuccess: store,
    onSettled: () => void client.invalidateQueries({ queryKey: queryKeys.organizations() }),
  });
}

export function usePendingTransfer(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.pendingTransfer(slug),
    refetchInterval: POLL.admin,
    queryFn: () => getPendingTransfer(slug).then(r => r.data),
    enabled,
  });
}

export function useOfferOwnership(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: InitiateOwnershipTransfer) => offerOwnership(slug, body).then(r => r.data),
    onSuccess: transfer => client.setQueryData(queryKeys.pendingTransfer(slug), transfer),
  });
}

export function useCancelTransfer(slug: string) {
  const client = useQueryClient();
  const key = queryKeys.pendingTransfer(slug);
  return useMutation({
    mutationFn: () => cancelTransfer(slug).then(r => r.data),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData(key);
      client.setQueryData(key, null);
      return { previous };
    },
    onError: (_error, _input, context) => client.setQueryData(key, context?.previous ?? null),
    onSettled: () => void client.invalidateQueries({ queryKey: key }),
  });
}

// Read once: the offer does not change under the reader, and a refocus must not turn an
// accepted offer into an "invalid link" screen.
export function useTransferPreview(token: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.transferPreview(token),
    queryFn: () => previewTransfer(token).then(r => r.data),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useAcceptTransfer() {
  const client = useQueryClient();
  const store = useStoreOrganization();
  return useMutation({
    mutationFn: (token: string) => acceptTransfer(token).then(r => r.data),
    onSuccess: organization => {
      store(organization);
      void client.invalidateQueries({ queryKey: queryKeys.organizations() });
    },
  });
}

export const useDeclineTransfer = () =>
  useMutation({ mutationFn: (token: string) => declineTransfer(token).then(r => r.data) });

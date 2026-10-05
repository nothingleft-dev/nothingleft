'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateOrganization, Me, UpdateOrganization } from '@nothingleft/types';
import { createOrganization, getOrganization, listOrganizations, updateOrganization } from '@lib/api/organizations';
import { setCurrentOrganization } from '@lib/api/me';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useOrganizations(enabled = true) {
  return useQuery({
    queryKey: queryKeys.organizations(),
    refetchInterval: POLL.admin,
    queryFn: () => listOrganizations().then(r => r.data),
    enabled,
  });
}

export function useOrganization(slug: string | null) {
  return useQuery({
    queryKey: queryKeys.organization(slug ?? ''),
    refetchInterval: POLL.admin,
    queryFn: () => getOrganization(slug as string).then(r => r.data),
    enabled: slug !== null,
  });
}

export function useCreateOrganization() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrganization) => createOrganization(body).then(r => r.data),
    onSuccess: organization => {
      client.setQueryData(queryKeys.organization(organization.slug), organization);
      // Creating switches the session in, so Me's current organisation is now stale.
      void client.invalidateQueries({ queryKey: queryKeys.me() });
      void client.invalidateQueries({ queryKey: queryKeys.organizations() });
    },
  });
}

export function useUpdateOrganization(slug: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateOrganization) => updateOrganization(slug, body).then(r => r.data),
    onSuccess: organization => {
      client.setQueryData(queryKeys.organization(organization.slug), organization);
      void client.invalidateQueries({ queryKey: queryKeys.organizations() });
      // A renamed slug changes what Me points at and what every project call resolves against.
      if (organization.slug !== slug) {
        void client.invalidateQueries({ queryKey: queryKeys.me() });
        void client.invalidateQueries({ queryKey: ['projects'] });
      }
    },
  });
}

export function useSwitchOrganization() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (slug: string) => setCurrentOrganization(slug).then(r => r.data),
    onSuccess: session => {
      client.setQueryData<Me>(queryKeys.me(), current =>
        current ? { ...current, current_organization_slug: session.current_organization_slug } : current,
      );
      // Everything scoped to the organisation resolves from the session, so it all refetches.
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: queryKeys.organizations() });
    },
  });
}

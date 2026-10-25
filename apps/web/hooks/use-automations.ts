'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Automation, CreateAutomation, UpdateAutomation } from '@nothingleft/types';
import {
  createAutomation,
  deleteAutomation,
  getAutomationCatalogue,
  listAutomationRuns,
  listAutomations,
  listAutomationTemplates,
  testAutomation,
  updateAutomation,
  type AutomationRunsFilter,
} from '@lib/api/automations';
import { optimisticList } from '@lib/query/optimistic';
import { POLL } from '@lib/query/poll';
import { queryKeys } from '@lib/query/keys';

export function useAutomationCatalogue() {
  return useQuery({
    queryKey: queryKeys.automationCatalogue(),
    queryFn: () => getAutomationCatalogue().then(r => r.data),
    staleTime: 10 * 60_000,
  });
}

export function useAutomations(key: string) {
  return useQuery({
    queryKey: queryKeys.automations(key),
    queryFn: () => listAutomations(key).then(r => r.data),
    refetchInterval: POLL.list,
  });
}

export function useAutomationTemplates(key: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.automationTemplates(key),
    queryFn: () => listAutomationTemplates(key).then(r => r.data),
    enabled,
  });
}

export function useAutomationRuns(key: string, filter: AutomationRunsFilter, enabled = true) {
  return useQuery({
    queryKey: queryKeys.automationRuns(key, filter),
    queryFn: () => listAutomationRuns(key, filter),
    refetchInterval: POLL.list,
    enabled,
  });
}

const rulesKey = (key: string) => queryKeys.automations(key);
const settle = (client: ReturnType<typeof useQueryClient>, key: string) =>
  client.invalidateQueries({ queryKey: queryKeys.automationsAll(key) });

export function useCreateAutomation(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAutomation) => createAutomation(key, body).then(r => r.data),
    onSuccess: rule =>
      client.setQueryData<Automation[]>(rulesKey(key), list =>
        list ? [...list, rule].sort((a, b) => a.position - b.position) : [rule],
      ),
    onSettled: () => settle(client, key),
  });
}

type UpdateVars = { name: string; body: UpdateAutomation };

export function useUpdateAutomation(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ name, body }: UpdateVars) => updateAutomation(key, name, body).then(r => r.data),
    // Only what needs no server words is drawn early: the switch and a new name.
    ...optimisticList<Automation[], UpdateVars>(client, rulesKey(key), (list, { name, body }) =>
      list.map(rule =>
        rule.name === name
          ? {
              ...rule,
              ...(body.is_enabled !== undefined ? { is_enabled: body.is_enabled } : {}),
              ...(body.name !== undefined ? { name: body.name } : {}),
            }
          : rule,
      ),
    ),
    onSuccess: (rule, { name }) =>
      client.setQueryData<Automation[]>(rulesKey(key), list => list?.map(r => (r.name === name ? rule : r))),
    onSettled: () => settle(client, key),
  });
}

export function useDeleteAutomation(key: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteAutomation(key, name).then(r => r.data),
    ...optimisticList<Automation[], string>(client, rulesKey(key), (list, name) => list.filter(r => r.name !== name)),
    onSettled: () => settle(client, key),
  });
}

export function useTestAutomation(key: string) {
  return useMutation({
    mutationFn: ({ name, issue }: { name: string; issue: string }) =>
      testAutomation(key, name, issue).then(r => r.data),
  });
}

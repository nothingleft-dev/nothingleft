import type {
  Automation,
  AutomationCatalogue,
  AutomationRun,
  AutomationTemplate,
  AutomationTestResult,
  CreateAutomation,
  UpdateAutomation,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

const automations = (key: string) => `/v1/projects/${encodeURIComponent(key)}/automations`;
const one = (key: string, name: string) => `${automations(key)}/${encodeURIComponent(name)}`;

export const getAutomationCatalogue = () => api.get<AutomationCatalogue>('/v1/automations/catalogue');

export const listAutomations = (key: string) => api.get<Automation[]>(automations(key));

export const listAutomationTemplates = (key: string) => api.get<AutomationTemplate[]>(`${automations(key)}/templates`);

export const createAutomation = (key: string, body: CreateAutomation) =>
  api.post<Automation>(automations(key), { body });

export const updateAutomation = (key: string, name: string, body: UpdateAutomation) =>
  api.patch<Automation>(one(key, name), { body });

export const deleteAutomation = (key: string, name: string) => api.delete<Automation[]>(one(key, name));

export const testAutomation = (key: string, name: string, issue: string) =>
  api.post<AutomationTestResult>(`${one(key, name)}/test`, { body: { issue } });

export interface AutomationRunsFilter {
  automation?: string;
  issue?: string;
  limit?: number;
  offset?: number;
}

export const listAutomationRuns = (key: string, { automation, ...query }: AutomationRunsFilter) =>
  api.get<AutomationRun[]>(
    automation ? `${one(key, automation)}/runs` : `/v1/projects/${encodeURIComponent(key)}/automation-runs`,
    { query: { ...query } },
  );

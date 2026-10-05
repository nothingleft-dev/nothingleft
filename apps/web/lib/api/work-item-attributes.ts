import type {
  CreateWorkItemAttribute,
  CreateWorkItemAttributeValue,
  UpdateWorkItemAttribute,
  UpdateWorkItemAttributeValue,
  WorkItemAttribute,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

const base = (key: string) => `/v1/projects/${encodeURIComponent(key)}/work-item-attributes`;
const one = (key: string, name: string) => `${base(key)}/${encodeURIComponent(name)}`;
const value = (key: string, name: string, v: string) => `${one(key, name)}/values/${encodeURIComponent(v)}`;

export const listWorkItemAttributes = (key: string) => api.get<WorkItemAttribute[]>(base(key));

export const createWorkItemAttribute = (key: string, body: CreateWorkItemAttribute) =>
  api.post<WorkItemAttribute>(base(key), { body });

export const updateWorkItemAttribute = (key: string, name: string, body: UpdateWorkItemAttribute) =>
  api.patch<WorkItemAttribute>(one(key, name), { body });

export const deleteWorkItemAttribute = (key: string, name: string) => api.delete<WorkItemAttribute>(one(key, name));

export const createWorkItemAttributeValue = (key: string, name: string, body: CreateWorkItemAttributeValue) =>
  api.post<WorkItemAttribute>(`${one(key, name)}/values`, { body });

export const updateWorkItemAttributeValue = (
  key: string,
  name: string,
  v: string,
  body: UpdateWorkItemAttributeValue,
) => api.patch<WorkItemAttribute>(value(key, name, v), { body });

export const deleteWorkItemAttributeValue = (key: string, name: string, v: string, moveTo?: string) =>
  api.delete<WorkItemAttribute>(value(key, name, v), { query: { move_to: moveTo } });

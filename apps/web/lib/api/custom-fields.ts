import type {
  CreateCustomField,
  CreateCustomFieldOption,
  CustomField,
  UpdateCustomField,
  UpdateCustomFieldOption,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

const base = (key: string) => `/v1/projects/${encodeURIComponent(key)}/custom-fields`;
const one = (key: string, slug: string) => `${base(key)}/${encodeURIComponent(slug)}`;
const option = (key: string, slug: string, name: string) => `${one(key, slug)}/options/${encodeURIComponent(name)}`;

export const listCustomFields = (key: string) => api.get<CustomField[]>(base(key));

export const createCustomField = (key: string, body: CreateCustomField) => api.post<CustomField>(base(key), { body });

export const updateCustomField = (key: string, slug: string, body: UpdateCustomField) =>
  api.patch<CustomField>(one(key, slug), { body });

export const deleteCustomField = (key: string, slug: string) => api.delete<CustomField>(one(key, slug));

export const createCustomFieldOption = (key: string, slug: string, body: CreateCustomFieldOption) =>
  api.post<CustomField>(`${one(key, slug)}/options`, { body });

export const updateCustomFieldOption = (key: string, slug: string, name: string, body: UpdateCustomFieldOption) =>
  api.patch<CustomField>(option(key, slug, name), { body });

export const deleteCustomFieldOption = (key: string, slug: string, name: string, moveTo?: string) =>
  api.delete<CustomField>(option(key, slug, name), { query: { move_to: moveTo } });

import type { CreateOrganization, Organization, UpdateOrganization } from '@nothingleft/types';
import { api } from '@lib/api/client';

export const listOrganizations = () => api.get<Organization[]>('/v1/organizations');

export const getOrganization = (slug: string) => api.get<Organization>(`/v1/organizations/${encodeURIComponent(slug)}`);

export const createOrganization = (body: CreateOrganization) => api.post<Organization>('/v1/organizations', { body });

export const updateOrganization = (slug: string, body: UpdateOrganization) =>
  api.patch<Organization>(`/v1/organizations/${encodeURIComponent(slug)}`, { body });

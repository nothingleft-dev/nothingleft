import type {
  Acknowledgement,
  InitiateOwnershipTransfer,
  Organization,
  OwnershipTransfer,
  StepUp,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

const org = (slug: string) => `/v1/organizations/${encodeURIComponent(slug)}`;

export const scheduleDeletion = (slug: string, body: StepUp) =>
  api.post<Organization>(`${org(slug)}/deletion`, { body });
export const cancelDeletion = (slug: string) => api.delete<Organization>(`${org(slug)}/deletion`);

export const getPendingTransfer = (slug: string) =>
  api.get<OwnershipTransfer | null>(`${org(slug)}/ownership-transfer`);
export const offerOwnership = (slug: string, body: InitiateOwnershipTransfer) =>
  api.post<OwnershipTransfer>(`${org(slug)}/ownership-transfer`, { body });
export const cancelTransfer = (slug: string) => api.delete<Acknowledgement>(`${org(slug)}/ownership-transfer`);

// The token rides in the body so it stays out of access logs.
export const previewTransfer = (token: string) =>
  api.post<OwnershipTransfer>('/v1/ownership-transfers/preview', { body: { token }, idempotencyKey: false });
export const acceptTransfer = (token: string) =>
  api.post<Organization>('/v1/ownership-transfers/accept', { body: { token } });
export const declineTransfer = (token: string) =>
  api.post<Acknowledgement>('/v1/ownership-transfers/decline', { body: { token } });

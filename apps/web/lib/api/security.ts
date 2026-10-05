import type {
  Acknowledgement,
  ConfirmTwoFactor,
  Me,
  StepUp,
  TwoFactorRecoveryCodes,
  TwoFactorSetup,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

export const startTwoFactorSetup = () => api.post<TwoFactorSetup>('/v1/me/two-factor/setup');
export const confirmTwoFactor = (body: ConfirmTwoFactor) =>
  api.post<TwoFactorRecoveryCodes>('/v1/me/two-factor/confirm', { body });
export const disableTwoFactor = (body: StepUp) => api.post<Me>('/v1/me/two-factor/disable', { body });
export const regenerateRecoveryCodes = (body: StepUp) =>
  api.post<TwoFactorRecoveryCodes>('/v1/me/two-factor/recovery-codes', { body });

export const deactivateAccount = (body: StepUp) => api.post<Acknowledgement>('/v1/me/deactivate', { body });

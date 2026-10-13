'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ConfirmTwoFactor, Me, StepUp, TwoFactorRecoveryCodes } from '@nothingleft/types';
import {
  confirmTwoFactor,
  deactivateAccount,
  disableTwoFactor,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
} from '@lib/api/security';
import { queryKeys } from '@lib/query/keys';
import { clearRecentlyViewed } from '@hooks/use-recently-viewed';

function drawTwoFactor(client: ReturnType<typeof useQueryClient>, codes: TwoFactorRecoveryCodes) {
  client.setQueryData<Me>(queryKeys.me(), me =>
    me
      ? {
          ...me,
          two_factor: {
            enabled: true,
            enabled_at: codes.enabled_at,
            recovery_codes_remaining: codes.recovery_codes.length,
          },
        }
      : me,
  );
}

export const useStartTwoFactorSetup = () => useMutation({ mutationFn: () => startTwoFactorSetup().then(r => r.data) });

export function useConfirmTwoFactor() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: ConfirmTwoFactor) => confirmTwoFactor(body).then(r => r.data),
    onSuccess: codes => drawTwoFactor(client, codes),
  });
}

export function useRegenerateRecoveryCodes() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: StepUp) => regenerateRecoveryCodes(body).then(r => r.data),
    onSuccess: codes => drawTwoFactor(client, codes),
  });
}

export function useDisableTwoFactor() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: StepUp) => disableTwoFactor(body).then(r => r.data),
    onSuccess: me => client.setQueryData(queryKeys.me(), me),
  });
}

// The API has already ended the session, so nothing cached belongs to anyone any more.
export function useDeactivateAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: StepUp) => deactivateAccount(body).then(r => r.data),
    onSuccess: () => {
      client.clear();
      clearRecentlyViewed();
      window.location.assign(new URL('/sign-in?deactivated=1', window.location.origin).toString());
    },
  });
}

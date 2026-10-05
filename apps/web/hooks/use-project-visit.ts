'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Me } from '@nothingleft/types';
import { updatePreferences } from '@lib/api/me';
import { queryKeys } from '@lib/query/keys';

/** Every project visit is where a returning user lands next — onboarding.md § Returning-user landing. */
export function useRecordProjectVisit(projectKey: string | null) {
  const client = useQueryClient();
  useEffect(() => {
    if (!projectKey) return;
    const me = client.getQueryData<Me>(queryKeys.me());
    if (me?.preferences.last_project_key === projectKey) return;
    void updatePreferences({ last_project_key: projectKey })
      .then(r => client.setQueryData(queryKeys.me(), r.data))
      .catch(() => {
        // Not readable any more, or offline: the landing simply falls back.
      });
  }, [projectKey, client]);
}

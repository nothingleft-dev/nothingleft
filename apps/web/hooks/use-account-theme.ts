'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';
import type { UserTheme } from '@nothingleft/types';

/**
 * The account preference is the durable copy; next-themes' localStorage entry is the
 * per-device one that renders without a round trip. When they disagree, the account wins.
 */
export function useAccountTheme(preference: UserTheme | undefined) {
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    if (preference && theme !== preference) setTheme(preference);
  }, [preference, theme, setTheme]);
}

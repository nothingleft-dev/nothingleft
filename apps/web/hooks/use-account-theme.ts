'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import type { UserTheme } from '@nothingleft/types';

/**
 * The account preference is the durable copy; next-themes' localStorage entry is the
 * per-device one that renders without a round trip. The account wins when it changes: on
 * load and after a save. It never reverts the device in between, because next-themes copies a
 * choice made in another tab into this one before this tab's account copy has caught up, and
 * reverting it there sent the tabs flipping each other back and forth.
 */
export function useAccountTheme(preference: UserTheme | undefined) {
  const { setTheme } = useTheme();
  const applied = useRef<UserTheme | null>(null);
  useEffect(() => {
    if (!preference || preference === applied.current) return;
    applied.current = preference;
    setTheme(preference);
  }, [preference, setTheme]);
}

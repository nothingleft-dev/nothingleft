'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { Issue } from '@nothingleft/types';

// Client-side only, never synced.
const STORAGE_KEY = 'nl.recently-viewed';
const KEEP = 8;
const listeners = new Set<() => void>();

export interface RecentIssue {
  key: string;
  title: string;
}

let cached: { raw: string | null; value: RecentIssue[] } = { raw: null, value: [] };

const read = (): RecentIssue[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cached.raw) return cached.value;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const value = Array.isArray(parsed)
      ? parsed.filter((r): r is RecentIssue => typeof r?.key === 'string' && typeof r?.title === 'string')
      : [];
    cached = { raw, value };
    return value;
  } catch {
    return [];
  }
};

const write = (value: RecentIssue[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the list is just empty on this device.
  }
  listeners.forEach(fn => fn());
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener('storage', fn);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', fn);
  };
};

const EMPTY: RecentIssue[] = [];

export function useRecentlyViewed() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  const clear = useCallback(() => write([]), []);
  return { items, clear };
}

export function useRecordRecentlyViewed(issue: Pick<Issue, 'key' | 'title'> | undefined) {
  const key = issue?.key;
  const title = issue?.title;
  useEffect(() => {
    if (!key || title === undefined) return;
    const rest = read().filter(r => r.key !== key);
    write([{ key, title }, ...rest].slice(0, KEEP));
  }, [key, title]);
}

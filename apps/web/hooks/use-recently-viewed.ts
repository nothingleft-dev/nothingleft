'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { Issue } from '@nothingleft/types';
import { useSession } from '@hooks/use-session';

// Client-side only, never synced. One list per account and organisation: keys repeat across
// organisations, and a shared browser must not show one account's titles to the next.
const STORAGE_PREFIX = 'nl.recently-viewed';
const UNSCOPED_KEY = STORAGE_PREFIX;
const KEEP = 8;
const listeners = new Set<() => void>();

export interface RecentIssue {
  key: string;
  title: string;
}

const storageKey = (userId: number, orgSlug: string) => `${STORAGE_PREFIX}:${userId}:${orgSlug}`;

const cache = new Map<string, { raw: string | null; value: RecentIssue[] }>();
const EMPTY: RecentIssue[] = [];

const read = (key: string | null): RecentIssue[] => {
  if (key === null) return EMPTY;
  try {
    const raw = window.localStorage.getItem(key);
    const hit = cache.get(key);
    if (hit && raw === hit.raw) return hit.value;
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const value = Array.isArray(parsed)
      ? parsed.filter((r): r is RecentIssue => typeof r?.key === 'string' && typeof r?.title === 'string')
      : [];
    cache.set(key, { raw, value });
    return value;
  } catch {
    return EMPTY;
  }
};

const write = (key: string, value: RecentIssue[]) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.localStorage.removeItem(UNSCOPED_KEY);
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

function useStorageKey(): string | null {
  const session = useSession();
  if (session.status !== 'signed-in' || !session.user.current_organization_slug) return null;
  return storageKey(session.user.id, session.user.current_organization_slug);
}

export function useRecentlyViewed() {
  const key = useStorageKey();
  const items = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => EMPTY,
  );
  const clear = useCallback(() => {
    if (key) write(key, []);
  }, [key]);
  return { items, clear };
}

/** Puts an opened issue first; one that no longer opens (deleted, or access lost) leaves the list. */
export function useRecordRecentlyViewed(
  issue: Pick<Issue, 'key' | 'title'> | undefined,
  missing: { key: string; gone: boolean },
) {
  const storage = useStorageKey();
  const key = issue?.key;
  const title = issue?.title;
  useEffect(() => {
    if (!storage || !key || title === undefined) return;
    const rest = read(storage).filter(r => r.key !== key);
    write(storage, [{ key, title }, ...rest].slice(0, KEEP));
  }, [storage, key, title]);

  const goneKey = missing.gone ? missing.key.toUpperCase() : null;
  useEffect(() => {
    if (!storage || !goneKey) return;
    const list = read(storage);
    if (list.some(r => r.key === goneKey))
      write(
        storage,
        list.filter(r => r.key !== goneKey),
      );
  }, [storage, goneKey]);
}

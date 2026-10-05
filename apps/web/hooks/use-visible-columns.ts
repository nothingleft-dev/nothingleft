'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { DEFAULT_COLUMNS, isColumnId, orderColumns, type ColumnId } from '@lib/issue-list/columns';

// A per-viewer convenience; a saved view's own columns win while its tab is active.
const STORAGE_KEY = 'nl.issue-list.columns';
const listeners = new Set<() => void>();

let cached: { raw: string | null; value: readonly ColumnId[] } = { raw: null, value: DEFAULT_COLUMNS };

const read = (): readonly ColumnId[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === cached.raw) return cached.value;
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    const value = Array.isArray(parsed) ? orderColumns(parsed.filter((c): c is string => typeof c === 'string')) : null;
    cached = { raw, value: value && value.length > 0 ? value : DEFAULT_COLUMNS };
    return cached.value;
  } catch {
    return DEFAULT_COLUMNS;
  }
};

const write = (value: readonly ColumnId[]) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked: the choice lasts for this page view.
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

export function useVisibleColumns(override: readonly string[] | null) {
  const stored = useSyncExternalStore(subscribe, read, () => DEFAULT_COLUMNS);
  const fromView = override && override.length > 0 ? orderColumns(override.filter(isColumnId)) : null;
  const columns = fromView && fromView.length > 0 ? fromView : stored;
  const setColumns = useCallback((next: readonly ColumnId[]) => write(orderColumns(next)), []);
  return { columns, setColumns, fromView: fromView !== null && fromView.length > 0 };
}

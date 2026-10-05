'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useShortcut } from '@hooks/use-shortcut';

const STORAGE_KEY = 'nl.sidebar.collapsed';
const listeners = new Set<() => void>();

const read = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

const write = (collapsed: boolean) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Private mode or blocked storage: the toggle still works for this page view.
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

export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => write(!read()), []);

  useShortcut('[', toggle);

  return { collapsed, toggle };
}

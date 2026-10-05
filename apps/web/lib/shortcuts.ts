// The one list the `?` dialog and /shortcuts render — ui-conventions.md § Keyboard. A key
// is listed only once the thing it drives exists.

export type ShortcutArea = 'Anywhere' | 'Search' | 'Issue list' | 'Issue page' | 'Knowledge base' | 'Editor';

export interface Shortcut {
  /** Keys pressed together. */
  keys: readonly string[];
  /** A second key pressed after the first, within `SEQUENCE_WINDOW_MS`. */
  then?: string;
  action: string;
  area: ShortcutArea;
}

export const SEQUENCE_WINDOW_MS = 1000;

export const GO_TO = {
  d: { path: '/dashboard', label: 'Go to dashboard' },
  i: { path: '/issues', label: 'Go to issues' },
  b: { path: '/projects', label: 'Go to board' },
  m: { path: '/my-issues', label: 'Go to my issues' },
  p: { path: '/projects', label: 'Go to projects' },
  r: { path: '/reports', label: 'Go to reports' },
} as const;

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: ['/'], action: 'Focus search', area: 'Anywhere' },
  { keys: ['c'], action: 'Create issue', area: 'Anywhere' },
  ...Object.entries(GO_TO).map(([key, go]) => ({
    keys: ['g'],
    then: key,
    action: go.label,
    area: 'Anywhere' as const,
  })),
  { keys: ['['], action: 'Collapse or expand the sidebar', area: 'Anywhere' },
  { keys: ['?'], action: 'Show keyboard shortcuts', area: 'Anywhere' },
  { keys: ['Tab'], action: 'Complete the first suggestion', area: 'Search' },
  { keys: ['↵'], action: 'Run the query', area: 'Search' },
  { keys: ['Esc'], action: 'Clear the selection', area: 'Issue list' },
  { keys: ['e'], action: 'Edit description', area: 'Issue page' },
  { keys: ['a'], action: 'Assign', area: 'Issue page' },
  { keys: ['s'], action: 'Change status', area: 'Issue page' },
  { keys: ['e'], action: 'Edit article', area: 'Knowledge base' },
  { keys: ['Alt', '↑ / ↓'], action: 'Move the focused article among its neighbours', area: 'Knowledge base' },
  { keys: ['Alt', '→'], action: 'Put it under the article above', area: 'Knowledge base' },
  { keys: ['Alt', '←'], action: 'Move it up a level', area: 'Knowledge base' },
  { keys: ['⌘ / Ctrl', '↵'], action: 'Submit comment', area: 'Editor' },
];

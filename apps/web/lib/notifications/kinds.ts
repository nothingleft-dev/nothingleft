import type { NotificationArea, NotificationEmail, NotificationKind } from '@nothingleft/types';

export const AREA_LABELS: Record<NotificationArea, string> = {
  issues: 'Issues',
  comments: 'Comments',
  agile: 'Agile',
  knowledge_base: 'Knowledge base',
  development: 'Development',
};

/** Per kind: its row on the preferences screen, when you hear it, and what an unsubscribe link names. */
export const KIND_COPY: Record<NotificationKind, { label: string; when: string; about: string }> = {
  assigned: { label: 'Assigned to you', when: 'Someone assigns an issue to you', about: 'issues assigned to you' },
  unassigned: { label: 'Unassigned from you', when: 'Someone takes you off an issue', about: 'being taken off issues' },
  status_changed: { label: 'Status changes', when: 'An issue you watch changes status', about: 'status changes' },
  resolved: { label: 'Resolved', when: 'An issue you created or watch is resolved', about: 'resolved issues' },
  linked: { label: 'Links', when: 'An issue you watch is linked to another', about: 'links' },
  due_soon: { label: 'Due tomorrow', when: 'An issue assigned to you is due tomorrow', about: 'issues due tomorrow' },
  overdue: { label: 'Overdue', when: 'An issue assigned to you is past its due date', about: 'overdue issues' },
  time_logged: {
    label: 'Time logged',
    when: 'Someone logs time on an issue you watch or are assigned to',
    about: 'time logged',
  },
  mentioned: {
    label: 'Mentioned',
    when: 'Someone writes @you in an issue, a comment, logged time or an article',
    about: 'mentions',
  },
  commented: { label: 'Comments', when: 'Someone comments on an issue you watch', about: 'comments' },
  reaction: { label: 'Reactions', when: 'Someone reacts to your comment', about: 'reactions' },
  pull_request_merged: {
    label: 'Pull request merged',
    when: 'A pull request linked to an issue you are assigned to or watch is merged',
    about: 'merged pull requests',
  },
  ci_failed: {
    label: 'CI failing',
    when: 'CI starts failing on a pull request linked to an issue assigned to you',
    about: 'failing CI',
  },
  sprint_started: {
    label: 'Sprint started',
    when: 'A sprint with an issue assigned to you starts',
    about: 'sprints starting',
  },
  sprint_finished: {
    label: 'Sprint finished',
    when: 'A sprint with an issue assigned to you finishes',
    about: 'sprints finishing',
  },
  article_published: {
    label: 'Article published',
    when: 'An article is published in a project you are in',
    about: 'published articles',
  },
  article_updated: { label: 'Article updated', when: 'An article you watch changes', about: 'article updates' },
};

export interface KindFilter {
  value: string;
  label: string;
  area: NotificationArea;
  kinds: readonly NotificationKind[];
}

// The inbox filter reads the kinds as people say them. Reaction is left out until something
// produces it (comment reactions, 6f).
export const KIND_FILTERS: readonly KindFilter[] = [
  { value: 'assigned', label: 'Assigned to you', area: 'issues', kinds: ['assigned'] },
  { value: 'unassigned', label: 'Unassigned from you', area: 'issues', kinds: ['unassigned'] },
  { value: 'status_changed', label: 'Status changes', area: 'issues', kinds: ['status_changed'] },
  { value: 'resolved', label: 'Resolved', area: 'issues', kinds: ['resolved'] },
  { value: 'linked', label: 'Links', area: 'issues', kinds: ['linked'] },
  { value: 'due_soon', label: 'Due tomorrow', area: 'issues', kinds: ['due_soon'] },
  { value: 'overdue', label: 'Overdue', area: 'issues', kinds: ['overdue'] },
  { value: 'time_logged', label: 'Time logged', area: 'issues', kinds: ['time_logged'] },
  { value: 'mentioned', label: 'Mentions', area: 'comments', kinds: ['mentioned'] },
  { value: 'commented', label: 'Comments', area: 'comments', kinds: ['commented'] },
  { value: 'sprint', label: 'Sprints', area: 'agile', kinds: ['sprint_started', 'sprint_finished'] },
  { value: 'article', label: 'Articles', area: 'knowledge_base', kinds: ['article_published', 'article_updated'] },
];

const KNOWN = new Set<string>(KIND_FILTERS.map(f => f.value));

/** `?kind=mentioned,sprint` ⇄ the filter values, dropping anything unknown. */
export const parseKindFilters = (raw: string | null): string[] =>
  (raw ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(v => KNOWN.has(v));

export const kindsOf = (filters: readonly string[]): NotificationKind[] =>
  KIND_FILTERS.filter(f => filters.includes(f.value)).flatMap(f => f.kinds);

export const EMAIL_OPTIONS: readonly { value: NotificationEmail; label: string; hint: string }[] = [
  { value: 'off', label: 'Off', hint: 'Nothing by email; the inbox still shows it' },
  { value: 'instant', label: 'Instant', hint: 'An email as soon as it reaches your inbox' },
  { value: 'daily_digest', label: 'Daily digest', hint: 'One email at 9am with everything unread from the day' },
  { value: 'weekly_digest', label: 'Weekly digest', hint: 'The same, on Mondays at 9am' },
];

export const DUE_KINDS: readonly NotificationKind[] = ['due_soon', 'overdue'];

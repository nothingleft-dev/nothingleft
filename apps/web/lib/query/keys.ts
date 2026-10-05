import type { ReportName, SprintState, TagContext } from '@nothingleft/types';
import type { ReportQuery } from '@lib/api/reports';
import type { ArticleSearchQuery } from '@lib/api/articles';
import type { StorageFilesFilter } from '@lib/api/organization-storage';
import type { ActivityQuery } from '@lib/api/activity';
import type { MemberQuery } from '@lib/api/members';
import type { InviteScope } from '@lib/api/invitations';
import type { InboxFilter, NotificationSubjectRef } from '@lib/api/notifications';
import type { ProjectQuery } from '@lib/api/projects';
import type { SchemaTable } from '@lib/api/project-schema';
import type { IssueFiguresQuery, IssueSearchQuery, SuggestKind } from '@lib/api/search';

const scopeKey = (scope: InviteScope) =>
  scope.kind === 'organization' ? (['organizations', scope.slug] as const) : (['projects', scope.key] as const);

export const queryKeys = {
  me: () => ['me'] as const,
  landing: () => ['me', 'landing'] as const,
  health: () => ['health'] as const,
  sessions: () => ['me', 'sessions'] as const,
  tokens: () => ['me', 'tokens'] as const,

  organizations: () => ['organizations'] as const,
  organization: (slug: string) => ['organizations', slug] as const,
  members: (slug: string, query: MemberQuery = {}) => ['organizations', slug, 'members', query] as const,
  removalPreview: (slug: string, username: string) => ['organizations', slug, 'removal', username] as const,
  activity: (slug: string, query: ActivityQuery = {}) => ['organizations', slug, 'activity', query] as const,
  pendingTransfer: (slug: string) => ['organizations', slug, 'ownership-transfer'] as const,
  storage: (slug: string) => ['organizations', slug, 'storage'] as const,
  storageOverview: (slug: string) => ['organizations', slug, 'storage', 'overview'] as const,
  storageFiles: (slug: string, query: StorageFilesFilter = {}) =>
    ['organizations', slug, 'storage', 'files', query] as const,
  transferPreview: (token: string) => ['ownership-transfers', token] as const,

  projects: (query: ProjectQuery = {}) => ['projects', query] as const,
  project: (key: string) => ['projects', key] as const,
  projectMembers: (key: string) => ['projects', key, 'members'] as const,
  projectAssignees: (key: string) => ['projects', key, 'assignees'] as const,
  projectWorkAuthors: (key: string) => ['projects', key, 'work-authors'] as const,
  projectSchema: (key: string, table: SchemaTable) => ['projects', key, 'schema', table] as const,
  customFields: (key: string) => ['projects', key, 'custom-fields'] as const,
  workItemAttributes: (key: string) => ['projects', key, 'work-item-attributes'] as const,
  deletedIssues: (key: string, offset: number) => ['projects', key, 'deleted-issues', offset] as const,

  issue: (key: string) => ['issues', key] as const,
  issueWatchers: (key: string) => ['issues', key, 'watchers'] as const,
  issueActivity: (key: string) => ['issues', key, 'activity'] as const,
  issueActivityOf: (key: string, filter: string) => ['issues', key, 'activity', filter] as const,
  issueComments: (key: string) => ['issues', key, 'comments'] as const,
  issueWorkItems: (key: string, subtasks: boolean) => ['issues', key, 'work-items', subtasks] as const,
  issueLinks: (key: string) => ['issues', key, 'links'] as const,
  issueAttachments: (key: string) => ['issues', key, 'attachments'] as const,
  // Set once presign answers storage.not_configured, so the upload controls go for the session.
  storageUnavailable: () => ['storage', 'unavailable'] as const,
  // Not under 'issues', key: one batch spans many keys, and it must survive a single issue's invalidation.
  issueRefs: (keys: readonly string[]) => ['issue-refs', 'keys', ...keys] as const,
  issueRefSearch: (q: string, project: string | null) => ['issue-refs', 'search', q, project] as const,
  tags: (q: string, context?: TagContext) => ['tags', q, context ?? null] as const,

  // Every search result shares the 'issues', 'search' prefix so one invalidation refreshes all lists.
  issueSearches: () => ['issues', 'search'] as const,
  issueSearch: (query: Omit<IssueSearchQuery, 'offset'>) => ['issues', 'search', query] as const,
  // Its own prefix: the value is a number, and the search-list writers walk everything under 'search'.
  issueCounts: () => ['issues', 'count'] as const,
  issueCount: (q: string, project?: string) => ['issues', 'count', q, project ?? null] as const,
  issueFigures: (query: IssueFiguresQuery) => ['issues', 'figures', query] as const,
  suggest: (q: string, caret: number, kind: SuggestKind) => ['search', 'suggest', q, caret, kind] as const,
  globalSearch: (q: string) => ['search', 'global', q] as const,
  savedViews: () => ['saved-views'] as const,

  // Every agile read hangs off one of these four prefixes, so an issue write can refresh them all.
  sprints: () => ['sprints'] as const,
  sprintsAcross: (states: readonly SprintState[]) => ['sprints', 'across', states] as const,
  projectSprints: (project: string) => ['sprints', 'project', project] as const,
  backlog: (project: string) => ['backlog', project] as const,
  backlogOf: (project: string, sprint: string | null, q: string) =>
    ['backlog', project, sprint ?? 'backlog', q] as const,
  boards: (project: string) => ['boards', project] as const,
  board: (project: string, slug: string) => ['boards', project, slug] as const,
  boardBySlug: (slug: string) => ['boards', 'by-slug', slug] as const,
  boardViews: () => ['board-view'] as const,
  boardView: (project: string, board: string, sprint: string, q: string) =>
    ['board-view', project, board, sprint, q] as const,

  // Every knowledge base read of a project hangs off 'articles', project, so one write can refresh them all.
  articles: (project: string) => ['articles', project] as const,
  articleTree: (project: string) => ['articles', project, 'tree'] as const,
  deletedArticles: (project: string) => ['articles', project, 'deleted'] as const,
  article: (project: string, slug: string) => ['articles', project, 'slug', slug] as const,
  articleComments: (project: string, slug: string) => ['articles', project, 'slug', slug, 'comments'] as const,
  articleAttachments: (project: string, slug: string) => ['articles', project, 'slug', slug, 'attachments'] as const,
  articleTagCloud: (project: string) => ['articles', project, 'tag-cloud'] as const,
  // Not under a project: /articles searches every project at once.
  articleSearches: () => ['article-search'] as const,
  articleSearch: (query: Omit<ArticleSearchQuery, 'offset' | 'limit'>) => ['article-search', query] as const,
  referencingArticles: (issueKey: string) => ['issues', issueKey, 'articles'] as const,

  report: (name: ReportName, query: ReportQuery) => ['reports', name, query] as const,
  timesheetWorkItems: (query: ReportQuery) => ['reports', 'timesheet', 'work-items', query] as const,

  // Every inbox read hangs off 'notifications', so marking something read can redraw them all at once.
  notifications: () => ['notifications'] as const,
  inbox: (filter: InboxFilter) => ['notifications', 'inbox', filter] as const,
  inboxPreview: () => ['notifications', 'preview'] as const,
  subjectNotifications: (subject: NotificationSubjectRef) => ['notifications', 'subject', subject] as const,
  unreadCount: () => ['notifications', 'unread-count'] as const,
  notificationFacets: () => ['notifications', 'facets'] as const,
  notificationPreferences: () => ['notification-preferences'] as const,
  unsubscribe: (token: string) => ['unsubscribe', token] as const,

  invitations: (scope: InviteScope) => [...scopeKey(scope), 'invitations'] as const,
  invitationUses: (slug: string, id: number) => ['organizations', slug, 'invitations', id, 'uses'] as const,
};

'use client';

import type { Me, Organization, Project, SavedView } from '@nothingleft/types';
import { useIssueCount } from '@hooks/use-issue-search';
import { useUnreadCount } from '@hooks/use-notifications';
import { useOrganizations } from '@hooks/use-organizations';
import { useProjects } from '@hooks/use-projects';
import { useSavedViews } from '@hooks/use-saved-views';

export interface ProjectNav extends Pick<Project, 'key' | 'name' | 'avatar_url' | 'avatar_color' | 'avatar_initials'> {
  /** Project settings are a Project Admin page; the sidebar offers them only then. */
  canAdmin: boolean;
}

export interface ShellData {
  organizations: Organization[];
  org: Organization | null;
  projects: ProjectNav[];
  savedViews: SavedView[];
  counts: { inboxUnread: number; myIssues: number };
  isPending: boolean;
}

export const MY_ISSUES_QUERY = 'assignee: me #Unresolved';

export function useShellData(user: Me | null): ShellData {
  // The shell renders its gate before the session is known; fetching then would 401.
  const signedIn = user !== null;
  const slug = user?.current_organization_slug ?? null;
  const inOrg = signedIn && slug !== null;
  const organizations = useOrganizations(signedIn);
  const projects = useProjects({ archived: 'false' }, inOrg);
  const savedViews = useSavedViews(inOrg);
  const myIssues = useIssueCount(MY_ISSUES_QUERY, undefined, inOrg);
  // The inbox spans every organisation, so it counts even for someone in none right now.
  const unread = useUnreadCount(signedIn);
  const list = organizations.data ?? [];

  return {
    organizations: list,
    org: list.find(o => o.slug === slug) ?? null,
    projects: (projects.data ?? []).map(p => ({
      key: p.key,
      name: p.name,
      avatar_url: p.avatar_url,
      avatar_color: p.avatar_color,
      avatar_initials: p.avatar_initials,
      canAdmin: p.my_role === 'project_admin',
    })),
    savedViews: savedViews.data ?? [],
    counts: { inboxUnread: unread.data?.count ?? 0, myIssues: myIssues.data ?? 0 },
    // A disabled query stays `pending` forever, so only the queries that actually run
    // are allowed to hold the shell in its loading state.
    isPending: (signedIn && organizations.isPending) || (slug !== null && projects.isPending),
  };
}

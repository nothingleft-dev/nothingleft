'use client';

import { useCallback, useMemo } from 'react';
import { useOrganizations } from '@hooks/use-organizations';
import { useProjects } from '@hooks/use-projects';
import { useSession } from '@hooks/use-session';

/**
 * What the viewer may change per project, from docs/permissions.md: Contributor and up
 * edit issues; Project Admin and up manage sprints and boards; an Org Admin or the owner is
 * Project Admin everywhere; an archived project is read-only for everyone.
 */
export function useProjectRoles() {
  const session = useSession();
  const user = session.status === 'signed-in' ? session.user : null;
  const organizations = useOrganizations(user !== null);
  const projects = useProjects({ archived: 'false' }, user !== null && user.current_organization_slug !== null);
  const org = organizations.data?.find(o => o.slug === user?.current_organization_slug) ?? null;
  const orgAdmin = org ? org.membership.is_owner || org.membership.org_role === 'org_admin' : false;
  const list = useMemo(() => projects.data ?? [], [projects.data]);

  const canEdit = useCallback(
    (projectKey: string) => {
      const project = list.find(p => p.key === projectKey);
      if (!project || project.is_archived) return false;
      return orgAdmin || project.my_role === 'contributor' || project.my_role === 'project_admin';
    },
    [list, orgAdmin],
  );

  const canAdmin = useCallback(
    (projectKey: string) => {
      const project = list.find(p => p.key === projectKey);
      if (!project || project.is_archived) return false;
      return orgAdmin || project.my_role === 'project_admin';
    },
    [list, orgAdmin],
  );

  const isAdmin = orgAdmin || list.some(p => p.my_role === 'project_admin');
  const writable = list.filter(p => !p.is_archived && (orgAdmin || p.my_role !== 'observer'));

  return { canEdit, canAdmin, isAdmin, orgAdmin, writable, projects: list, isPending: projects.isPending, org };
}

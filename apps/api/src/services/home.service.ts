import type { Landing, Principal, ProjectRole } from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type OrganizationsRepository,
  type ProjectsRepository,
  type UserPreferencesRepository,
} from '@nothingleft/db';
import type { AccessService } from '@services/access';
import { can } from '@services/permissions';

export interface HomeDeps {
  access: AccessService;
  organizations: OrganizationsRepository;
  projects: ProjectsRepository;
  preferences: UserPreferencesRepository;
}

/** Where a returning user lands — docs/onboarding.md#returning-user-landing. */
export function homeService({ access, organizations, projects, preferences }: HomeDeps) {
  const ctx = systemContext('a returning user’s own memberships decide where they land');

  return {
    async landing(principal: Principal): Promise<Landing> {
      const memberships = await organizations.listForUser(ctx, principal.userId);
      if (memberships.length === 0) {
        const kind = (await organizations.hasEverBelonged(ctx, principal.userId)) ? 'no_org' : 'welcome';
        return { kind, organization_slug: null, project_key: null };
      }

      const stored = await preferences.findForUser(ctx, principal.userId);
      const lastId = stored?.preferences.last_project_id ?? null;
      for (const { organization } of memberships) {
        if (lastId === null) break;
        const project = await projects.findById(tenantContext(organization.id, principal.userId), lastId);
        if (!project) continue;
        const org = await access.orgById(principal, organization.id);
        const readable = await access.projectById(principal, org, project.id).catch(() => null);
        if (readable && !project.is_archived) {
          return { kind: 'project', organization_slug: organization.slug, project_key: project.key };
        }
      }

      if (memberships.length > 1) {
        const current = principal.via === 'session' ? principal.currentOrgId : null;
        const preferred = memberships.find(m => m.organization.id === current) ?? memberships.at(-1)!;
        return { kind: 'org_switcher', organization_slug: preferred.organization.slug, project_key: null };
      }

      const { organization } = memberships[0]!;
      const org = await access.orgById(principal, organization.id);
      const everyProject = org.scope.isOwner || org.scope.orgRole === 'org_admin';
      const readable = (await projects.listReadable(org.ctx, principal.userId, { everyProject })).filter(
        r =>
          !r.project.is_archived &&
          can(principal, 'project.read', {
            ...org.scope,
            projectRole: (r.role as ProjectRole | null) ?? null,
            projectId: r.project.id,
          }),
      );
      if (readable.length === 1) {
        return { kind: 'project', organization_slug: organization.slug, project_key: readable[0]!.project.key };
      }
      return { kind: 'project_list', organization_slug: organization.slug, project_key: null };
    },
  };
}

export type HomeService = ReturnType<typeof homeService>;

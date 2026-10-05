import type { OrgRole, ProjectRole } from '@nothingleft/types';

// The five names in docs/permissions.md, which is the authority for API, MCP and UI.
export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  org_admin: 'Org Admin',
  member: 'Member',
};

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  project_admin: 'Project Admin',
  contributor: 'Contributor',
  observer: 'Observer',
};

export const ORG_ROLE_HINTS: Record<OrgRole, string> = {
  org_admin: 'Runs the organisation: members, roles, invitations, projects and settings.',
  member: 'Works in the projects they belong to. Their project role decides what they can change.',
};

export const PROJECT_ROLE_HINTS: Record<ProjectRole, string> = {
  project_admin: 'Configures the project and manages its people.',
  contributor: 'Creates and edits issues, comments and logs time.',
  observer: 'Reads everything in the project and changes nothing.',
};

export const orgRoleLabel = (role: OrgRole, isOwner = false) => (isOwner ? 'Org Owner' : ORG_ROLE_LABELS[role]);

/** What an invitation grants, as one phrase: a project role when scoped, otherwise the org role. */
export const grantedRoleLabel = (orgRole: OrgRole, projectRole: ProjectRole | null) =>
  projectRole ? PROJECT_ROLE_LABELS[projectRole] : ORG_ROLE_LABELS[orgRole];

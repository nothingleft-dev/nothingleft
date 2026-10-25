import { PAT_SCOPES, type OrgRole, type PatScope, type Principal, type ProjectRole } from '@nothingleft/types';

// Built cell-for-cell from docs/permissions.md. Every capability below is one row of
// that table; the REST API and the MCP server both reach it through can().

export const CAPABILITIES = [
  'org.read',
  'org.update',
  'org.members.read',
  'org.members.invite',
  'org.invites.manage',
  'org.members.role_change',
  'org.members.remove',
  'org.storage.read',
  'org.storage.configure',
  'org.audit.read',
  'org.export',
  'org.transfer_ownership',
  'org.delete',
  'org.git.manage',
  'org.git.identities.manage',

  'project.read',
  'project.create',
  'project.update',
  'project.schema.manage',
  'project.custom_fields.manage',
  'project.members.manage',
  'project.invites.manage',
  'project.agile.manage',
  'project.archive',
  'project.delete',
  'project.repositories.manage',
  'project.automations.manage',
  'git.repositories.list',

  'issue.read',
  'issue.create',
  'issue.update',
  'issue.status_change',
  'issue.assign',
  'issue.link',
  'issue.parent_set',
  'issue.bulk_update',
  'issue.import',
  'issue.move',
  'issue.delete',
  'issue.personal_signal',
  'issue.watchers.read',
  'issue.watchers.manage',

  'comment.read',
  'comment.create',
  'comment.update',
  'comment.delete',
  'comment.react',

  'attachment.download',
  'attachment.upload',
  'attachment.delete',

  'work_item.read',
  'work_item.log_own',
  'work_item.log_for_other',
  'work_item.update',
  'work_item.delete',

  'tag.apply',
  'tag.create',
  'tag.update',
  'tag.delete',

  'article.read_published',
  'article.read_draft',
  'article.create',
  'article.update',
  'article.publish',
  'article.reorder',
  'article.delete',
  'article.comment',
  'article.tag',
  'article.personal_signal',

  'search.run',
  'saved_view.create_private',
  'saved_view.create_shared',
  'saved_view.update_shared',
  'report.read',
  'report.export',

  'git.read',
  'git.link_manual',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** `own` means the capability is granted only for records the principal authored. */
export type Grant = false | true | 'own';

/** Weakest to strongest. Nothing is inherited implicitly; every cell below is stated. */
export type Level = 'observer' | 'contributor' | 'project_admin' | 'org_admin' | 'org_owner';

const O = 'observer';
const C = 'contributor';
const P = 'project_admin';
const A = 'org_admin';
const W = 'org_owner';

type Row = Record<Level, Grant>;

const row = (observer: Grant, contributor: Grant, projectAdmin: Grant, orgAdmin: Grant, orgOwner: Grant): Row => ({
  [O]: observer,
  [C]: contributor,
  [P]: projectAdmin,
  [A]: orgAdmin,
  [W]: orgOwner,
});

const all = row(true, true, true, true, true);
const fromContributor = row(false, true, true, true, true);
const fromProjectAdmin = row(false, false, true, true, true);
const fromOrgAdmin = row(false, false, false, true, true);
const ownFromContributor = row(false, 'own', true, true, true);

export const MATRIX: Record<Capability, Row> = {
  'org.read': all,
  'org.update': fromOrgAdmin,
  'org.members.read': all,
  'org.members.invite': fromOrgAdmin,
  'org.invites.manage': fromOrgAdmin,
  'org.members.role_change': fromOrgAdmin,
  'org.members.remove': fromOrgAdmin,
  'org.storage.read': fromOrgAdmin,
  'org.storage.configure': fromOrgAdmin,
  'org.audit.read': fromOrgAdmin,
  'org.export': fromOrgAdmin,
  'org.transfer_ownership': row(false, false, false, false, true),
  'org.delete': row(false, false, false, false, true),
  'org.git.manage': fromOrgAdmin,
  'org.git.identities.manage': fromOrgAdmin,

  'project.read': all,
  'project.create': fromOrgAdmin,
  'project.update': fromProjectAdmin,
  'project.schema.manage': fromProjectAdmin,
  'project.custom_fields.manage': fromProjectAdmin,
  'project.members.manage': fromProjectAdmin,
  'project.invites.manage': fromProjectAdmin,
  'project.agile.manage': fromProjectAdmin,
  'project.archive': fromProjectAdmin,
  'project.delete': fromOrgAdmin,
  'project.repositories.manage': fromProjectAdmin,
  'project.automations.manage': fromProjectAdmin,
  'git.repositories.list': fromProjectAdmin,

  'issue.read': all,
  'issue.create': fromContributor,
  'issue.update': fromContributor,
  'issue.status_change': fromContributor,
  'issue.assign': fromContributor,
  'issue.link': fromContributor,
  'issue.parent_set': fromContributor,
  'issue.bulk_update': fromContributor,
  'issue.import': fromProjectAdmin,
  'issue.move': fromProjectAdmin,
  'issue.delete': fromProjectAdmin,
  'issue.personal_signal': all,
  'issue.watchers.read': all,
  'issue.watchers.manage': fromContributor,

  'comment.read': all,
  'comment.create': fromContributor,
  'comment.update': ownFromContributor,
  'comment.delete': ownFromContributor,
  'comment.react': fromContributor,

  'attachment.download': all,
  'attachment.upload': fromContributor,
  'attachment.delete': ownFromContributor,

  'work_item.read': all,
  'work_item.log_own': fromContributor,
  'work_item.log_for_other': fromProjectAdmin,
  'work_item.update': ownFromContributor,
  'work_item.delete': ownFromContributor,

  'tag.apply': fromContributor,
  'tag.create': fromContributor,
  'tag.update': fromProjectAdmin,
  'tag.delete': fromOrgAdmin,

  'article.read_published': all,
  'article.read_draft': ownFromContributor,
  'article.create': fromContributor,
  'article.update': fromContributor,
  'article.publish': fromContributor,
  'article.reorder': fromContributor,
  'article.delete': ownFromContributor,
  'article.comment': fromContributor,
  'article.tag': fromContributor,
  'article.personal_signal': all,

  'search.run': all,
  'saved_view.create_private': all,
  'saved_view.create_shared': fromContributor,
  'saved_view.update_shared': ownFromContributor,
  'report.read': all,
  'report.export': all,

  'git.read': all,
  'git.link_manual': fromContributor,
};

// Rule 2: scopes narrow, never widen. A capability absent from this map needs no scope
// beyond authentication; one present is denied unless the token carries a listed scope.
export const REQUIRED_SCOPES: Partial<Record<Capability, readonly PatScope[]>> = {
  'org.update': ['admin:org'],
  'org.members.invite': ['admin:org'],
  'org.invites.manage': ['admin:org'],
  'org.members.role_change': ['admin:org'],
  'org.members.remove': ['admin:org'],
  'org.storage.read': ['admin:org'],
  'org.storage.configure': ['admin:org'],
  'org.audit.read': ['admin:org'],
  'org.export': ['admin:org'],
  'org.transfer_ownership': ['admin:org'],
  'org.delete': ['admin:org'],
  'org.git.manage': ['admin:org'],
  'org.git.identities.manage': ['admin:org'],

  'project.read': ['issues:read'],
  'project.create': ['admin:org'],
  'project.update': ['admin:project'],
  'project.schema.manage': ['admin:project'],
  'project.custom_fields.manage': ['admin:project'],
  'project.members.manage': ['admin:project'],
  'project.invites.manage': ['admin:project'],
  'project.agile.manage': ['admin:project'],
  'project.archive': ['admin:project'],
  'project.delete': ['admin:org'],
  'project.repositories.manage': ['admin:project'],
  'project.automations.manage': ['admin:project'],
  'git.repositories.list': ['admin:project'],

  'issue.read': ['issues:read'],
  'issue.create': ['issues:write'],
  'issue.update': ['issues:write'],
  'issue.status_change': ['issues:write'],
  'issue.assign': ['issues:write'],
  'issue.link': ['issues:write'],
  'issue.parent_set': ['issues:write'],
  'issue.bulk_update': ['issues:write'],
  'issue.import': ['admin:project'],
  'issue.move': ['issues:write'],
  'issue.delete': ['issues:write'],
  'issue.personal_signal': ['issues:write'],
  'issue.watchers.read': ['issues:read'],
  'issue.watchers.manage': ['issues:write'],

  'comment.read': ['issues:read'],
  'comment.create': ['comments:write'],
  'comment.update': ['comments:write'],
  'comment.delete': ['comments:write'],
  'comment.react': ['comments:write'],

  'attachment.download': ['issues:read'],
  'attachment.upload': ['issues:write'],
  'attachment.delete': ['issues:write'],

  'work_item.read': ['issues:read'],
  'work_item.log_own': ['time:write'],
  'work_item.log_for_other': ['time:write'],
  'work_item.update': ['time:write'],
  'work_item.delete': ['time:write'],

  'tag.apply': ['issues:write'],
  'tag.create': ['issues:write'],
  'tag.update': ['admin:project'],
  'tag.delete': ['admin:org'],

  'article.read_published': ['issues:read'],
  'article.read_draft': ['issues:read'],
  'article.create': ['issues:write'],
  'article.update': ['issues:write'],
  'article.publish': ['issues:write'],
  'article.reorder': ['issues:write'],
  'article.delete': ['issues:write'],
  'article.comment': ['comments:write'],
  'article.tag': ['issues:write'],
  'article.personal_signal': ['issues:write'],

  'search.run': ['issues:read'],
  'saved_view.create_shared': ['issues:write'],
  'saved_view.update_shared': ['issues:write'],
  'report.read': ['issues:read'],
  'report.export': ['issues:read'],

  'git.read': ['issues:read'],
  'git.link_manual': ['issues:write'],
};

export interface Membership {
  /** Absent means the principal is not a member of the organisation at all. */
  readonly orgRole: OrgRole | null;
  readonly isOwner: boolean;
  /** Absent means no explicit project membership; an org admin is still elevated. */
  readonly projectRole: ProjectRole | null;
  /** The project the check applies to, when the capability is project-scoped. */
  readonly projectId?: number;
}

export interface Scope extends Membership {
  /** Set when the capability has an `own` cell and the target has an author. */
  readonly isOwnRecord?: boolean;
}

/**
 * An Org Admin has implicit Project Admin on every project — docs/permissions.md#roles.
 * A plain member with no project membership has no level inside that project at all,
 * which is what makes rule 4 (404, not 403) reachable from one place.
 */
export function levelOf(membership: Membership): Level | null {
  if (membership.isOwner) return W;
  if (membership.orgRole === null) return null;
  if (membership.orgRole === 'org_admin') return A;
  if (membership.projectId !== undefined) return membership.projectRole;
  return O;
}

export function can(principal: Principal, capability: Capability, scope: Scope): boolean {
  const level = levelOf(scope);
  if (level === null) return false;

  if (principal.via === 'pat') {
    const required = REQUIRED_SCOPES[capability];
    if (required && !required.some(s => principal.scopes.includes(s))) return false;
    if (
      principal.projectIds !== null &&
      scope.projectId !== undefined &&
      !principal.projectIds.includes(scope.projectId)
    ) {
      return false;
    }
  }

  return granted(capability, level, scope);
}

function granted(capability: Capability, level: Level, scope: Scope): boolean {
  const grant = MATRIX[capability][level];
  if (grant === 'own') return scope.isOwnRecord === true;
  return grant;
}

/**
 * The scope a token lacks when that is the only thing standing between it and the
 * capability: the role grants it and the token may reach the project. Anything else is a
 * denial the caller cannot fix with a new token, and stays `forbidden` or `404`.
 */
export function missingScope(principal: Principal, capability: Capability, scope: Scope): PatScope | null {
  if (principal.via !== 'pat') return null;
  const required = REQUIRED_SCOPES[capability];
  if (!required || required.some(s => principal.scopes.includes(s))) return null;
  if (
    principal.projectIds !== null &&
    scope.projectId !== undefined &&
    !principal.projectIds.includes(scope.projectId)
  ) {
    return null;
  }
  const level = levelOf(scope);
  return level !== null && granted(capability, level, scope) ? required[0]! : null;
}

/** The project roles a capability is granted to outright: who may be named where that capability is exercised. */
export function projectRolesWith(capability: Capability): ProjectRole[] {
  return (['observer', 'contributor', 'project_admin'] as const).filter(role => MATRIX[capability][role] === true);
}

// Self-service (docs/permissions.md § Self-service): every account may do these for itself,
// whatever its roles or memberships, so no level applies — only a token's scopes narrow them.
export const SELF_SERVICE_CAPABILITIES = ['notification.read', 'notification.manage', 'git_identity.manage'] as const;
export type SelfServiceCapability = (typeof SELF_SERVICE_CAPABILITIES)[number];

export const SELF_SERVICE_SCOPES: Record<SelfServiceCapability, readonly PatScope[]> = {
  'notification.read': ['issues:read'],
  'notification.manage': ['issues:write'],
  // Any scope: an identity is attribution of one's own commits, and carries no secret.
  'git_identity.manage': PAT_SCOPES,
};

/** The scope a token needs for a self-service capability, or null when it may proceed. */
export function missingSelfServiceScope(principal: Principal, capability: SelfServiceCapability): PatScope | null {
  if (principal.via !== 'pat') return null;
  const required = SELF_SERVICE_SCOPES[capability];
  return required.some(s => principal.scopes.includes(s)) ? null : required[0]!;
}

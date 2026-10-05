import { describe, expect, test } from 'bun:test';
import { PAT_SCOPES, type PatScope, type Principal } from '@nothingleft/types';
import {
  CAPABILITIES,
  MATRIX,
  REQUIRED_SCOPES,
  can,
  levelOf,
  missingScope,
  missingSelfServiceScope,
  SELF_SERVICE_SCOPES,
  projectRolesWith,
  type Capability,
  type Grant,
  type Level,
} from '@services/permissions';
import { draftReach } from '@services/article-visibility';

const LEVELS: Level[] = ['observer', 'contributor', 'project_admin', 'org_admin', 'org_owner'];

const session: Principal = { via: 'session', userId: 1, sessionId: 1, currentOrgId: 1 };
const pat = (scopes: readonly PatScope[], projectIds: readonly number[] | null = null): Principal => ({
  via: 'pat',
  userId: 1,
  tokenId: 1,
  scopes,
  projectIds,
});

/** The membership shape that produces each level, so a cell can be asserted directly. */
const membershipFor = (level: Level, projectId?: number) => {
  const project = projectId === undefined ? {} : { projectId };
  switch (level) {
    case 'org_owner':
      return { orgRole: 'org_admin' as const, isOwner: true, projectRole: null, ...project };
    case 'org_admin':
      return { orgRole: 'org_admin' as const, isOwner: false, projectRole: null, ...project };
    case 'project_admin':
      return { orgRole: 'member' as const, isOwner: false, projectRole: 'project_admin' as const, projectId: 7 };
    case 'contributor':
      return { orgRole: 'member' as const, isOwner: false, projectRole: 'contributor' as const, projectId: 7 };
    case 'observer':
      return { orgRole: 'member' as const, isOwner: false, projectRole: 'observer' as const, projectId: 7 };
  }
};

describe('the matrix is complete', () => {
  test('every declared capability has a cell for every level', () => {
    for (const capability of CAPABILITIES) {
      for (const level of LEVELS) {
        expect(MATRIX[capability]?.[level], `${capability} × ${level}`).toBeDefined();
      }
    }
  });

  test('it declares nothing beyond the capability list', () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...CAPABILITIES].sort());
  });
});

// Rule 5 of docs/permissions.md: every cell has a test. The loop below is that test —
// each cell is asserted against can(), with `own` exercised in both directions.
describe('every cell', () => {
  for (const capability of CAPABILITIES as readonly Capability[]) {
    for (const level of LEVELS) {
      const expected: Grant = MATRIX[capability][level];
      test(`${capability} × ${level} → ${String(expected)}`, () => {
        const scope = membershipFor(level);
        if (expected === 'own') {
          expect(can(session, capability, { ...scope, isOwnRecord: true })).toBe(true);
          expect(can(session, capability, { ...scope, isOwnRecord: false })).toBe(false);
        } else {
          expect(can(session, capability, { ...scope, isOwnRecord: true })).toBe(expected);
        }
      });
    }
  }
});

describe('membership gates the level', () => {
  test('a non-member has no level at all', () => {
    expect(levelOf({ orgRole: null, isOwner: false, projectRole: null })).toBeNull();
    expect(can(session, 'org.read', { orgRole: null, isOwner: false, projectRole: null })).toBe(false);
  });

  test('a plain member reads the organisation but changes nothing', () => {
    const scope = { orgRole: 'member' as const, isOwner: false, projectRole: null };
    expect(can(session, 'org.read', scope)).toBe(true);
    expect(can(session, 'org.update', scope)).toBe(false);
  });

  test('a plain member with no project membership has no level inside the project', () => {
    const scope = { orgRole: 'member' as const, isOwner: false, projectRole: null, projectId: 7 };
    expect(levelOf(scope)).toBeNull();
    expect(can(session, 'project.read', scope)).toBe(false);
  });

  test('an org admin is an implicit project admin everywhere', () => {
    const scope = { orgRole: 'org_admin' as const, isOwner: false, projectRole: null, projectId: 7 };
    expect(levelOf(scope)).toBe('org_admin');
    expect(can(session, 'project.schema.manage', scope)).toBe(true);
  });

  test('only the owner transfers ownership or deletes the organisation', () => {
    const admin = membershipFor('org_admin');
    const owner = membershipFor('org_owner');
    expect(can(session, 'org.transfer_ownership', admin)).toBe(false);
    expect(can(session, 'org.delete', admin)).toBe(false);
    expect(can(session, 'org.transfer_ownership', owner)).toBe(true);
    expect(can(session, 'org.delete', owner)).toBe(true);
  });
});

// Phase 3 (owner, 26 Sep 2026): planning — the sprint field, backlog order — is an issue edit;
// creating, starting, finishing, deleting sprints and editing boards is Manage sprints and boards.
describe('agile', () => {
  const planning: Capability = 'issue.update';
  const managing: Capability = 'project.agile.manage';
  const expected: Record<Level, [plan: boolean, manage: boolean]> = {
    observer: [false, false],
    contributor: [true, false],
    project_admin: [true, true],
    org_admin: [true, true],
    org_owner: [true, true],
  };
  for (const level of LEVELS) {
    test(`${level}: plan ${expected[level][0]}, manage sprints and boards ${expected[level][1]}`, () => {
      const scope = membershipFor(level);
      expect(can(session, planning, scope)).toBe(expected[level][0]);
      expect(can(session, managing, scope)).toBe(expected[level][1]);
      expect(can(session, 'issue.read', scope)).toBe(true);
    });
  }

  test('a token plans with issues:write and manages with admin:project, and is told which it lacks', () => {
    const admin = membershipFor('project_admin');
    expect(can(pat(['issues:write']), planning, admin)).toBe(true);
    expect(can(pat(['issues:write']), managing, admin)).toBe(false);
    expect(missingScope(pat(['issues:write']), managing, admin)).toBe('admin:project');
    expect(can(pat(['admin:project']), managing, admin)).toBe(true);
    expect(missingScope(pat(['admin:project']), managing, membershipFor('contributor'))).toBeNull();
  });
});

// Phase 4 (owner, 26 Sep 2026): defining fields and their options is Manage custom fields; setting
// a value on an issue is Update issue fields; work item attributes sit with the work types.
describe('custom fields', () => {
  const setting: Capability = 'issue.update';
  const managing: Capability = 'project.custom_fields.manage';
  const attributes: Capability = 'project.schema.manage';
  const expected: Record<Level, [set: boolean, manage: boolean]> = {
    observer: [false, false],
    contributor: [true, false],
    project_admin: [true, true],
    org_admin: [true, true],
    org_owner: [true, true],
  };
  for (const level of LEVELS) {
    test(`${level}: set values ${expected[level][0]}, manage fields and work item attributes ${expected[level][1]}`, () => {
      const scope = membershipFor(level);
      expect(can(session, setting, scope)).toBe(expected[level][0]);
      expect(can(session, managing, scope)).toBe(expected[level][1]);
      expect(can(session, attributes, scope)).toBe(expected[level][1]);
      expect(can(session, 'project.read', scope)).toBe(true);
    });
  }

  test('a token sets values with issues:write and manages fields with admin:project, and is told which it lacks', () => {
    const admin = membershipFor('project_admin');
    expect(can(pat(['issues:write']), setting, admin)).toBe(true);
    expect(can(pat(['issues:write']), managing, admin)).toBe(false);
    expect(missingScope(pat(['issues:write']), managing, admin)).toBe('admin:project');
    expect(missingScope(pat(['issues:write']), attributes, admin)).toBe('admin:project');
    expect(can(pat(['admin:project']), managing, admin)).toBe(true);
    expect(missingScope(pat(['admin:project']), managing, membershipFor('contributor'))).toBeNull();
  });
});

// Phase 3.5: drafts are the author's and Project Admins'; published articles every member's.
describe('knowledge base', () => {
  const expected: Record<
    Level,
    Record<'read' | 'readOwnDraft' | 'readOthersDraft' | 'write' | 'deleteOwn' | 'deleteOthers' | 'star', boolean>
  > = {
    observer: {
      read: true,
      readOwnDraft: false,
      readOthersDraft: false,
      write: false,
      deleteOwn: false,
      deleteOthers: false,
      star: true,
    },
    contributor: {
      read: true,
      readOwnDraft: true,
      readOthersDraft: false,
      write: true,
      deleteOwn: true,
      deleteOthers: false,
      star: true,
    },
    project_admin: {
      read: true,
      readOwnDraft: true,
      readOthersDraft: true,
      write: true,
      deleteOwn: true,
      deleteOthers: true,
      star: true,
    },
    org_admin: {
      read: true,
      readOwnDraft: true,
      readOthersDraft: true,
      write: true,
      deleteOwn: true,
      deleteOthers: true,
      star: true,
    },
    org_owner: {
      read: true,
      readOwnDraft: true,
      readOthersDraft: true,
      write: true,
      deleteOwn: true,
      deleteOthers: true,
      star: true,
    },
  };
  for (const level of LEVELS) {
    test(`${level}: ${JSON.stringify(expected[level])}`, () => {
      const scope = membershipFor(level);
      const own = { ...scope, isOwnRecord: true };
      const others = { ...scope, isOwnRecord: false };
      const e = expected[level];
      expect(can(session, 'article.read_published', scope)).toBe(e.read);
      expect(can(session, 'article.read_draft', own)).toBe(e.readOwnDraft);
      expect(can(session, 'article.read_draft', others)).toBe(e.readOthersDraft);
      for (const write of [
        'article.create',
        'article.update',
        'article.publish',
        'article.reorder',
        'article.comment',
        'article.tag',
      ] as const) {
        expect(can(session, write, scope)).toBe(e.write);
      }
      expect(can(session, 'article.delete', own)).toBe(e.deleteOwn);
      expect(can(session, 'article.delete', others)).toBe(e.deleteOthers);
      expect(can(session, 'article.personal_signal', scope)).toBe(e.star);
    });
  }

  test('a token reads with issues:read, writes with issues:write and comments with comments:write', () => {
    const contributor = membershipFor('contributor');
    expect(can(pat(['issues:read']), 'article.read_published', contributor)).toBe(true);
    expect(missingScope(pat(['issues:read']), 'article.update', contributor)).toBe('issues:write');
    expect(missingScope(pat(['issues:write']), 'article.comment', contributor)).toBe('comments:write');
    expect(can(pat(['comments:write']), 'article.comment', contributor)).toBe(true);
  });
});

describe('draft reach', () => {
  const expected: Record<Level, { ownDrafts: boolean; admin: boolean }> = {
    observer: { ownDrafts: false, admin: false },
    contributor: { ownDrafts: true, admin: false },
    project_admin: { ownDrafts: true, admin: true },
    org_admin: { ownDrafts: true, admin: true },
    org_owner: { ownDrafts: true, admin: true },
  };
  for (const level of LEVELS) {
    test(`${level} reaches ${JSON.stringify(expected[level])}`, () => {
      expect(draftReach(session, membershipFor(level, 7))).toEqual(expected[level]);
    });
  }

  test('a token outside the project, or without issues:read, reaches no draft', () => {
    const admin = membershipFor('project_admin');
    expect(draftReach(pat(['issues:read'], [8]), admin)).toEqual({ ownDrafts: false, admin: false });
    expect(draftReach(pat(['time:write']), admin)).toEqual({ ownDrafts: false, admin: false });
    expect(draftReach(pat(['issues:read'], [7]), admin)).toEqual({ ownDrafts: true, admin: true });
  });
});

describe('rule 2: scopes narrow, never widen', () => {
  test('a read-only token cannot write even for an owner', () => {
    const owner = membershipFor('org_owner');
    expect(can(pat(['issues:read']), 'issue.read', owner)).toBe(true);
    expect(can(pat(['issues:read']), 'issue.create', owner)).toBe(false);
    expect(can(pat(['issues:read']), 'org.update', owner)).toBe(false);
  });

  test('a token carrying every scope still cannot exceed the role', () => {
    const observer = membershipFor('observer');
    expect(can(pat(PAT_SCOPES), 'issue.read', observer)).toBe(true);
    expect(can(pat(PAT_SCOPES), 'issue.create', observer)).toBe(false);
  });

  test('a project-restricted token is confined to its projects', () => {
    const admin = { orgRole: 'org_admin' as const, isOwner: false, projectRole: null, projectId: 7 };
    expect(can(pat(['issues:write'], [7]), 'issue.create', admin)).toBe(true);
    expect(can(pat(['issues:write'], [9]), 'issue.create', admin)).toBe(false);
    expect(can(pat(['issues:write'], null), 'issue.create', admin)).toBe(true);
  });

  test('a restricted token with no projects left reaches none', () => {
    const admin = { orgRole: 'org_admin' as const, isOwner: false, projectRole: null, projectId: 7 };
    expect(can(pat(['issues:read'], []), 'issue.read', admin)).toBe(false);
    expect(can(pat(['issues:write'], []), 'issue.create', admin)).toBe(false);
    expect(missingScope(pat([], []), 'issue.create', membershipFor('contributor'))).toBeNull();
  });

  test('a session principal is not scope-limited', () => {
    expect(can(session, 'issue.create', membershipFor('contributor'))).toBe(true);
  });
});

// token.scope_missing: named only where the role allows the capability, so a new token would fix it.
describe('missingScope, every scoped cell', () => {
  const scoped = (CAPABILITIES as readonly Capability[]).filter(c => REQUIRED_SCOPES[c]);
  for (const capability of scoped) {
    const needed = REQUIRED_SCOPES[capability]![0]!;
    for (const level of LEVELS) {
      const grant: Grant = MATRIX[capability][level];
      test(`${capability} × ${level} → ${grant === false ? 'none' : needed}`, () => {
        const scope = { ...membershipFor(level), isOwnRecord: true };
        const withoutIt = pat(PAT_SCOPES.filter(s => !REQUIRED_SCOPES[capability]!.includes(s)));
        expect(missingScope(withoutIt, capability, scope)).toBe(grant === false ? null : needed);
        expect(missingScope(pat(PAT_SCOPES), capability, scope)).toBeNull();
        expect(missingScope(session, capability, scope)).toBeNull();
      });
    }
  }

  test('a project the token is not restricted to stays a plain denial', () => {
    expect(missingScope(pat([], [9]), 'issue.create', membershipFor('contributor'))).toBeNull();
    expect(missingScope(pat([], [7]), 'issue.create', membershipFor('contributor'))).toBe('issues:write');
  });

  test("an own cell on someone else's record is a role denial, not a scope one", () => {
    const scope = { ...membershipFor('contributor'), isOwnRecord: false };
    expect(missingScope(pat([]), 'comment.update', scope)).toBeNull();
  });
});

describe('spot checks against docs/permissions.md', () => {
  test('observers may star, watch and vote but not alter an issue', () => {
    const observer = membershipFor('observer');
    expect(can(session, 'issue.personal_signal', observer)).toBe(true);
    expect(can(session, 'issue.watchers.read', observer)).toBe(true);
    expect(can(session, 'issue.watchers.manage', observer)).toBe(false);
    expect(can(session, 'comment.create', observer)).toBe(false);
  });

  test('a contributor edits only their own comment, a project admin edits any', () => {
    expect(can(session, 'comment.update', { ...membershipFor('contributor'), isOwnRecord: false })).toBe(false);
    expect(can(session, 'comment.update', { ...membershipFor('contributor'), isOwnRecord: true })).toBe(true);
    expect(can(session, 'comment.update', { ...membershipFor('project_admin'), isOwnRecord: false })).toBe(true);
  });

  test('tag operations climb from contributor to org admin', () => {
    expect(can(session, 'tag.create', membershipFor('contributor'))).toBe(true);
    expect(can(session, 'tag.update', membershipFor('contributor'))).toBe(false);
    expect(can(session, 'tag.update', membershipFor('project_admin'))).toBe(true);
    expect(can(session, 'tag.delete', membershipFor('project_admin'))).toBe(false);
    expect(can(session, 'tag.delete', membershipFor('org_admin'))).toBe(true);
  });

  test('an observer keeps a private saved view but no shared one', () => {
    const observer = membershipFor('observer');
    expect(can(session, 'saved_view.create_private', observer)).toBe(true);
    expect(can(session, 'saved_view.create_shared', observer)).toBe(false);
    expect(can(session, 'report.read', observer)).toBe(true);
    expect(can(session, 'report.export', observer)).toBe(true);
  });

  test('reports read and export with issues:read; any other token is told that scope', () => {
    for (const level of LEVELS) {
      const scope = membershipFor(level);
      for (const capability of ['report.read', 'report.export'] as const) {
        expect(can(pat(['issues:read']), capability, scope)).toBe(true);
        expect(can(pat(['time:write']), capability, scope)).toBe(false);
        expect(missingScope(pat(['time:write']), capability, scope)).toBe('issues:read');
      }
    }
  });

  test('deleting a project is org-level, archiving is project-level', () => {
    expect(can(session, 'project.archive', membershipFor('project_admin'))).toBe(true);
    expect(can(session, 'project.delete', membershipFor('project_admin'))).toBe(false);
    expect(can(session, 'project.delete', membershipFor('org_admin'))).toBe(true);
  });
});

describe('projectRolesWith', () => {
  test('names the project roles a capability is granted to outright', () => {
    expect(projectRolesWith('work_item.log_own')).toEqual(['contributor', 'project_admin']);
    expect(projectRolesWith('work_item.log_for_other')).toEqual(['project_admin']);
    expect(projectRolesWith('work_item.update')).toEqual(['project_admin']);
    expect(projectRolesWith('issue.read')).toEqual(['observer', 'contributor', 'project_admin']);
  });
});

describe('self-service: notifications', () => {
  test('a session reads and manages its own notifications without any role', () => {
    expect(missingSelfServiceScope(session, 'notification.read')).toBeNull();
    expect(missingSelfServiceScope(session, 'notification.manage')).toBeNull();
  });

  test('a token reads with issues:read and marks read or sets preferences with issues:write', () => {
    expect(SELF_SERVICE_SCOPES).toEqual({
      'notification.read': ['issues:read'],
      'notification.manage': ['issues:write'],
    });
    expect(missingSelfServiceScope(pat(['issues:read']), 'notification.read')).toBeNull();
    expect(missingSelfServiceScope(pat(['issues:read']), 'notification.manage')).toBe('issues:write');
    expect(missingSelfServiceScope(pat(['issues:write']), 'notification.manage')).toBeNull();
    expect(missingSelfServiceScope(pat(['time:write']), 'notification.read')).toBe('issues:read');
  });
});

// 6c (owner, 28 Sep 2026): the storage screen and every BYO action are Org Admin and Owner only.
describe('storage', () => {
  const expected: Record<Level, boolean> = {
    observer: false,
    contributor: false,
    project_admin: false,
    org_admin: true,
    org_owner: true,
  };
  for (const level of LEVELS) {
    test(`${level}: view storage usage and configure BYO storage → ${expected[level]}`, () => {
      const scope = membershipFor(level);
      expect(can(session, 'org.storage.read', scope)).toBe(expected[level]);
      expect(can(session, 'org.storage.configure', scope)).toBe(expected[level]);
    });
  }

  test('a token reads the storage screen with admin:org only', () => {
    const admin = membershipFor('org_admin');
    expect(can(pat(['admin:org']), 'org.storage.read', admin)).toBe(true);
    expect(missingScope(pat(['issues:read']), 'org.storage.read', admin)).toBe('admin:org');
  });
});

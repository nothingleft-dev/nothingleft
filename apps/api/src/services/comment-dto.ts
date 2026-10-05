import type { Comment, Principal } from '@nothingleft/types';
import type { CommentWithAuthor } from '@nothingleft/db';
import type { AccessService, ProjectAccess } from '@services/access';
import { can } from '@services/permissions';

export function commentDto(
  access: AccessService,
  principal: Principal,
  project: ProjectAccess,
  issueKey: string,
  row: CommentWithAuthor,
): Comment {
  return { ...commentFields(access, principal, project, row), issue: issueKey };
}

/** Everything but the parent, shared by issue and article comments. */
export function commentFields(
  access: AccessService,
  principal: Principal,
  project: ProjectAccess,
  row: CommentWithAuthor,
): Omit<Comment, 'issue'> {
  const scope = { ...project.scope, isOwnRecord: row.comment.author_id === principal.userId };
  const writable = !project.project.is_archived;
  return {
    id: row.comment.id,
    author: access.memberRef(row.author, row.author_membership),
    body_md: row.comment.body_md,
    created_at: row.comment.created_at.toISOString(),
    edited_at: row.comment.edited_at?.toISOString() ?? null,
    deleted_at: row.comment.deleted_at?.toISOString() ?? null,
    me: {
      can_edit: writable && can(principal, 'comment.update', scope),
      can_delete: writable && can(principal, 'comment.delete', scope),
    },
  };
}

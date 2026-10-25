import { t, type MessageKey } from '@nothingleft/i18n';
import { formatCalendarDate, formatDuration, formatIssueKey } from '@nothingleft/format';
import type { NotificationView } from '@nothingleft/db';
import type {
  MemberRef,
  Notification,
  NotificationDetail,
  NotificationKind,
  NotificationSubject,
} from '@nothingleft/types';

export const issueKeyOf = (view: NotificationView): string | null =>
  view.issue ? formatIssueKey(view.project.key, view.issue.key_number) : null;

export function subjectOf(view: NotificationView): NotificationSubject {
  const place = {
    project: { key: view.project.key, name: view.project.name },
    organization: { slug: view.organization.slug, name: view.organization.name },
  };
  if (view.issue) return { type: 'issue', key: issueKeyOf(view)!, title: view.issue.title, ...place };
  if (view.article) return { type: 'article', slug: view.article.slug, title: view.article.title, ...place };
  return { type: 'sprint', slug: view.sprint?.slug ?? '', name: view.sprint?.name ?? '', ...place };
}

export function subjectPath(subject: NotificationSubject): string {
  switch (subject.type) {
    case 'issue':
      return `/issue/${subject.key}`;
    case 'article':
      return `/projects/${subject.project.key}/articles/${subject.slug}`;
    case 'sprint':
      return `/projects/${subject.project.key}/backlog`;
  }
}

function summaryKey(kind: NotificationKind, detail: NotificationDetail, onArticle: boolean): MessageKey {
  if (kind !== 'mentioned') return `notification.${kind}.summary`;
  switch (detail.source) {
    case 'comment':
      return onArticle ? 'notification.mentioned_article_comment.summary' : 'notification.mentioned_comment.summary';
    case 'work_item':
      return 'notification.mentioned_work_item.summary';
    case 'article':
      return 'notification.mentioned_article.summary';
    default:
      return 'notification.mentioned.summary';
  }
}

export function summaryOf(view: NotificationView): string {
  const kind = view.notification.kind as NotificationKind;
  const detail = view.notification.payload as NotificationDetail;
  const subject = subjectOf(view);
  return t(summaryKey(kind, detail, subject.type === 'article'), {
    actor: view.actor?.user.name ?? t('actor.system'),
    issue: subject.type === 'issue' ? subject.key : '',
    article: subject.type === 'article' ? subject.title : '',
    sprint: subject.type === 'sprint' ? subject.name : '',
    from: detail.from ?? '',
    to: detail.to ?? '',
    link: detail.link ?? '',
    other: detail.other_issue ?? t('notification.linked.other_project'),
    duration: detail.minutes === undefined ? '' : formatDuration(detail.minutes),
    due: detail.due_date ? formatCalendarDate(detail.due_date) : '',
    pull_request: detail.pull_request ?? '',
  });
}

export interface Change {
  label: string;
  from: string;
  to: string;
  value: string;
}

export function changeOf(view: NotificationView): Change {
  const kind = view.notification.kind as NotificationKind;
  const detail = view.notification.payload as NotificationDetail;
  const change = (label: MessageKey, rest: Partial<Omit<Change, 'label'>>): Change => ({
    label: t(label),
    from: '',
    to: '',
    value: '',
    ...rest,
  });
  switch (kind) {
    case 'status_changed':
    case 'resolved':
      return change('email.notification.field.status', { from: detail.from ?? '', to: detail.to ?? '' });
    case 'assigned':
    case 'unassigned':
      return detail.from || detail.to
        ? change('email.notification.field.assignees', { from: detail.from ?? '', to: detail.to ?? '' })
        : change('email.notification.field.assignees', { value: t(`email.notification.value.${kind}`) });
    case 'commented':
      return change('email.notification.field.comment', { value: t('email.notification.value.commented') });
    case 'time_logged':
      return change('email.notification.field.time', {
        to: detail.minutes === undefined ? '' : formatDuration(detail.minutes),
      });
    case 'due_soon':
      return change('email.notification.field.due', { value: t('email.notification.value.due_soon') });
    case 'overdue':
      return change('email.notification.field.due', {
        value: detail.due_date ? formatCalendarDate(detail.due_date) : '',
      });
    default:
      return { label: t(`notification.kind.${kind}`), from: '', to: '', value: summaryOf(view) };
  }
}

export function toNotification(
  view: NotificationView,
  memberRef: (actor: NonNullable<NotificationView['actor']>) => MemberRef,
): Notification {
  const detail = view.notification.payload as NotificationDetail;
  const base = subjectPath(subjectOf(view));
  return {
    id: view.notification.id,
    kind: view.notification.kind as NotificationKind,
    actor: view.actor ? memberRef(view.actor) : null,
    summary: summaryOf(view),
    detail,
    read_at: view.notification.read_at?.toISOString() ?? null,
    created_at: view.notification.created_at.toISOString(),
    path: detail.comment === undefined ? base : `${base}#comment-${detail.comment}`,
  };
}

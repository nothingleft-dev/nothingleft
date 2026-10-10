import { t } from '@nothingleft/i18n';
import type { NotificationView } from '@nothingleft/db';
import { DIGEST_CADENCES, NOTIFICATION_KINDS, type DigestCadence, type NotificationKind } from '@nothingleft/types';
import { formatUtcInstant } from '@nothingleft/format';
import { DIGEST_ISSUES_PER_LINE } from '@config/constants';
import { signLink, verifyLink } from '@lib/crypto';
import type { Line, Message } from '@lib/email';
import { changeOf, issueKeyOf, subjectOf, subjectPath, summaryOf } from '@services/notification-render';

export interface MailLinks {
  appBaseUrl: string;
  apiBaseUrl: string;
  secret: string;
}

export interface MailRecipient {
  email: string;
  name: string;
  user_id: number;
}

export type UnsubscribeTarget = { kinds: NotificationKind[] } | { cadence: DigestCadence };

const TOKEN_VERSION = 'v1';

export function unsubscribeToken(secret: string, userId: number, target: UnsubscribeTarget): string {
  const what = 'kinds' in target ? `k:${target.kinds.join(',')}` : `d:${target.cadence}`;
  return signLink(secret, `${TOKEN_VERSION}.${userId}.${what}`);
}

export function readUnsubscribeToken(
  secret: string,
  token: string,
): { userId: number; target: UnsubscribeTarget } | null {
  const payload = verifyLink(secret, token);
  const match = payload?.match(/^v1\.(\d+)\.([kd]):([a-z_,]+)$/);
  if (!match) return null;
  const userId = Number(match[1]);
  if (match[2] === 'd') {
    const cadence = match[3] as DigestCadence;
    return DIGEST_CADENCES.includes(cadence) ? { userId, target: { cadence } } : null;
  }
  const kinds = match[3]!.split(',') as NotificationKind[];
  return kinds.every(k => NOTIFICATION_KINDS.includes(k)) ? { userId, target: { kinds } } : null;
}

const kindLabels = (kinds: readonly NotificationKind[]) => kinds.map(k => t(`notification.kind.${k}`)).join(', ');

function unsubscribeHeaders(links: MailLinks, token: string): Record<string, string> {
  // RFC 8058: the mail client POSTs `List-Unsubscribe=One-Click` to this URL, no page in between.
  return {
    'List-Unsubscribe': `<${links.apiBaseUrl}/v1/notifications/unsubscribe?token=${token}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

const footerUrls = (links: MailLinks, token: string) => ({
  // The page asks before it acts, so a link scanner opening it unsubscribes nobody.
  unsubscribe_url: `${links.appBaseUrl}/unsubscribe?token=${token}`,
  preferences_url: `${links.appBaseUrl}/settings?tab=notifications`,
});

const subjectText = (view: NotificationView) => {
  const s = subjectOf(view);
  return s.type === 'issue' ? `${s.key} ${s.title}` : s.type === 'article' ? s.title : s.name;
};

function lineParams(view: NotificationView): Record<string, string> {
  return {
    summary: summaryOf(view),
    ...changeOf(view),
    actor: view.actor?.user.name ?? '',
    project: view.project.name,
    at: formatUtcInstant(view.notification.created_at),
  };
}

/** One email for what one fan-out run told one person about, grouped by what it is about. */
export function instantMessage(links: MailLinks, to: MailRecipient, views: NotificationView[]): Message {
  const kinds = [...new Set(views.map(v => v.notification.kind as NotificationKind))];
  const token = unsubscribeToken(links.secret, to.user_id, { kinds });
  const bySubject = new Map<string, NotificationView[]>();
  for (const v of views) bySubject.set(v.group_key, [...(bySubject.get(v.group_key) ?? []), v]);

  const lines: Line[] = [{ key: 'email.notification.greeting', params: { name: to.name } }];
  for (const group of bySubject.values()) {
    for (const v of group) lines.push({ key: 'email.notification.line', params: lineParams(v) });
    lines.push({
      key: 'email.notification.open',
      params: { subject: subjectText(group[0]!), url: `${links.appBaseUrl}${subjectPath(subjectOf(group[0]!))}` },
    });
  }
  lines.push({ key: 'email.notification.footer', params: { kinds: kindLabels(kinds), ...footerUrls(links, token) } });

  const first = views[0]!;
  const single = bySubject.size === 1;
  return {
    to: to.email,
    subject:
      views.length === 1
        ? 'email.notification.subject'
        : single
          ? 'email.notification_many.subject'
          : 'email.notification_due.subject',
    params: {
      summary: summaryOf(first),
      count: single ? views.length : bySubject.size,
      subject: issueKeyOf(first) ?? subjectText(first),
    },
    body: lines,
    headers: unsubscribeHeaders(links, token),
  };
}

// Listed issue by issue; the watcher kinds fold into one line; the rest are counts.
const LISTED: readonly NotificationKind[] = ['assigned', 'mentioned', 'due_soon', 'overdue'];
const WATCHED: readonly NotificationKind[] = ['commented', 'status_changed', 'resolved', 'linked', 'time_logged'];

export function digestMessage(
  links: MailLinks,
  to: MailRecipient,
  org: { name: string },
  cadence: DigestCadence,
  kinds: NotificationKind[],
  views: NotificationView[],
): Message {
  const token = unsubscribeToken(links.secret, to.user_id, { cadence });
  const inbox = (project: string, of: readonly NotificationKind[]) =>
    `${links.appBaseUrl}/inbox?project=${project}&kind=${of.join(',')}`;

  const byProject = new Map<string, NotificationView[]>();
  for (const v of views) byProject.set(v.project.key, [...(byProject.get(v.project.key) ?? []), v]);

  const lines: Line[] = [{ key: `email.digest.${cadence}.heading`, params: { org: org.name } }];
  for (const [key, rows] of byProject) {
    lines.push({ key: 'email.digest.project', params: { project: rows[0]!.project.name } });
    const of = (kind: NotificationKind) => rows.filter(r => r.notification.kind === kind);
    for (const kind of LISTED) {
      const items = of(kind);
      if (items.length === 0) continue;
      lines.push({ key: 'email.digest.kind', params: { label: t(`notification.kind.${kind}`), count: items.length } });
      const seen = [...new Map(items.map(i => [i.group_key, i])).values()];
      for (const item of seen.slice(0, DIGEST_ISSUES_PER_LINE)) {
        const subject = subjectOf(item);
        lines.push({
          key: 'email.digest.issue',
          params: {
            key: subject.type === 'issue' ? subject.key : '',
            title: subject.type === 'issue' ? subject.title : subjectText(item),
          },
        });
      }
      if (seen.length > DIGEST_ISSUES_PER_LINE) {
        lines.push({
          key: 'email.digest.more',
          params: { count: seen.length - DIGEST_ISSUES_PER_LINE, url: inbox(key, [kind]) },
        });
      }
    }
    const watched = rows.filter(r => WATCHED.includes(r.notification.kind as NotificationKind));
    if (watched.length > 0) {
      lines.push({ key: 'email.digest.watched', params: { count: watched.length, url: inbox(key, WATCHED) } });
    }
    for (const kind of NOTIFICATION_KINDS) {
      if (LISTED.includes(kind) || WATCHED.includes(kind)) continue;
      const items = of(kind);
      if (items.length === 0) continue;
      lines.push({
        key: 'email.digest.count',
        params: { label: t(`notification.kind.${kind}`), count: items.length, url: inbox(key, [kind]) },
      });
    }
  }
  lines.push({
    key: `email.digest.footer.${cadence}`,
    params: { kinds: kindLabels(kinds), ...footerUrls(links, token) },
  });

  return {
    to: to.email,
    subject: `email.digest.${cadence}.subject`,
    params: { org: org.name },
    body: lines,
    headers: unsubscribeHeaders(links, token),
  };
}

import type { MessageKey } from '@nothingleft/i18n';
import type { HtmlLine } from '@lib/email-html';

export interface EmailSample {
  id: string;
  group: string;
  to: string;
  subject: MessageKey;
  body: MessageKey | readonly HtmlLine[];
  params: Record<string, string | number>;
}

const APP = 'https://work.nothingleft.dev';
const to = 'alex@acme.example';
const person = { name: 'Alex' };
const admin = { name: 'Alex', actor: 'Casey Morgan', org: 'ACME' };
const org = { ...person, org: 'ACME', url: `${APP}/organization` };

const transactional = (
  group: string,
  id: string,
  params: Record<string, string | number>,
  options: { to?: string; subject?: MessageKey; body?: MessageKey } = {},
): EmailSample => ({
  id: `email.${id}`,
  group,
  to: options.to ?? to,
  subject: options.subject ?? (`email.${id}.subject` as MessageKey),
  body: options.body ?? (`email.${id}.body` as MessageKey),
  params,
});

const security = `${APP}/settings?tab=security`;
const footer = {
  kinds: 'issues and comments',
  unsubscribe_url: `${APP}/unsubscribe?token=abc`,
  preferences_url: `${APP}/settings?tab=notifications`,
};

const notificationLines = (count: number): HtmlLine[] => [
  { key: 'email.notification.greeting', params: { name: 'Alex' } },
  ...[
    {
      summary: 'Casey Morgan changed WEB-142 from Open to Closed',
      label: 'Status',
      from: 'Open',
      to: 'Closed',
      value: '',
    },
    { summary: 'Casey Morgan logged 1h 30m on WEB-142', label: 'Spent time', from: '', to: '1h 30m', value: '' },
    { summary: 'Casey Morgan commented on WEB-142', label: 'Comment', from: '', to: '', value: 'Added a comment' },
  ]
    .slice(0, count)
    .map((change): HtmlLine => ({
      key: 'email.notification.line',
      params: { ...change, actor: 'Casey Morgan', project: 'Website relaunch', at: '8 Oct 2026, 1:24pm UTC' },
    })),
  {
    key: 'email.notification.open',
    params: { subject: 'WEB-142 Checkout button is hidden on small screens', url: `${APP}/issues/WEB-142` },
  },
  { key: 'email.notification.footer', params: footer },
];

const digestLines = (cadence: 'daily' | 'weekly'): HtmlLine[] => [
  { key: `email.digest.${cadence}.heading`, params: { org: 'ACME' } },
  { key: 'email.digest.project', params: { project: 'Website relaunch' } },
  { key: 'email.digest.kind', params: { label: 'Assigned to you', count: 7 } },
  ...['142:Checkout button is hidden on small screens', '138:Update pricing table copy', '131:Fix footer links'].map(
    (item): HtmlLine => {
      const [key, title] = item.split(':');
      return { key: 'email.digest.issue', params: { key: `WEB-${key}`, title: title! } };
    },
  ),
  { key: 'email.digest.more', params: { count: 4, url: `${APP}/inbox?project=WEB&kind=assigned` } },
  { key: 'email.digest.kind', params: { label: 'Due soon', count: 1 } },
  { key: 'email.digest.issue', params: { key: 'WEB-120', title: 'Add OG images to the blog' } },
  { key: 'email.digest.watched', params: { count: 12, url: `${APP}/inbox?project=WEB&kind=commented` } },
  { key: 'email.digest.project', params: { project: 'Mobile app' } },
  {
    key: 'email.digest.count',
    params: { label: 'Reactions', count: 3, url: `${APP}/inbox?project=APP&kind=reaction` },
  },
  { key: `email.digest.footer.${cadence}`, params: footer },
];

export const EMAIL_SAMPLES: EmailSample[] = [
  transactional('Account and security', 'verify', { name: 'Alex', url: `${APP}/verify?token=k3J9xQw2` }),
  transactional('Account and security', 'password_reset', {
    name: 'Alex',
    url: `${APP}/reset-password?token=Zp81aLm0`,
  }),
  transactional('Account and security', 'password_changed', { name: 'Alex', url: `${APP}/reset-password` }),
  transactional('Account and security', 'unverified_account_linked', {
    name: 'Alex',
    email: to,
    provider: 'Google',
    url: `${APP}/reset-password`,
  }),
  transactional(
    'Account and security',
    'email_change_verify',
    { name: 'Alex', new_email: 'alex@acme.test', url: `${APP}/verify-email?token=Qe72` },
    { to: 'alex@acme.test' },
  ),
  transactional('Account and security', 'email_changed', { name: 'Alex', old_email: to, new_email: 'alex@acme.test' }),
  transactional('Account and security', 'pat_created', {
    name: 'Alex',
    token_name: 'CI deploy',
    url: `${APP}/settings?tab=tokens`,
  }),
  transactional('Account and security', 'two_factor_enabled', { name: 'Alex', url: security }),
  transactional('Account and security', 'two_factor_disabled', { name: 'Alex', url: security }),
  transactional('Account and security', 'recovery_code_used', { name: 'Alex', remaining: 7, url: security }),
  transactional('Account and security', 'recovery_codes_regenerated', { name: 'Alex', url: security }),
  transactional('Account and security', 'account_deactivated', { name: 'Alex' }),
  transactional('Account and security', 'account_reactivated', { name: 'Alex' }),

  transactional(
    'Organisation and membership',
    'invitation',
    {
      inviter: 'Casey Morgan',
      org: 'ACME',
      project: '',
      role: 'Developer',
      email: 'jordan@acme.example',
      url: `${APP}/invitations/accept?token=Lm3`,
    },
    { to: 'jordan@acme.example' },
  ),
  transactional(
    'Organisation and membership',
    'invitation_project',
    {
      inviter: 'Casey Morgan',
      org: 'ACME',
      project: 'Website relaunch',
      role: 'Developer',
      email: 'jordan@acme.example',
      url: `${APP}/invitations/accept?token=Lm3`,
    },
    { to: 'jordan@acme.example', subject: 'email.invitation.subject' },
  ),
  transactional('Organisation and membership', 'member_removed', admin),
  transactional('Organisation and membership', 'role_raised', { ...admin, url: `${APP}/organization` }),
  transactional('Organisation and membership', 'project_role_raised', {
    ...admin,
    project: 'Website relaunch',
    url: `${APP}/projects/WEB`,
  }),
  transactional('Organisation and membership', 'ownership_offered', {
    ...org,
    owner: 'Casey Morgan',
    url: `${APP}/organization/transfer`,
  }),
  transactional('Organisation and membership', 'ownership_offer_sent', { ...org, target: 'Jordan Lee' }),
  transactional('Organisation and membership', 'ownership_offer_cancelled', {
    ...person,
    owner: 'Casey Morgan',
    org: 'ACME',
  }),
  transactional('Organisation and membership', 'ownership_offer_declined', { ...org, target: 'Jordan Lee' }),
  transactional('Organisation and membership', 'ownership_received', { ...org, other: 'Casey Morgan' }),
  transactional('Organisation and membership', 'ownership_handed_over', { ...org, other: 'Jordan Lee' }),
  transactional('Organisation and membership', 'org_deletion_scheduled', {
    ...org,
    actor: 'Casey Morgan',
    date: '24 Oct 2026',
  }),
  transactional('Organisation and membership', 'org_deletion_reminder', { ...org, date: '24 Oct 2026' }),
  transactional('Organisation and membership', 'org_deletion_cancelled', { ...org, actor: 'Casey Morgan', date: '' }),
  transactional('Organisation and membership', 'org_deleted', { ...org, date: '24 Oct 2026' }),

  transactional('Limits', 'storage_almost_full', { ...org, used: '4.8 GB', limit: '5 GB', percent: 96 }),
  transactional('Limits', 'storage_full', { ...org, used: '5 GB', limit: '5 GB', percent: 100 }),
  transactional('Bring your own storage', 'storage_connected', { ...org, actor: 'Casey Morgan', bucket: 'acme-files' }),
  transactional('Bring your own storage', 'storage_disconnected', {
    ...org,
    actor: 'Casey Morgan',
    bucket: 'acme-files',
  }),
  transactional('Bring your own storage', 'storage_byo_failed', { ...org, bucket: 'acme-files' }),
  transactional('Organisation export', 'export_ready', {
    ...org,
    url: `${APP}/organization?tab=exports`,
    size: '48.2 MB',
    date: '17 Oct 2026',
  }),

  {
    id: 'email.notification',
    group: 'Activity notifications',
    to,
    subject: 'email.notification.subject',
    params: { summary: 'Casey Morgan closed WEB-142' },
    body: notificationLines(1),
  },
  {
    id: 'email.notification_many',
    group: 'Activity notifications',
    to,
    subject: 'email.notification_many.subject',
    params: { count: 3, subject: 'WEB-142' },
    body: notificationLines(3),
  },
  {
    id: 'email.digest.daily',
    group: 'Activity notifications',
    to,
    subject: 'email.digest.daily.subject',
    params: { org: 'ACME' },
    body: digestLines('daily'),
  },
  {
    id: 'email.digest.weekly',
    group: 'Activity notifications',
    to,
    subject: 'email.digest.weekly.subject',
    params: { org: 'ACME' },
    body: digestLines('weekly'),
  },
];

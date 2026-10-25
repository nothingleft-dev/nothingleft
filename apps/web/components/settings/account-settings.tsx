'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@components/page-header';
import { Segmented } from '@components/segmented';
import { PageSkeleton } from '@components/skeletons';
import { FormAlert } from '@components/auth/form-alert';
import { NotificationsTab } from '@components/settings/notifications-tab';
import { ProfileTab } from '@components/settings/profile-tab';
import { SecurityTab } from '@components/settings/security-tab';
import { SessionsTab } from '@components/settings/sessions-tab';
import { TokensTab } from '@components/settings/tokens-tab';
import { GitIdentitiesTab } from '@components/settings/git-identities-tab';
import { useSession } from '@hooks/use-session';
import { useOrganizations } from '@hooks/use-organizations';
import { useMyGitIdentities } from '@hooks/use-git';

const TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'security', label: 'Security' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'tokens', label: 'Access tokens' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'git', label: 'Git identities' },
] as const;

type Tab = (typeof TABS)[number]['value'];

const isTab = (value: string | null): value is Tab => TABS.some(t => t.value === value);

export function AccountSettings() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('tab');
  const asked: Tab = isTab(requested) ? requested : 'profile';
  const session = useSession();
  // Git identities appear once an organisation the person belongs to connects an account (plan § 14).
  const organizations = useOrganizations(session.status === 'signed-in');
  const identities = useMyGitIdentities(session.status === 'signed-in');
  const git = (organizations.data?.some(o => o.git_connected) ?? false) || (identities.data?.length ?? 0) > 0;
  const tabs = TABS.filter(t => t.value !== 'git' || git);
  // A link from the verify page or an email may arrive before the organisations load; keep the tab then.
  const tab: Tab = asked === 'git' && !git && !organizations.isPending && !identities.isPending ? 'profile' : asked;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Settings"
        actions={
          <Segmented
            ariaLabel="Account settings"
            value={tab}
            options={tabs}
            onChange={next => router.replace(`/settings?tab=${next}`)}
          />
        }
      />

      {session.status === 'loading' ? <PageSkeleton rows={4} /> : null}
      {session.status === 'error' ? <FormAlert title="Your account could not be loaded." /> : null}
      {session.status === 'signed-out' ? <FormAlert title="Sign in to manage your account." /> : null}

      {session.status === 'signed-in' ? (
        <div className="max-w-3xl">
          {tab === 'profile' ? <ProfileTab user={session.user} /> : null}
          {tab === 'security' ? <SecurityTab user={session.user} /> : null}
          {tab === 'sessions' ? <SessionsTab /> : null}
          {tab === 'tokens' ? <TokensTab /> : null}
          {tab === 'notifications' ? <NotificationsTab user={session.user} /> : null}
          {tab === 'git' ? <GitIdentitiesTab /> : null}
        </div>
      ) : null}
    </div>
  );
}

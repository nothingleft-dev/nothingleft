import type { Metadata } from 'next';
import { AccountSettings } from '@components/settings/account-settings';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return <AccountSettings />;
}

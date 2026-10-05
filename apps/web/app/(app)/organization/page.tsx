import type { Metadata } from 'next';
import { OrganizationSettings } from '@components/organization/organization-settings';

export const metadata: Metadata = { title: 'Organisation' };

export default function Page() {
  return <OrganizationSettings />;
}

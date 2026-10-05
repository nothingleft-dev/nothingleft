import type { Metadata } from 'next';
import { WelcomeFlow } from '@components/onboarding/welcome-flow';

export const metadata: Metadata = { title: 'Invite people' };

export default function Page() {
  return <WelcomeFlow step="invite" />;
}

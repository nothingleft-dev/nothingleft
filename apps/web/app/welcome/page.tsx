import type { Metadata } from 'next';
import { WelcomeFlow } from '@components/onboarding/welcome-flow';

export const metadata: Metadata = { title: 'Set up your account' };

export default function Page() {
  return <WelcomeFlow step="profile" />;
}

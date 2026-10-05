import type { Metadata } from 'next';
import { WelcomeFlow } from '@components/onboarding/welcome-flow';

export const metadata: Metadata = { title: 'Create your organisation' };

export default function Page() {
  return <WelcomeFlow step="organization" />;
}

import type { Metadata } from 'next';
import { WelcomeFlow } from '@components/onboarding/welcome-flow';

export const metadata: Metadata = { title: 'Create your first project' };

export default function Page() {
  return <WelcomeFlow step="project" />;
}

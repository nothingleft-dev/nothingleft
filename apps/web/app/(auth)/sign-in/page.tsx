import type { Metadata } from 'next';
import { AuthSplit } from '@components/auth/auth-split';
import { SignInForm } from '@components/auth/sign-in-form';
import { authPageMetadata } from '@lib/auth-metadata';

export const metadata: Metadata = authPageMetadata('sign-in');

export default function Page() {
  return (
    <AuthSplit>
      <SignInForm />
    </AuthSplit>
  );
}

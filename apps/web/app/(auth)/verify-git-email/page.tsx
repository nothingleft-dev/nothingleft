import type { Metadata } from 'next';
import { AuthSplit } from '@components/auth/auth-split';
import { VerifyGitEmail } from '@components/git/verify-git-email';

export const metadata: Metadata = { title: 'Verify a git email', robots: { index: false } };

export default function Page() {
  return (
    <AuthSplit>
      <VerifyGitEmail />
    </AuthSplit>
  );
}

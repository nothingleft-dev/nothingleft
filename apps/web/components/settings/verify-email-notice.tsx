'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { needsVerification } from '@components/onboarding/verify-gate';
import { useSession } from '@hooks/use-session';
import { resendVerification } from '@lib/api/auth';

export function useNeedsVerification(): boolean {
  const session = useSession();
  return session.status === 'signed-in' && needsVerification(session.user);
}

export function VerifyEmailNotice({ title }: { title: string }) {
  const resend = useMutation({ mutationFn: resendVerification, onSuccess: () => toast.success('Verification sent.') });

  return (
    <FormAlert tone="warning" title={title}>
      <Button variant="ghost" size="sm" disabled={resend.isPending} onClick={() => resend.mutate()}>
        Resend verification email
      </Button>
    </FormAlert>
  );
}

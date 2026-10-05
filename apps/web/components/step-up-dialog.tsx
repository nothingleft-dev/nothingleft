'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import type { Me, OAuthProvider, StepUp } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { ReauthButtons } from '@components/auth/provider-buttons';
import { useApiError } from '@hooks/use-api-error';
import { isApiError, type ApiError } from '@lib/api/errors';

const PROVIDER_LABELS: Record<OAuthProvider, string> = { google: 'Google', github: 'GitHub' };

interface StepUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: Me;
  title: string;
  confirmLabel: string;
  pendingLabel: string;
  destructive?: boolean;
  /** The consequences, stated before anything is typed. */
  children?: ReactNode;
  /** Fields of the caller's own that sit above the confirmation, such as a typed name. */
  before?: ReactNode;
  /** False while the caller's own fields are incomplete. */
  ready?: boolean;
  onConfirm: (body: StepUp) => void;
  pending: boolean;
  error: unknown;
  /** Draws a refusal the caller knows more about; undefined falls back to the message. */
  renderError?: (error: ApiError) => ReactNode | undefined;
  /** Where a provider sign-in comes back to, so the dialog can open again there. */
  returnTo: string;
}

/**
 * The confirmation every destructive account and organisation action takes: the password,
 * plus a code while two-factor is on. An account with no password confirms by having signed
 * in within ten minutes, so the dialog sends nothing and offers the providers on a refusal.
 */
export function StepUpDialog({
  open,
  onOpenChange,
  user,
  title,
  confirmLabel,
  pendingLabel,
  destructive = true,
  children,
  before,
  ready = true,
  onConfirm,
  pending,
  error,
  renderError,
  returnTo,
}: StepUpDialogProps) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [missing, setMissing] = useState<{ current_password?: string; code?: string }>({});
  const parsed = useApiError(error);
  const needsCode = user.has_password && user.two_factor.enabled;
  const reauth = isApiError(error) && error.code === 'auth.recent_sign_in_required';
  const custom = isApiError(error) && !reauth ? renderError?.(error) : undefined;
  const providers = user.linked_providers.map(p => PROVIDER_LABELS[p]).join(' or ');

  const close = (next: boolean) => {
    if (!next) {
      setPassword('');
      setCode('');
      setMissing({});
    }
    onOpenChange(next);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!user.has_password) return onConfirm({});
    const gaps: typeof missing = {};
    if (password === '') gaps.current_password = 'Enter your current password to confirm.';
    if (needsCode && code.trim() === '') gaps.code = 'Enter the code from your authenticator app, or a recovery code.';
    setMissing(gaps);
    if (Object.keys(gaps).length > 0) return;
    onConfirm(needsCode ? { current_password: password, code } : { current_password: password });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription asChild>
              <div className="flex flex-col gap-2 text-sm leading-5 text-text-secondary">{children}</div>
            </DialogDescription>
          </DialogHeader>

          {before}

          {custom ?? (parsed.summary && !reauth ? <FormAlert title={parsed.summary} /> : null)}

          {user.has_password ? (
            <div className="flex flex-col gap-3">
              <Field
                label="Current password"
                type="password"
                autoComplete="current-password"
                autoFocus={before === undefined}
                value={password}
                error={missing.current_password ?? parsed.fields['current_password']}
                onChange={e => {
                  setPassword(e.target.value);
                  setMissing(m => ({ ...m, current_password: undefined }));
                }}
              />
              {needsCode ? (
                <Field
                  label="Two-factor code"
                  autoComplete="one-time-code"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="font-mono"
                  hint="The 6-digit code from your authenticator app, or one of your recovery codes."
                  value={code}
                  error={missing.code ?? parsed.fields['code']}
                  onChange={e => {
                    setCode(e.target.value);
                    setMissing(m => ({ ...m, code: undefined }));
                  }}
                />
              ) : null}
            </div>
          ) : reauth ? (
            <div className="flex flex-col gap-3 rounded-md border bg-app p-3">
              <p className="text-sm text-text-secondary">
                {isApiError(error) ? error.message : null} This page opens again when you are back.
              </p>
              <ReauthButtons providers={user.linked_providers} next={returnTo} />
            </div>
          ) : (
            <p className="text-sm text-text-secondary">
              Your account signs in with {providers}, so there is no password to type. If you signed in more than ten
              minutes ago, you will be asked to sign in with {providers} again first.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={pending || !ready}>
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

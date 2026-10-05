'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { RECOVERY_CODE_COUNT, type Me, type TwoFactorRecoveryCodes, type TwoFactorSetup } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { CopyButton } from '@components/copy-button';
import { StepUpDialog } from '@components/step-up-dialog';
import { SettingsSection } from '@components/settings/section';
import { RecoveryCodes } from '@components/settings/recovery-codes';
import { useApiError } from '@hooks/use-api-error';
import {
  useConfirmTwoFactor,
  useDisableTwoFactor,
  useRegenerateRecoveryCodes,
  useStartTwoFactorSetup,
} from '@hooks/use-account-security';
import { formatDate } from '@lib/datetime';
import { cn } from '@lib/utils';

export type SecurityConfirm = 'disable-two-factor' | 'recovery-codes' | 'deactivate';

const LOW_RECOVERY_CODES = 3;

// Groups of four, the way authenticator apps print a key for typing.
const spaced = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

interface TwoFactorSectionProps {
  user: Me;
  confirm: SecurityConfirm | null;
  onConfirmHandled: () => void;
}

export function TwoFactorSection({ user, confirm, onConfirmHandled }: TwoFactorSectionProps) {
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [codes, setCodes] = useState<TwoFactorRecoveryCodes | null>(null);
  const [chosen, setDialog] = useState<'disable' | 'regenerate' | null>(null);
  const start = useStartTwoFactorSetup();
  const disable = useDisableTwoFactor();
  const regenerate = useRegenerateRecoveryCodes();
  const startError = useApiError(start.error);
  const status = user.two_factor;

  const dialog =
    chosen ?? (confirm === 'disable-two-factor' ? 'disable' : confirm === 'recovery-codes' ? 'regenerate' : null);

  const closeDialog = (open: boolean) => {
    if (open) return;
    setDialog(null);
    disable.reset();
    regenerate.reset();
    onConfirmHandled();
  };

  const description = !user.has_password
    ? 'Your account only signs in with Google or GitHub, so there is no password for two-factor to protect. Set a password first if you want it.'
    : status.enabled
      ? 'Signing in with your password also asks for a code from your authenticator app. Google and GitHub sign-in never ask.'
      : 'Add a second step to signing in with your password: a six-digit code from an authenticator app on your phone.';

  const actions =
    user.has_password && !setup && !codes ? (
      status.enabled ? (
        <>
          <Button variant="outline" size="sm" onClick={() => setDialog('regenerate')}>
            Create new recovery codes
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDialog('disable')}>
            Turn off
          </Button>
        </>
      ) : (
        <Button size="sm" disabled={start.isPending} onClick={() => start.mutate(undefined, { onSuccess: setSetup })}>
          {start.isPending ? 'Starting…' : 'Turn on'}
        </Button>
      )
    ) : null;

  return (
    <SettingsSection title="Two-factor authentication" description={description} actions={actions}>
      {status.enabled && !codes ? (
        <TwoFactorStatusLine enabledAt={status.enabled_at} left={status.recovery_codes_remaining} />
      ) : null}
      {startError.summary ? <FormAlert title={startError.summary} /> : null}

      {setup ? (
        <SetupPanel
          setup={setup}
          email={user.email}
          onCancel={() => setSetup(null)}
          onEnabled={result => {
            setSetup(null);
            setCodes(result);
            toast.success('Two-factor authentication is on.');
          }}
        />
      ) : null}

      {codes ? <RecoveryCodes email={user.email} codes={codes} onDone={() => setCodes(null)} /> : null}

      {user.has_password && status.enabled ? (
        <>
          <StepUpDialog
            open={dialog === 'regenerate'}
            onOpenChange={closeDialog}
            user={user}
            title="Create new recovery codes"
            confirmLabel="Create new codes"
            pendingLabel="Creating…"
            destructive={false}
            returnTo="/settings?tab=security&confirm=recovery-codes"
            pending={regenerate.isPending}
            error={regenerate.error}
            onConfirm={body =>
              regenerate.mutate(body, {
                onSuccess: result => {
                  closeDialog(false);
                  setCodes(result);
                },
              })
            }
          >
            <p>
              Ten new codes replace the old ones, which stop working at once - including the{' '}
              {status.recovery_codes_remaining} you have not used. We email you to say it happened.
            </p>
          </StepUpDialog>

          <StepUpDialog
            open={dialog === 'disable'}
            onOpenChange={closeDialog}
            user={user}
            title="Turn off two-factor authentication"
            confirmLabel="Turn off"
            pendingLabel="Turning off…"
            returnTo="/settings?tab=security&confirm=disable-two-factor"
            pending={disable.isPending}
            error={disable.error}
            onConfirm={body =>
              disable.mutate(body, {
                onSuccess: () => {
                  closeDialog(false);
                  toast.success('Two-factor authentication is off.');
                },
              })
            }
          >
            <p>
              Signing in will ask only for your password. Your unused recovery codes are deleted, and we email you to
              say it happened.
            </p>
          </StepUpDialog>
        </>
      ) : null}
    </SettingsSection>
  );
}

function TwoFactorStatusLine({ enabledAt, left }: { enabledAt: string | null; left: number }) {
  const low = left <= LOW_RECOVERY_CODES;
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-text-secondary">
      <span className="inline-flex items-center gap-1.5 font-medium text-text">
        <span className="size-2 rounded-full bg-green-solid" aria-hidden />
        On
      </span>
      {enabledAt ? <span>since {formatDate(enabledAt)}</span> : null}
      <span aria-hidden>·</span>
      <span className={cn(low && 'font-medium text-warning-fg')}>
        {left} of {RECOVERY_CODE_COUNT} recovery codes left{low ? ' - create new ones before you run out' : ''}
      </span>
    </p>
  );
}

interface SetupPanelProps {
  setup: TwoFactorSetup;
  email: string;
  onCancel: () => void;
  onEnabled: (codes: TwoFactorRecoveryCodes) => void;
}

function SetupPanel({ setup, email, onCancel, onEnabled }: SetupPanelProps) {
  const [form, setForm] = useState({ code: '', current_password: '' });
  const [missing, setMissing] = useState<{ code?: string; current_password?: string }>({});
  const confirm = useConfirmTwoFactor();
  const error = useApiError(confirm.error);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const gaps: typeof missing = {};
    if (form.code.trim() === '') gaps.code = 'Enter the 6-digit code your app shows now.';
    if (form.current_password === '') gaps.current_password = 'Enter your current password to confirm.';
    setMissing(gaps);
    if (Object.keys(gaps).length === 0) confirm.mutate(form, { onSuccess: onEnabled });
  };

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5 rounded-md border p-4">
      <SetupStep number={1} title="Scan the QR code">
        <p className="text-sm text-text-secondary">
          Use an authenticator app on your phone, such as Google Authenticator, 1Password or Authy. It adds an entry for
          Nothing Left, {email}.
        </p>
        <div className="flex flex-wrap items-start gap-5">
          {/* QR codes scan reliably only dark on light, so the tile stays white in both themes. */}
          <div className="rounded-md border bg-white p-3 text-black">
            <QRCodeSVG
              value={setup.otpauth_uri}
              size={152}
              fgColor="currentColor"
              bgColor="transparent"
              title="QR code for your authenticator app"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-sm text-text-secondary">Can’t scan it? Type this key into the app instead.</p>
            <code className="rounded-sm bg-inset px-2 py-1.5 font-mono text-sm tabular break-all text-text">
              {spaced(setup.secret)}
            </code>
            <div>
              <CopyButton value={setup.secret} what="The key" label="Copy key" />
            </div>
          </div>
        </div>
      </SetupStep>

      <SetupStep number={2} title="Enter the code it shows">
        {error.summary ? <FormAlert title={error.summary} /> : null}
        <div className="grid max-w-md gap-3">
          <Field
            label="Six-digit code"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="font-mono tabular"
            placeholder="123456"
            value={form.code}
            error={missing.code ?? error.fields['code']}
            onChange={e => {
              setForm({ ...form, code: e.target.value });
              setMissing(m => ({ ...m, code: undefined }));
            }}
          />
          <Field
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={form.current_password}
            error={missing.current_password ?? error.fields['current_password']}
            onChange={e => {
              setForm({ ...form, current_password: e.target.value });
              setMissing(m => ({ ...m, current_password: undefined }));
            }}
          />
        </div>
        <p className="text-sm text-text-secondary">
          Two-factor is switched on only once a code is accepted, so a mis-scanned QR code cannot lock you out.
        </p>
      </SetupStep>

      <div className="flex gap-2 border-t pt-4">
        <Button type="submit" size="sm" disabled={confirm.isPending}>
          {confirm.isPending ? 'Turning on…' : 'Turn on two-factor'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={confirm.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function SetupStep({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid size-6 flex-none place-items-center rounded-full bg-inset font-mono text-xs text-text-secondary">
        {number}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <h3 className="leading-6 font-medium">{title}</h3>
        {children}
      </div>
    </div>
  );
}

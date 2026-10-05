'use client';

import { useRef, useState } from 'react';
import { Check } from 'lucide-react';
import type { ByoCheckError, Me, StorageConnection, StorageOverview } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { StepUpDialog } from '@components/step-up-dialog';
import { CorsRule, CorsStep, PermissionsStep, ProviderStep } from '@components/organization/storage/byo-steps';
import {
  CheckProgress,
  checksFailedAt,
  checksPassed,
  checksRunning,
  checksWaiting,
  type CheckId,
  type CheckStates,
} from '@components/organization/storage/check-progress';
import { CredentialsForm, validateDraft, type DraftErrors } from '@components/organization/storage/credentials-form';
import { BrowserCheckMismatchError, useBrowserCheck, useConnectStorage } from '@hooks/use-organization-storage';
import { ApiNetworkError, isApiError, type ApiError } from '@lib/api/errors';
import { StorageCheckBlockedError, StorageCheckRefusedError } from '@lib/api/storage';
import { env } from '@lib/env';
import { connectBody, describeCheckError, draftFrom, emptyDraft, type ConnectionDraft } from '@lib/storage/connection';
import { cn } from '@lib/utils';

export const WIZARD_STEPS = [
  { id: 'provider', label: 'Provider' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'cors', label: 'CORS rule' },
  { id: 'credentials', label: 'Key' },
  { id: 'check', label: 'Check' },
  { id: 'connected', label: 'Connected' },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]['id'];

export const isWizardStep = (value: string | null): value is WizardStep => WIZARD_STEPS.some(s => s.id === value);

/** A setup left half-way opens where it stopped: the browser check after a passed server check, the key after a refusal. */
export function entryStep(connection: StorageConnection | null): WizardStep {
  if (!connection) return 'provider';
  if (connection.status === 'verified') return 'connected';
  if (connection.status === 'pending' || connection.last_error?.step === 'browser') return 'check';
  return 'credentials';
}

const failedCheck = (error: ByoCheckError): CheckId =>
  error.step === 'browser' ? 'verify' : error.step === 'connect' ? 'put' : error.step;

function failedCheckOf(code: string): CheckId {
  if (code === 'storage.check_denied_get' || code === 'storage.check_mismatch') return 'get';
  if (code === 'storage.check_denied_delete') return 'delete';
  return 'put';
}

/** A refusal of the bucket check, as opposed to one of the step-up (a wrong password stays in the dialog). */
const isCheckRefusal = (error: unknown): error is ApiError => isApiError(error) && error.code.startsWith('storage.');

const CORS_ADVICE =
  'The server reached the bucket, so the key is fine: the bucket’s CORS rule is missing, or does not allow this app. Paste the rule below into the bucket’s CORS settings, save it, and try again.';

interface Failure {
  message: string;
  cors: boolean;
}

interface ByoWizardProps {
  slug: string;
  overview: StorageOverview;
  user: Me;
  step: WizardStep;
  onStep: (step: WizardStep) => void;
  onClose: () => void;
  onMoveFiles: () => void;
}

export function ByoWizard({ slug, overview, user, step, onStep, onClose, onMoveFiles }: ByoWizardProps) {
  const saved = overview.connection;
  const lastError = saved?.status === 'failed' ? saved.last_error : null;
  const [draft, setDraft] = useState<ConnectionDraft>(() => (saved ? draftFrom(saved) : emptyDraft()));
  const [errors, setErrors] = useState<DraftErrors>(() => {
    if (!saved || !lastError || lastError.step === 'browser') return {};
    const { field, message } = describeCheckError(lastError, saved);
    return field ? { [field]: message } : {};
  });
  const [checks, setChecks] = useState<CheckStates>(() =>
    saved?.status === 'pending'
      ? checksRunning('upload')
      : lastError
        ? checksFailedAt(failedCheck(lastError))
        : checksWaiting(),
  );
  const [failure, setFailure] = useState<Failure | null>(() =>
    saved && lastError ? { message: describeCheckError(lastError, saved).message, cors: false } : null,
  );
  const [confirming, setConfirming] = useState(false);
  const connect = useConnectStorage(slug);
  const browser = useBrowserCheck(slug);
  const reached = useRef<CheckId>('upload');

  const pendingCheck = saved?.status === 'pending' && !browser.isPending && checks.upload === 'running';
  const serverFailed = (['put', 'get', 'delete'] as const).some(id => checks[id] === 'failed');
  const running = connect.isPending || browser.isPending;

  const runBrowserCheck = () => {
    setFailure(null);
    reached.current = 'upload';
    setChecks(checksRunning('upload'));
    browser.mutate(
      next => {
        reached.current = next;
        setChecks(checksRunning(next));
      },
      {
        onSuccess: () => {
          setChecks(checksPassed());
          onStep('connected');
        },
        onError: error => {
          if (error instanceof StorageCheckBlockedError) {
            setChecks(checksFailedAt(error.request));
            setFailure({ message: `${error.message} ${CORS_ADVICE}`, cors: true });
            return;
          }
          if (error instanceof StorageCheckRefusedError) {
            setChecks(checksFailedAt(error.request));
            setFailure({
              message: `${error.message} Check that the key still has the permissions from the first step, then try again.`,
              cors: false,
            });
            return;
          }
          if (error instanceof BrowserCheckMismatchError) {
            setChecks(checksFailedAt('download'));
            setFailure({ message: error.message, cors: false });
            return;
          }
          setChecks(checksFailedAt(reached.current));
          setFailure({
            message:
              isApiError(error) || error instanceof ApiNetworkError ? error.message : 'The check did not finish.',
            cors: false,
          });
        },
      },
    );
  };

  const submitKey = () => {
    const found = validateDraft(draft, { rotating: false });
    setErrors(found);
    if (Object.keys(found).length === 0) setConfirming(true);
  };

  const onConfirm = (stepUp: { current_password?: string; code?: string }) => {
    setFailure(null);
    connect.mutate(
      { ...connectBody(draft, env.byoAllowAnyEndpoint), ...stepUp },
      {
        onSuccess: connection => {
          setConfirming(false);
          setDraft(d => ({ ...d, secret_access_key: '' }));
          setErrors({});
          if (connection.status === 'verified') {
            setChecks(checksPassed());
            onStep('connected');
            return;
          }
          onStep('check');
          runBrowserCheck();
        },
        onError: error => {
          if (!isCheckRefusal(error)) return;
          setConfirming(false);
          const at = failedCheckOf(error.code);
          setChecks(checksFailedAt(at));
          setFailure({ message: error.message, cors: false });
          setErrors(error.field ? { [error.field]: error.message } : {});
          onStep('credentials');
        },
      },
    );
  };

  const index = WIZARD_STEPS.findIndex(s => s.id === step);
  const bucket = draft.bucket.trim() || saved?.bucket || 'the bucket';

  return (
    <section aria-label="Connect your own bucket" className="flex flex-col gap-5 rounded-md border">
      <header className="flex items-center gap-4 border-b px-5 py-4 max-sm:px-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-medium">Connect your own bucket</h2>
          <p className="text-sm text-text-secondary">
            Store this organisation’s files in a Cloudflare R2 or AWS S3 bucket of yours. The storage limit lifts the
            moment it is connected.
          </p>
        </div>
        {step === 'connected' ? null : (
          <Button variant="outline" size="sm" className="ml-auto flex-none" onClick={onClose} disabled={running}>
            {saved ? 'Finish later' : 'Cancel'}
          </Button>
        )}
      </header>

      <div className="grid gap-6 px-5 pb-5 max-sm:px-4 md:grid-cols-[176px_minmax(0,1fr)]">
        <StepRail current={index} />

        <div className="flex min-w-0 flex-col gap-5">
          {step === 'provider' ? (
            <ProviderStep value={draft.provider} onChange={provider => setDraft(d => ({ ...d, provider }))} />
          ) : null}

          {step === 'permissions' ? (
            <PermissionsStep
              provider={draft.provider}
              bucket={draft.bucket}
              onBucketChange={b => {
                setDraft(d => ({ ...d, bucket: b }));
                setErrors(e => ({ ...e, bucket: undefined }));
              }}
              bucketError={errors.bucket}
            />
          ) : null}

          {step === 'cors' ? <CorsStep provider={draft.provider} origin={overview.cors_origin} /> : null}

          {step === 'credentials' ? (
            <div className="flex flex-col gap-4">
              {serverFailed && failure ? (
                <div className="flex flex-col gap-3 rounded-md border px-4 py-3">
                  <p className="text-sm font-medium">The check stopped. Nothing was switched over.</p>
                  <CheckProgress states={checks} failure={failure.message} />
                </div>
              ) : (
                <p className="text-sm text-text-secondary">
                  Paste the key you created for {bucket}. It is checked before anything changes: the server writes,
                  reads back and deletes a small test file, then this browser uploads one and opens it again. You
                  confirm with your password first.
                </p>
              )}
              <CredentialsForm
                draft={draft}
                onChange={next => {
                  setDraft(next);
                  setErrors({});
                }}
                errors={errors}
              />
            </div>
          ) : null}

          {step === 'check' ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-text-secondary">
                {running
                  ? `Checking ${bucket}. This takes a few seconds; keep this page open.`
                  : failure
                    ? `${bucket} is not connected yet. Uploads still go to the built-in storage.`
                    : `The server reached ${bucket}. One more check, from this browser, proves the bucket lets the app upload and open files.`}
              </p>
              <CheckProgress states={checks} failure={failure?.message} />
              {failure?.cors ? (
                <div className="flex flex-col gap-3 border-t pt-4">
                  <CorsRule provider={draft.provider} origin={overview.cors_origin} />
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 'connected' ? (
            <ConnectedStep
              bucket={saved?.bucket ?? bucket}
              platformFiles={overview.platform.files}
              onMoveFiles={onMoveFiles}
              onClose={onClose}
            />
          ) : null}

          {step === 'connected' ? null : (
            <WizardFooter
              step={step}
              running={running}
              failed={failure !== null}
              pendingCheck={pendingCheck}
              onBack={() => onStep(WIZARD_STEPS[Math.max(0, index - 1)]!.id)}
              onNext={() => {
                const bucketError =
                  step === 'permissions' ? validateDraft(draft, { rotating: false }).bucket : undefined;
                if (bucketError) return setErrors({ bucket: bucketError });
                if (step === 'credentials') return submitKey();
                onStep(WIZARD_STEPS[index + 1]!.id);
              }}
              onRetry={runBrowserCheck}
              onChangeKey={() => onStep('credentials')}
            />
          )}
        </div>
      </div>

      <StepUpDialog
        open={confirming}
        onOpenChange={next => {
          setConfirming(next);
          if (!next) connect.reset();
        }}
        user={user}
        title={`Connect ${draft.bucket.trim()}?`}
        confirmLabel="Check and connect"
        pendingLabel="Checking the bucket…"
        destructive={false}
        returnTo="/organization?tab=storage&setup=credentials"
        pending={connect.isPending}
        error={isCheckRefusal(connect.error) ? null : connect.error}
        onConfirm={onConfirm}
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            The server writes, reads back and deletes a small test file in {draft.bucket.trim()}; then this browser does
            the same.
          </li>
          <li>
            When both pass, new uploads go to {draft.bucket.trim()} and the storage limit lifts. Every admin of the
            organisation gets an email saying so.
          </li>
          <li>The secret is stored encrypted and never shown again.</li>
        </ul>
      </StepUpDialog>
    </section>
  );
}

function StepRail({ current }: { current: number }) {
  return (
    <ol
      className="flex flex-col gap-0.5 max-md:flex-row max-md:flex-wrap max-md:gap-x-4 max-md:gap-y-1"
      aria-label="Setup steps"
    >
      {WIZARD_STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={s.id}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex h-8 items-center gap-2.5 rounded-sm text-sm md:px-2',
              active ? 'font-medium text-text md:bg-active' : done ? 'text-text' : 'text-text-secondary',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'grid size-5 flex-none place-items-center rounded-full text-2xs font-semibold tabular',
                done && 'bg-ink text-ink-fg',
                active && 'bg-surface text-text ring-[1.5px] ring-text',
                !done && !active && 'bg-inset text-text-secondary',
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            {s.label}
            {done ? <span className="sr-only"> — done</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

interface WizardFooterProps {
  step: WizardStep;
  running: boolean;
  failed: boolean;
  pendingCheck: boolean;
  onBack: () => void;
  onNext: () => void;
  onRetry: () => void;
  onChangeKey: () => void;
}

function WizardFooter({
  step,
  running,
  failed,
  pendingCheck,
  onBack,
  onNext,
  onRetry,
  onChangeKey,
}: WizardFooterProps) {
  if (step === 'check') {
    if (running) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button onClick={onRetry}>
          {failed ? 'Try again' : pendingCheck ? 'Check from this browser' : 'Run the check'}
        </Button>
        <Button variant="outline" onClick={onChangeKey}>
          Change the key
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-4">
      <Button onClick={onNext} disabled={running}>
        {step === 'credentials' ? 'Check the bucket' : 'Continue'}
      </Button>
      {step === 'provider' ? null : (
        <Button variant="outline" onClick={onBack} disabled={running}>
          Back
        </Button>
      )}
    </div>
  );
}

function ConnectedStep({
  bucket,
  platformFiles,
  onMoveFiles,
  onClose,
}: {
  bucket: string;
  platformFiles: number;
  onMoveFiles: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FormAlert tone="success" title="The storage limit is lifted">
        <p>
          <span className="font-mono">{bucket}</span> passed both checks. Every file uploaded from now on is stored
          there, and nothing in it counts against a limit. Every admin has been emailed.
        </p>
      </FormAlert>
      <p className="text-sm text-text-secondary">
        {platformFiles > 0
          ? `The ${platformFiles} ${platformFiles === 1 ? 'file' : 'files'} you already had stay in the built-in storage and keep working. Move them across and each is copied, checked, and only then removed from the built-in storage, so every file keeps opening throughout. You can leave the page while it runs.`
          : 'There were no files in the built-in storage, so there is nothing to move.'}
      </p>
      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        {platformFiles > 0 ? (
          <>
            <Button onClick={onMoveFiles}>Move files</Button>
            <Button variant="outline" onClick={onClose}>
              Not now
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Done</Button>
        )}
      </div>
    </div>
  );
}

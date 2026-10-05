'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatBytes } from '@nothingleft/format';
import type { Me, StorageConnection, StorageOverview } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { PersonName } from '@components/former-member-chip';
import { RelativeTime } from '@components/relative-time';
import { SettingsSection } from '@components/settings/section';
import { StepUpDialog } from '@components/step-up-dialog';
import { PROVIDER_NAMES } from '@components/organization/storage/byo-steps';
import { CredentialsForm, validateDraft, type DraftErrors } from '@components/organization/storage/credentials-form';
import { useConnectStorage, useDisconnectStorage } from '@hooks/use-organization-storage';
import { isApiError } from '@lib/api/errors';
import { formatDate } from '@lib/datetime';
import { env } from '@lib/env';
import { regionName } from '@lib/storage/aws-regions';
import { connectBody, draftFrom, type ConnectionDraft } from '@lib/storage/connection';
import { cn } from '@lib/utils';

const STORAGE_TAB = '/organization?tab=storage';
const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

interface ConnectionPanelProps {
  slug: string;
  overview: StorageOverview;
  connection: StorageConnection;
  user: Me;
  updating: boolean;
  onUpdatingChange: (open: boolean) => void;
  reopenDisconnect: boolean;
  onReopened: () => void;
  timeZone?: string | undefined;
}

/** A bucket that verified once: its details, a new key for it, and disconnecting. */
export function ConnectionPanel({
  slug,
  overview,
  connection,
  user,
  updating,
  onUpdatingChange,
  reopenDisconnect,
  onReopened,
  timeZone,
}: ConnectionPanelProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const failing = connection.status === 'failed';
  const byRegion = connection.provider === 's3' && connection.endpoint.endsWith('.amazonaws.com');
  const location = byRegion ? `${regionName(connection.region)} · ${connection.region}` : connection.endpoint;

  return (
    <SettingsSection
      title="Your own bucket"
      description={
        failing
          ? 'The bucket refused its key. Files there show as unavailable and uploads are paused until a working key for the same bucket is saved.'
          : 'Every new file is stored here, and nothing in it counts against a limit.'
      }
      actions={
        updating ? null : (
          <>
            <Button variant={failing ? 'default' : 'outline'} size="sm" onClick={() => onUpdatingChange(true)}>
              Update key
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-danger-fg hover:text-danger-fg"
              onClick={() => setDisconnecting(true)}
            >
              Disconnect
            </Button>
          </>
        )
      }
    >
      <dl className="grid max-w-3xl gap-x-8 gap-y-0 text-sm sm:grid-cols-2">
        <Row term="Status">
          <span className={cn('inline-flex items-center gap-2', failing ? 'text-danger-fg' : 'text-text')}>
            <span aria-hidden className={cn('size-2 rounded-full', failing ? 'bg-danger-fg' : 'c-green bg-c-solid')} />
            {failing ? 'Refusing its key' : 'Connected'}
          </span>
        </Row>
        <Row term="Provider">{PROVIDER_NAMES[connection.provider]}</Row>
        <Row term="Bucket">
          <span className="font-mono">{connection.bucket}</span>
        </Row>
        <Row term={byRegion ? 'Region' : 'Endpoint'}>
          <span className={cn('truncate', !byRegion && 'font-mono text-xs')} title={location}>
            {location}
          </span>
        </Row>
        <Row term="Access key ID">
          <span className="truncate font-mono text-xs">{connection.access_key_id}</span>
        </Row>
        <Row term="Secret">
          <span className="font-mono text-xs tracking-widest text-text-secondary" aria-label="Hidden">
            {connection.secret}
          </span>
        </Row>
        <Row term="Connected">
          {connection.verified_at ? (
            <span className="flex min-w-0 items-center gap-1.5">
              {formatDate(connection.verified_at, timeZone)}
              <span className="text-text-secondary">by</span>
              <PersonName person={connection.created_by} />
            </span>
          ) : (
            '--'
          )}
        </Row>
        <Row term="Last checked">
          {connection.checked_at ? (
            <RelativeTime value={connection.checked_at} timeZone={timeZone} className="text-text" />
          ) : (
            '--'
          )}
        </Row>
      </dl>

      {updating ? (
        <UpdateKeyForm slug={slug} connection={connection} user={user} onDone={() => onUpdatingChange(false)} />
      ) : null}

      <DisconnectDialog
        slug={slug}
        overview={overview}
        connection={connection}
        user={user}
        open={disconnecting || reopenDisconnect}
        onOpenChange={next => {
          setDisconnecting(next);
          if (!next) onReopened();
        }}
      />
    </SettingsSection>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 border-b border-border-subtle py-2">
      <dt className="flex-none text-text-secondary">{term}</dt>
      <dd className="flex min-w-0 justify-end text-right">{children}</dd>
    </div>
  );
}

function UpdateKeyForm({
  slug,
  connection,
  user,
  onDone,
}: {
  slug: string;
  connection: StorageConnection;
  user: Me;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<ConnectionDraft>(() => draftFrom(connection));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const rotate = useConnectStorage(slug);
  const checkRefusal = isApiError(rotate.error) && rotate.error.code.startsWith('storage.');

  return (
    <form
      noValidate
      className="flex flex-col gap-4 rounded-md border px-4 py-4"
      onSubmit={event => {
        event.preventDefault();
        const found = validateDraft(draft, { rotating: true });
        setErrors(found);
        if (Object.keys(found).length === 0) setConfirming(true);
      }}
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="font-medium">Update the key</h3>
        <p className="text-sm text-text-secondary">
          A new key for {connection.bucket}, with the same permissions. It is checked with a test file before it
          replaces the old one, so a typo changes nothing. Changing to a different bucket means disconnecting first.
        </p>
      </div>
      {refusal ? (
        <FormAlert title="The new key was refused. Nothing changed.">
          <p>{refusal}</p>
        </FormAlert>
      ) : null}
      <CredentialsForm
        draft={draft}
        onChange={next => {
          setDraft(next);
          setErrors({});
        }}
        errors={errors}
        rotating
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm">
          Check and save
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>

      <StepUpDialog
        open={confirming}
        onOpenChange={next => {
          setConfirming(next);
          if (!next) rotate.reset();
        }}
        user={user}
        title={`Update the key for ${connection.bucket}?`}
        confirmLabel="Check and save"
        pendingLabel="Checking the key…"
        destructive={false}
        returnTo={`${STORAGE_TAB}&setup=update`}
        pending={rotate.isPending}
        error={checkRefusal ? null : rotate.error}
        onConfirm={stepUp =>
          rotate.mutate(
            { ...connectBody(draft, env.byoAllowAnyEndpoint), ...stepUp },
            {
              onSuccess: () => {
                setConfirming(false);
                onDone();
                toast.success(`New key saved for ${connection.bucket}.`);
              },
              onError: error => {
                if (!isApiError(error) || !error.code.startsWith('storage.')) return;
                setConfirming(false);
                setDraft(d => ({ ...d, secret_access_key: '' }));
                setRefusal(error.message);
                if (error.field) setErrors({ [error.field]: error.message });
              },
            },
          )
        }
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>The server writes, reads back and deletes a small test file in {connection.bucket} with the new key.</li>
          <li>If that passes, the new key replaces the old one at once. If it fails, nothing changes.</li>
        </ul>
      </StepUpDialog>
    </form>
  );
}

interface DisconnectDialogProps {
  slug: string;
  overview: StorageOverview;
  connection: StorageConnection;
  user: Me;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DisconnectDialog({ slug, overview, connection, user, open, onOpenChange }: DisconnectDialogProps) {
  const disconnect = useDisconnectStorage(slug);
  const { bucket } = connection;
  const held = overview.bring_your_own;
  const everVerified = connection.verified_at !== null;

  return (
    <StepUpDialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) disconnect.reset();
      }}
      user={user}
      title={everVerified ? `Disconnect ${bucket}?` : `Discard the setup of ${bucket}?`}
      confirmLabel={everVerified ? 'Disconnect' : 'Discard'}
      pendingLabel={everVerified ? 'Disconnecting…' : 'Discarding…'}
      returnTo={`${STORAGE_TAB}&confirm=disconnect`}
      pending={disconnect.isPending}
      error={disconnect.error}
      onConfirm={body =>
        disconnect.mutate(body, {
          onSuccess: () => {
            onOpenChange(false);
            toast.success(everVerified ? `${bucket} disconnected.` : `Setup of ${bucket} discarded.`);
          },
        })
      }
    >
      {everVerified ? (
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>The key is forgotten.</li>
          <li>
            <span className="font-medium text-text">Your files stay in {bucket}</span> — nothing there is deleted — but{' '}
            {held.files > 0 ? `its ${files(held.files)} (${formatBytes(held.bytes)})` : 'they'} no longer open here.
            They are listed as files in an earlier bucket.
          </li>
          <li>
            <span className="font-medium text-text">
              Connect the same bucket again — same account or region, same name — and they open again.
            </span>{' '}
            A bucket with the same name in a different account is a different bucket: connecting it does not bring the
            earlier files back.
          </li>
          <li>
            New uploads use the built-in storage, and the {formatBytes(overview.platform.limit_bytes)} limit applies
            again. {formatBytes(overview.platform.bytes)} is in it now.
          </li>
          <li>Every admin of the organisation gets an email saying so.</li>
        </ul>
      ) : (
        <p>
          The key is forgotten. Nothing was ever stored in {bucket}, and uploads keep using the built-in storage. You
          can start again at any time.
        </p>
      )}
    </StepUpDialog>
  );
}

export function EarlierBuckets({ buckets }: { buckets: StorageOverview['earlier_buckets'] }) {
  if (buckets.length === 0) return null;
  return (
    <ul className="flex flex-col divide-y divide-border-subtle rounded-md border" aria-label="Earlier buckets">
      {buckets.map(b => (
        <li key={b.bucket} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3.5 py-2.5 text-sm">
          <span className="text-text">
            {files(b.files)} in <span className="font-mono">{b.bucket}</span> from an earlier connection
          </span>
          <span className="text-text-secondary">— connect it again to open them.</span>
          <span className="ml-auto font-mono text-xs tabular text-text-secondary">{formatBytes(b.bytes)}</span>
        </li>
      ))}
    </ul>
  );
}

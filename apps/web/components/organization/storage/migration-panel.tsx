'use client';

import { formatBytes } from '@nothingleft/format';
import { BYO_MIGRATION_STALL_MINUTES, type StorageOverview } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Meter } from '@components/dashboard/meter';
import { FormAlert } from '@components/auth/form-alert';
import { RelativeTime } from '@components/relative-time';
import { SettingsSection } from '@components/settings/section';
import { useStartMigration } from '@hooks/use-organization-storage';
import { describeCheckError } from '@lib/storage/connection';
import { toastError } from '@components/toast-error';
import { PendingButton } from '@components/pending-button';
import { plural } from '@lib/numbers';

const count = (n: number) => `${plural(n, 'file')}`;

export function MigrationPanel({ slug, overview }: { slug: string; overview: StorageOverview }) {
  const connection = overview.connection;
  const start = useStartMigration(slug);
  if (!connection) return null;
  const { migration } = connection;
  const verified = connection.status === 'verified';
  const left = overview.platform;
  const move = () =>
    start.mutate(undefined, { onError: error => toastError('Could not start moving the files', error) });

  const running = migration.state === 'running';
  const title = running ? `Moving files to ${connection.bucket}` : 'Move existing files';

  return (
    <SettingsSection
      title={title}
      description={
        running
          ? 'Each file is copied, checked, and only then removed from the built-in storage, so every file keeps opening throughout. You can leave this page; it carries on.'
          : 'New files already go to your bucket. Files uploaded before it was connected stay in the built-in storage until they are moved.'
      }
    >
      {running || migration.state === 'failed' || (migration.state === 'done' && migration.total_files > 0) ? (
        <Progress
          files={[migration.migrated_files, migration.total_files]}
          bytes={[migration.migrated_bytes, migration.total_bytes]}
          done={migration.state === 'done'}
        />
      ) : null}

      {running && migration.stalled ? (
        <FormAlert
          tone="warning"
          title={`Nothing has moved for ${BYO_MIGRATION_STALL_MINUTES} minutes.`}
          action={
            verified ? (
              <Button type="button" variant="outline" size="sm" onClick={move} disabled={start.isPending}>
                Retry
              </Button>
            ) : undefined
          }
        >
          <p>The files moved so far are safe, and every file keeps opening. Retry to carry on from where it stopped.</p>
        </FormAlert>
      ) : null}

      {migration.state === 'failed' ? (
        <FormAlert
          title={`The move stopped after ${count(migration.migrated_files)} of ${migration.total_files}.`}
          action={
            verified ? (
              <Button type="button" variant="outline" size="sm" onClick={move} disabled={start.isPending}>
                Retry
              </Button>
            ) : undefined
          }
        >
          <p>
            {migration.error ? describeCheckError(migration.error, connection).message : 'The bucket refused a file.'}{' '}
            Every file keeps opening from wherever it is now.
          </p>
          {verified ? null : <p>Update the key first; Retry carries on from where it stopped.</p>}
        </FormAlert>
      ) : null}

      {migration.state === 'done' && migration.finished_at ? (
        <p className="text-sm text-text-secondary">
          Moved {count(migration.migrated_files)} ({formatBytes(migration.migrated_bytes)}){' '}
          <RelativeTime value={migration.finished_at} className="text-text-secondary" />.
        </p>
      ) : null}

      {!running && migration.state !== 'failed' ? (
        left.files > 0 ? (
          <div className="flex flex-wrap items-center gap-3">
            <PendingButton
              size="sm"
              onClick={move}
              disabled={!verified}
              pending={start.isPending}
              pendingLabel="Starting…"
            >
              Move files
            </PendingButton>
            <span className="text-sm text-text-secondary">
              {count(left.files)} ({formatBytes(left.bytes)}) still in the built-in storage
              {verified ? '.' : ' — update the key first.'}
            </span>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">Every file is in {connection.bucket}. Nothing is left to move.</p>
        )
      ) : null}
    </SettingsSection>
  );
}

function Progress({ files, bytes, done }: { files: [number, number]; bytes: [number, number]; done: boolean }) {
  const ratio = bytes[1] > 0 ? bytes[0] / bytes[1] : files[1] > 0 ? files[0] / files[1] : done ? 1 : 0;
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      <Meter ratio={ratio} label="Files moved" className="h-1.5" />
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 font-mono text-xs tabular text-text-secondary">
        <span>
          <span className="text-text">{files[0]}</span> of {files[1]} files
        </span>
        <span>
          <span className="text-text">{formatBytes(bytes[0])}</span> of {formatBytes(bytes[1])}
        </span>
      </div>
    </div>
  );
}

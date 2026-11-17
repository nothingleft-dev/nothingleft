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

/** `quiet` while the key form above is open, so the page has one primary action. */
export function MigrationPanel({
  slug,
  overview,
  quiet = false,
}: {
  slug: string;
  overview: StorageOverview;
  quiet?: boolean;
}) {
  const connection = overview.connection;
  const start = useStartMigration(slug);
  if (!connection) return null;
  const { migration } = connection;
  const verified = connection.status === 'verified';
  const left = overview.platform;
  const move = () =>
    start.mutate(undefined, { onError: error => toastError('Could not start moving the files', error) });

  const running = migration.state === 'running';
  const failed = migration.state === 'failed';
  const description = running
    ? `Copying each file to ${connection.bucket}, then removing it here. You can leave this page.`
    : left.files > 0
      ? `${count(left.files)} (${formatBytes(left.bytes)}) still in the built-in storage.${verified ? '' : ' Update the key first.'}`
      : `Every file is in ${connection.bucket}. Nothing is left to move.`;

  return (
    <SettingsSection
      title="Move existing files"
      description={description}
      actions={
        !running && !failed && left.files > 0 ? (
          <PendingButton
            size="sm"
            variant={quiet ? 'outline' : 'default'}
            onClick={move}
            disabled={!verified}
            pending={start.isPending}
            pendingLabel="Starting…"
          >
            Move files
          </PendingButton>
        ) : undefined
      }
    >
      {running || failed || (migration.state === 'done' && migration.total_files > 0) ? (
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
                Try again
              </Button>
            ) : undefined
          }
        >
          <p>
            The files moved so far are safe, and every file keeps opening. Try again to carry on from where it stopped.
          </p>
        </FormAlert>
      ) : null}

      {failed ? (
        <FormAlert
          title={`The move stopped after ${count(migration.migrated_files)} of ${migration.total_files}.`}
          action={
            verified ? (
              <Button type="button" variant="outline" size="sm" onClick={move} disabled={start.isPending}>
                Try again
              </Button>
            ) : undefined
          }
        >
          <p>
            {migration.error ? describeCheckError(migration.error, connection).message : 'The bucket refused a file.'}{' '}
            Every file keeps opening from wherever it is now.
          </p>
          {verified ? null : <p>Update the key first. The move then carries on from where it stopped.</p>}
        </FormAlert>
      ) : null}

      {migration.state === 'done' && migration.finished_at ? (
        <p className="text-sm text-text-secondary">
          Moved {count(migration.migrated_files)} ({formatBytes(migration.migrated_bytes)}){' '}
          <RelativeTime value={migration.finished_at} className="text-text-secondary" />.
        </p>
      ) : null}
    </SettingsSection>
  );
}

function Progress({ files, bytes, done }: { files: [number, number]; bytes: [number, number]; done: boolean }) {
  const ratio = bytes[1] > 0 ? bytes[0] / bytes[1] : files[1] > 0 ? files[0] / files[1] : done ? 1 : 0;
  return (
    <div className="flex flex-col gap-2">
      <Meter ratio={ratio} label="Files moved" className="h-1.5" />
      <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 text-xs tabular text-text-secondary">
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

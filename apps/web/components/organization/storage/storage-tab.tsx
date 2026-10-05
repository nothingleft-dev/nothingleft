'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { Route } from 'next';
import { HardDrive } from 'lucide-react';
import { toast } from 'sonner';
import type { Me, Organization, StorageOverview } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FormAlert } from '@components/auth/form-alert';
import { SettingsSection } from '@components/settings/section';
import { ByoFailingBanner } from '@components/attachments/byo-failing-banner';
import { ByoWizard, entryStep, isWizardStep, type WizardStep } from '@components/organization/storage/byo-wizard';
import { ConnectionPanel, DisconnectDialog, EarlierBuckets } from '@components/organization/storage/connection-panel';
import { MigrationPanel } from '@components/organization/storage/migration-panel';
import { FilesSkeleton, StorageFiles, type FilesFilter } from '@components/organization/storage/storage-files';
import { StorageUsage, StorageUsageSkeleton } from '@components/organization/storage/storage-usage';
import { useStartMigration, useStorageOverview } from '@hooks/use-organization-storage';
import { queryKeys } from '@lib/query/keys';

/** Org Admins and the Owner only: the tab is not offered to anyone else, and the API refuses them too. */
export function StorageTab({ organization, user }: { organization: Organization; user: Me }) {
  const router = useRouter();
  const params = useSearchParams();
  const slug = organization.slug;
  const overview = useStorageOverview(slug);
  const migrate = useStartMigration(slug);
  const client = useQueryClient();
  // Each moved file changes bucket, so the list redraws as the move goes and once it ends.
  const migration = overview.data?.connection?.migration;
  const moved = useRef(migration?.migrated_files);
  useEffect(() => {
    if (migration === undefined || moved.current === migration.migrated_files) return;
    moved.current = migration.migrated_files;
    void client.invalidateQueries({ queryKey: queryKeys.storageFiles(slug).slice(0, 4) });
  }, [client, slug, migration]);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    next.set('tab', 'storage');
    router.replace(`/organization?${next.toString()}` as Route, { scroll: false });
  };

  const sort = params.get('sort') === 'created' ? 'created' : 'size';
  const where = params.get('where');
  const filter: FilesFilter = {
    sort,
    target: where === 'platform' || where === 'byo' ? where : null,
    project: params.get('project') || null,
    offset: Math.max(0, Number(params.get('offset')) || 0),
  };
  const onFilterChange = (next: FilesFilter) =>
    setParams({
      sort: next.sort === 'size' ? null : next.sort,
      where: next.target,
      project: next.project,
      offset: next.offset === 0 ? null : String(next.offset),
    });

  if (overview.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <StorageUsageSkeleton />
        <FilesSkeleton />
      </div>
    );
  }
  if (overview.isError) {
    return (
      <FormAlert title="Storage usage could not be loaded.">
        <p>{overview.error.message}</p>
        <p>
          <button type="button" onClick={() => void overview.refetch()}>
            Try again
          </button>
        </p>
      </FormAlert>
    );
  }

  const data = overview.data;
  const connection = data.connection;
  const setup = params.get('setup');
  const mode = modeOf(data, setup);
  const wizardOpen = mode.kind === 'wizard';

  return (
    <div className="flex flex-col gap-6">
      {mode.kind === 'connected' ? (
        <ByoFailingBanner
          storage={organization.storage}
          bucket={connection?.bucket}
          canFix
          withAction={!mode.updating}
        />
      ) : null}
      <StorageUsage overview={data} />

      {mode.kind === 'wizard' ? (
        <ByoWizard
          slug={slug}
          overview={data}
          user={user}
          step={mode.step}
          onStep={step => setParams({ setup: step })}
          onClose={() => setParams({ setup: null })}
          onMoveFiles={() => {
            setParams({ setup: null });
            migrate.mutate(undefined, {
              onError: error => toast.error(`The files did not start moving. ${error.message}`),
            });
          }}
        />
      ) : mode.kind === 'connected' && connection ? (
        <>
          <ConnectionPanel
            slug={slug}
            overview={data}
            connection={connection}
            user={user}
            updating={mode.updating}
            onUpdatingChange={open => setParams({ setup: open ? 'update' : null })}
            reopenDisconnect={params.get('confirm') === 'disconnect'}
            onReopened={() => setParams({ confirm: null })}
            timeZone={user.timezone}
          />
          <MigrationPanel slug={slug} overview={data} />
        </>
      ) : mode.kind === 'unfinished' && connection ? (
        <SettingsSection
          title="Setup not finished"
          description={
            connection.status === 'pending'
              ? `The server reached ${connection.bucket}; the check from the browser has not passed yet. Uploads still go to the built-in storage.`
              : `${connection.bucket} refused the check, so nothing was switched over. Uploads still go to the built-in storage.`
          }
          actions={
            <>
              <Button size="sm" onClick={() => setParams({ setup: entryStep(connection) })}>
                Continue setup
              </Button>
              <Button variant="outline" size="sm" onClick={() => setParams({ confirm: 'disconnect' })}>
                Discard
              </Button>
            </>
          }
        >
          <EarlierBuckets buckets={data.earlier_buckets} />
          <DisconnectDialog
            slug={slug}
            overview={data}
            connection={connection}
            user={user}
            open={params.get('confirm') === 'disconnect'}
            onOpenChange={open => setParams({ confirm: open ? 'disconnect' : null })}
          />
        </SettingsSection>
      ) : (
        <SettingsSection
          title="Bring your own bucket"
          description="Store this organisation’s files in a Cloudflare R2 or AWS S3 bucket of yours instead: in your account, on your bill, with no storage limit. Setup takes a few minutes."
          actions={
            <Button size="sm" onClick={() => setParams({ setup: 'provider' })}>
              <HardDrive /> Connect your own bucket
            </Button>
          }
        >
          <EarlierBuckets buckets={data.earlier_buckets} />
        </SettingsSection>
      )}

      {mode.kind === 'connected' ? <EarlierBuckets buckets={data.earlier_buckets} /> : null}

      {wizardOpen ? null : (
        <StorageFiles
          slug={slug}
          filter={filter}
          onFilterChange={onFilterChange}
          byo={organization.storage.bring_your_own}
          bucket={connection?.bucket ?? null}
          timeZone={user.timezone}
        />
      )}
    </div>
  );
}

type Mode =
  | { kind: 'wizard'; step: WizardStep }
  | { kind: 'connected'; updating: boolean }
  | { kind: 'unfinished' }
  | { kind: 'none' };

/** What the bucket section shows, from the saved connection and the address (`?setup=` keeps the wizard re-enterable). */
function modeOf({ connection }: StorageOverview, setup: string | null): Mode {
  const verifiedOnce = connection !== null && connection.verified_at !== null;
  if (verifiedOnce) {
    // Just verified: the wizard's last step stays up until it is dismissed.
    if (setup === 'connected' && connection.status === 'verified') return { kind: 'wizard', step: 'connected' };
    return { kind: 'connected', updating: setup === 'update' };
  }
  if (setup !== null) {
    const requested = isWizardStep(setup) ? setup : entryStep(connection);
    // The check needs a saved connection, and the last step a verified one; otherwise the wizard opens where the setup stands.
    const step =
      (requested === 'check' && !connection) || requested === 'connected' ? entryStep(connection) : requested;
    return { kind: 'wizard', step };
  }
  return connection ? { kind: 'unfinished' } : { kind: 'none' };
}

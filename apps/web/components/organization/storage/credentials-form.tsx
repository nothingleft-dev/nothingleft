'use client';

import { useId, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { BucketNameSchema, ConnectStorageSchema, type R2Jurisdiction } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { ChoiceSelect, type ChoiceOption } from '@components/choice-select';
import { Field } from '@components/auth/field';
import { PROVIDER_NAMES } from '@components/organization/storage/byo-steps';
import { env } from '@lib/env';
import { AWS_REGIONS, regionName } from '@lib/storage/aws-regions';
import type { ConnectionDraft } from '@lib/storage/connection';
import { cn } from '@lib/utils';

export type DraftField = 'account_id' | 'region' | 'bucket' | 'access_key_id' | 'secret_access_key' | 'endpoint';
export type DraftErrors = Partial<Record<DraftField, string>>;

const JURISDICTIONS: readonly ChoiceOption<R2Jurisdiction>[] = [
  { value: 'default', label: 'Default', hint: 'Most buckets. The bucket page shows no jurisdiction.' },
  { value: 'eu', label: 'European Union', hint: 'A bucket created with the EU jurisdiction.' },
  { value: 'fedramp', label: 'FedRAMP', hint: 'A bucket in the FedRAMP jurisdiction.' },
];

const shape = ConnectStorageSchema.shape;

/** What is missing or malformed before anything is sent; the server's check covers everything else. */
export function validateDraft(draft: ConnectionDraft, { rotating }: { rotating: boolean }): DraftErrors {
  const errors: DraftErrors = {};
  const customEndpoint = env.byoAllowAnyEndpoint && draft.endpoint.trim() !== '';
  if (!rotating && !customEndpoint) {
    if (draft.provider === 'r2' && !shape.account_id.safeParse(draft.account_id.trim().toLowerCase()).success) {
      errors.account_id = 'Paste the 32-character account ID from the R2 overview page in the Cloudflare dashboard.';
    }
    if (draft.provider === 's3' && !shape.region.safeParse(draft.region).success) {
      errors.region = 'Choose the region the bucket was created in.';
    }
  }
  if (customEndpoint && !shape.endpoint.safeParse(draft.endpoint.trim()).success) {
    errors.endpoint = 'Enter a full URL, such as http://localhost:9000.';
  }
  if (!BucketNameSchema.safeParse(draft.bucket.trim()).success) {
    errors.bucket =
      'Bucket names are 3 to 63 lowercase letters, digits, dots and hyphens, starting and ending with a letter or digit.';
  }
  if (draft.access_key_id.trim() === '') errors.access_key_id = 'Paste the access key ID.';
  if (draft.secret_access_key === '') errors.secret_access_key = 'Paste the secret access key.';
  return errors;
}

interface CredentialsFormProps {
  draft: ConnectionDraft;
  onChange: (next: ConnectionDraft) => void;
  errors: DraftErrors;
  /** Rotating the key of a connected bucket: provider, location and bucket stay as they are. */
  rotating?: boolean;
}

export function CredentialsForm({ draft, onChange, errors, rotating = false }: CredentialsFormProps) {
  const set = (patch: Partial<ConnectionDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
      {rotating ? (
        <Fixed label="Provider" value={PROVIDER_NAMES[draft.provider]} />
      ) : draft.provider === 'r2' ? (
        <>
          <Field
            label="Account ID"
            value={draft.account_id}
            onChange={e => set({ account_id: e.target.value })}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            placeholder="32 characters"
            hint="On the R2 overview page of the Cloudflare dashboard."
            error={errors.account_id}
          />
          <ChoiceSelect
            label="Jurisdiction"
            value={draft.jurisdiction}
            options={JURISDICTIONS}
            onChange={jurisdiction => set({ jurisdiction })}
            showHint
          />
        </>
      ) : (
        <RegionPicker value={draft.region} onChange={region => set({ region })} error={errors.region} />
      )}

      {rotating ? (
        draft.endpoint ? (
          <Fixed label="Endpoint" value={draft.endpoint} mono />
        ) : draft.provider === 's3' ? (
          <Fixed label="Region" value={`${regionName(draft.region)} · ${draft.region}`} />
        ) : (
          <Fixed label="Account ID" value={draft.account_id} mono />
        )
      ) : null}

      {env.byoAllowAnyEndpoint && !rotating ? (
        <div className="sm:col-span-2">
          <Field
            label="Endpoint (development only)"
            value={draft.endpoint}
            onChange={e => set({ endpoint: e.target.value })}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            placeholder="http://localhost:9000"
            hint="This build lets the server reach a bucket at any address. Leave it empty to use the account ID or region."
            error={errors.endpoint}
          />
        </div>
      ) : null}

      <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
        {rotating ? (
          <Fixed label="Bucket" value={draft.bucket} mono />
        ) : (
          <Field
            label="Bucket name"
            value={draft.bucket}
            onChange={e => set({ bucket: e.target.value })}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="font-mono"
            error={errors.bucket}
          />
        )}
      </div>

      <Field
        label="Access key ID"
        value={draft.access_key_id}
        onChange={e => set({ access_key_id: e.target.value })}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className="font-mono"
        hint={rotating ? 'A new key for the same bucket, with the same permissions.' : undefined}
        error={errors.access_key_id}
      />
      <Field
        label="Secret access key"
        type="password"
        value={draft.secret_access_key}
        onChange={e => set({ secret_access_key: e.target.value })}
        autoComplete="new-password"
        spellCheck={false}
        className="font-mono"
        hint="Stored encrypted and never shown again, to anyone."
        error={errors.secret_access_key}
      />
    </div>
  );
}

function Fixed({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-secondary">{label}</span>
      <span
        className={cn(
          'flex h-control items-center truncate rounded-md border bg-inset px-3 text-sm text-text-secondary',
          mono && 'font-mono',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function RegionPicker({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-medium text-text-secondary">
        Region
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={`${id}-label`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className={cn('h-control justify-between font-normal', error && 'border-danger-fg hover:border-danger-fg')}
          >
            {value ? (
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="truncate">{regionName(value)}</span>
                <span className="font-mono text-xs text-text-muted">{value}</span>
              </span>
            ) : (
              <span className="text-text-muted">Choose a region</span>
            )}
            <ChevronsUpDown className="size-icon-sm shrink-0 text-text-muted" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-72 max-w-[calc(100vw-32px)] p-0"
        >
          <Command>
            <CommandInput placeholder="Search regions…" />
            <CommandList className="max-h-[min(50vh,320px)]">
              <CommandEmpty>No region matches.</CommandEmpty>
              {AWS_REGIONS.map(r => (
                <CommandItem
                  key={r.code}
                  value={`${r.name} ${r.code}`}
                  onSelect={() => {
                    onChange(r.code);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('size-icon-sm', r.code === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="font-mono text-2xs text-text-muted">{r.code}</span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : (
        <p className="text-sm text-text-secondary">Where the bucket was created, as the S3 console shows it.</p>
      )}
    </div>
  );
}

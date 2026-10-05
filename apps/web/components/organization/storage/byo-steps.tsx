'use client';

import type { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { BucketNameSchema, byoAccessPolicy, byoCorsRules, type ByoProvider } from '@nothingleft/types';
import { CopyButton } from '@components/copy-button';
import { Field } from '@components/auth/field';
import { cn } from '@lib/utils';

export const PROVIDER_NAMES: Record<ByoProvider, string> = { r2: 'Cloudflare R2', s3: 'AWS S3' };

const PROVIDERS: readonly { value: ByoProvider; line: string }[] = [
  { value: 'r2', line: 'An R2 bucket in your Cloudflare account, reached with an API token limited to it.' },
  { value: 's3', line: 'An S3 bucket in your AWS account, reached with the key of an IAM user limited to it.' },
];

export function ProviderStep({ value, onChange }: { value: ByoProvider; onChange: (next: ByoProvider) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-secondary">
        Where the bucket is. Files uploaded from then on are stored there, in your account and on your bill, and the
        storage limit no longer applies. Avatars stay in the built-in storage.
      </p>
      <div role="radiogroup" aria-label="Storage provider" className="grid gap-2 sm:grid-cols-2">
        {PROVIDERS.map(p => {
          const selected = p.value === value;
          return (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(p.value)}
              className={cn(
                'flex items-start gap-3 rounded-md border px-3.5 py-3 text-left transition-colors hover:border-border-strong hover:bg-hover',
                selected && 'border-text bg-hover hover:border-text',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 grid size-4 flex-none place-items-center rounded-full border border-border-strong',
                  selected && 'border-text',
                )}
              >
                {selected ? <span className="size-2 rounded-full bg-text" /> : null}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{PROVIDER_NAMES[p.value]}</span>
                <span className="text-xs leading-5 text-text-secondary">{p.line}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CodeBlock({ value, what, label }: { value: string; what: string; label: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-text-secondary">{label}</span>
        <CopyButton value={value} what={what} />
      </div>
      <pre
        aria-label={label}
        tabIndex={0}
        className="max-h-[30rem] overflow-auto rounded-md border bg-inset px-3.5 py-3 font-mono text-xs leading-5 text-text [font-variant-ligatures:none]"
      >
        {value}
      </pre>
    </div>
  );
}

const json = (value: unknown) => JSON.stringify(value, null, 2);

/** The one warning the setup screen carries in bold: a key that can only touch one bucket can only ever lose one bucket. */
function LeastPrivilege({ children }: { children: ReactNode }) {
  return (
    <div
      role="note"
      className="flex gap-2.5 rounded-md border border-warning-fg/30 bg-warning-bg px-3.5 py-3 text-warning-fg"
    >
      <ShieldAlert className="mt-0.5 size-icon flex-none" aria-hidden />
      <div className="flex flex-col gap-1 text-sm leading-5">
        <p className="font-semibold">Grant only these permissions. Never full S3 access.</p>
        <p>{children}</p>
      </div>
    </div>
  );
}

interface PermissionsStepProps {
  provider: ByoProvider;
  bucket: string;
  onBucketChange: (bucket: string) => void;
  bucketError?: string | undefined;
}

export function PermissionsStep({ provider, bucket, onBucketChange, bucketError }: PermissionsStepProps) {
  const name = bucket.trim();
  const valid = BucketNameSchema.safeParse(name).success;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        The key needs to write, read and delete files in one bucket, and nothing else.{' '}
        {provider === 's3'
          ? 'Create a new IAM user just for this, attach the policy below to it, and create an access key for that user.'
          : 'Create a new API token just for this, and paste its key in a later step.'}
      </p>

      <div className="max-w-sm">
        <Field
          label="Bucket name"
          value={bucket}
          onChange={e => onBucketChange(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="font-mono"
          placeholder={provider === 's3' ? 'acme-nothing-left' : 'acme-files'}
          hint={
            provider === 's3'
              ? 'The policy below fills in as you type. Create the bucket first if it does not exist yet.'
              : 'The bucket the token will be limited to. Create it first if it does not exist yet.'
          }
          error={bucketError}
        />
      </div>

      {provider === 's3' ? (
        <>
          <CodeBlock
            label="IAM policy"
            what="The policy"
            value={json(byoAccessPolicy(valid ? name : '<bucket-name>'))}
          />
          <p className="text-xs leading-5 text-text-secondary">
            <span className="font-medium text-text">s3:PutObject</span>,{' '}
            <span className="font-medium text-text">s3:GetObject</span> and{' '}
            <span className="font-medium text-text">s3:DeleteObject</span> on the bucket’s objects, and{' '}
            <span className="font-medium text-text">s3:ListBucket</span> on the bucket itself, so that a missing file
            reads as missing rather than forbidden. In the AWS console: IAM → Users → Create user, then Add permissions
            → Create inline policy → JSON.
          </p>
          <LeastPrivilege>
            Create a dedicated IAM user for Nothing Left and attach only this policy. The key is stored encrypted and
            never shown again, but a key that can only touch one bucket is one that can only ever lose one bucket.
          </LeastPrivilege>
        </>
      ) : (
        <>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-6 text-text-secondary">
            <li>In the Cloudflare dashboard, open R2 → Manage API tokens → Create API token.</li>
            <li>
              Under Permissions choose <span className="font-medium text-text">Object Read &amp; Write</span>.
            </li>
            <li>
              Under Specify buckets choose <span className="font-medium text-text">Apply to specific buckets only</span>{' '}
              and pick {valid ? <span className="font-mono text-text">{name}</span> : 'the bucket'} — no other bucket.
            </li>
            <li>Create the token and keep the page open: its secret is shown only once.</li>
          </ol>
          <LeastPrivilege>
            Create a dedicated token for Nothing Left, limited to this one bucket — never a token for your whole account
            or with Admin permissions. The key is stored encrypted and never shown again, but a key that can only touch
            one bucket is one that can only ever lose one bucket.
          </LeastPrivilege>
        </>
      )}
    </div>
  );
}

export function CorsRule({ provider, origin }: { provider: ByoProvider; origin: string }) {
  return (
    <div className="flex flex-col gap-3">
      <CodeBlock label="CORS rule" what="The CORS rule" value={json(byoCorsRules(origin))} />
      <p className="text-xs leading-5 text-text-secondary">
        {provider === 's3'
          ? 'In the AWS console: S3 → your bucket → Permissions → Cross-origin resource sharing (CORS) → Edit, then paste it and save.'
          : 'In the Cloudflare dashboard: R2 → your bucket → Settings → CORS policy → Add CORS policy, then paste it and save.'}{' '}
        It allows uploads and downloads from <span className="font-mono text-text">{origin}</span> only.
      </p>
    </div>
  );
}

export function CorsStep({ provider, origin }: { provider: ByoProvider; origin: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        Browsers upload and open files straight from the bucket, so it has to let this app reach it. Without this rule
        the key can be perfect and every upload still fails.
      </p>
      <CorsRule provider={provider} origin={origin} />
    </div>
  );
}

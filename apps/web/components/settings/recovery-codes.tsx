'use client';

import { Download, TriangleAlert } from 'lucide-react';
import type { TwoFactorRecoveryCodes } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { CopyButton } from '@components/copy-button';
import { formatDate } from '@lib/datetime';
import { saveDownload } from '@lib/files';

interface RecoveryCodesProps {
  email: string;
  codes: TwoFactorRecoveryCodes;
  onDone: () => void;
}

/** Shown once: only hashes are stored, so leaving this screen is the last chance to see them. */
export function RecoveryCodes({ email, codes, onDone }: RecoveryCodesProps) {
  const text = codes.recovery_codes.join('\n');
  const file = [
    `Nothing Left recovery codes for ${email}`,
    `Created ${formatDate(codes.enabled_at)}. Each code signs in once.`,
    '',
    text,
    '',
  ].join('\n');

  return (
    <div className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex items-start gap-2.5 rounded-md border border-warning-fg/25 bg-warning-bg px-3 py-2.5 text-warning-fg">
        <TriangleAlert className="mt-0.5 size-icon-sm flex-none" />
        <p className="text-xs leading-5">
          Save these ten recovery codes now - they are not shown again. Each one signs you in once if you lose your
          phone, and there is no support desk that can let you back in without them.
        </p>
      </div>

      <ol className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-md bg-inset px-4 py-3 font-mono text-sm tabular max-sm:grid-cols-1">
        {codes.recovery_codes.map((code, index) => (
          <li key={code} className="flex gap-3">
            <span className="w-5 text-right text-text-muted select-none">{index + 1}.</span>
            <span className="text-text">{code}</span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        <CopyButton value={text} what="Recovery codes" label="Copy all" />
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            saveDownload({
              blob: new Blob([file], { type: 'text/plain' }),
              filename: 'nothing-left-recovery-codes.txt',
            })
          }
        >
          <Download className="size-icon-sm" />
          Download as .txt
        </Button>
        <Button size="sm" className="ml-auto" onClick={onDone}>
          I’ve saved them
        </Button>
      </div>
    </div>
  );
}

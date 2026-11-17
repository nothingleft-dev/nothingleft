'use client';

import { Download, TriangleAlert } from 'lucide-react';
import { RECOVERY_CODE_COUNT, type TwoFactorRecoveryCodes } from '@nothingleft/types';
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
    <div className="flex flex-col gap-4">
      <p className="flex max-w-[72ch] items-start gap-2 text-sm text-text">
        <TriangleAlert className="mt-0.5 size-icon-sm flex-none text-warning-fg" aria-hidden />
        <span>
          Save these {RECOVERY_CODE_COUNT} recovery codes now; they are not shown again. Each one signs you in once if
          you lose your phone, and nobody can let you back in without them.
        </span>
      </p>

      <ol className="grid w-max grid-cols-[repeat(2,auto)] gap-x-12 gap-y-1.5 rounded-md border bg-inset px-6 py-4 font-mono text-sm tabular max-sm:grid-cols-1">
        {codes.recovery_codes.map((code, index) => (
          <li key={code} className="flex gap-3">
            <span className="w-5 text-right text-text-secondary select-none">{index + 1}.</span>
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
        <Button size="sm" onClick={onDone}>
          I’ve saved them
        </Button>
      </div>
    </div>
  );
}

'use client';

import type { GitConnectionSecret } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { CopyButton } from '@components/copy-button';
import { FormAlert } from '@components/auth/form-alert';
import { providerLabel } from '@lib/git/words';

const GITHUB_EVENTS = [
  'Branch or tag creation',
  'Branch or tag deletion',
  'Check runs',
  'Check suites',
  'Pull requests',
  'Pull request reviews',
  'Pushes',
  'Statuses',
];

function Value({ label, value, what }: { label: string; value: string; what: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-sm border bg-inset px-2 py-1.5 font-mono text-xs">
          {value}
        </code>
        <CopyButton value={value} what={what} />
      </div>
    </div>
  );
}

/** The one time a hand-added webhook's secret is on screen: at creation and after a rotation. */
export function SecretDialog({
  connection,
  rotated,
  onClose,
}: {
  connection: GitConnectionSecret | null;
  rotated: boolean;
  onClose: () => void;
}) {
  const provider = connection ? providerLabel(connection.provider) : '';
  return (
    <Dialog open={connection !== null} onOpenChange={open => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-xl" onInteractOutside={event => event.preventDefault()}>
        {connection ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {rotated ? 'New webhook secret' : `${connection.account.login} on ${provider} is connected`}
              </DialogTitle>
              <DialogDescription>
                Add a webhook to each repository on {provider} that should feed issues, with the address and secret
                below.
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-w-0 flex-col gap-4">
              {connection.webhook_secret ? (
                <FormAlert tone="warning" title="This secret is shown once.">
                  Copy it now. Nothing shows it again; a lost secret is replaced with Rotate secret.
                </FormAlert>
              ) : null}
              {connection.webhook_url ? (
                <Value label="Payload URL" value={connection.webhook_url} what="Payload URL" />
              ) : null}
              {connection.webhook_secret ? (
                <Value label="Secret" value={connection.webhook_secret} what="Secret" />
              ) : null}
              {connection.provider === 'github' ? (
                <div className="flex flex-col gap-1.5 text-xs text-text-secondary">
                  <p>
                    In the repository’s <span className="text-text">Settings → Webhooks → Add webhook</span>: content
                    type <code className="font-mono text-text">application/json</code>, and under{' '}
                    <span className="text-text">Let me select individual events</span>:
                  </p>
                  <p className="text-text">{GITHUB_EVENTS.join(' · ')}</p>
                  {rotated ? (
                    <p>
                      Paste the new secret into every webhook that used the old one; until then their deliveries fail.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button onClick={onClose}>I’ve saved it</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

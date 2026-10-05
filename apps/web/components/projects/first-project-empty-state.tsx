'use client';

import { FileSpreadsheet, KeyRound, Plus } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Kbd } from '@components/kbd';
import { useCreateIssueDialog } from '@components/issues/create-issue-provider';
import { ConnectAgentDialog } from '@components/projects/connect-agent-dialog';
import { useNeedsVerification, VerifyEmailNotice } from '@components/settings/verify-email-notice';
import { cn } from '@lib/utils';

interface FirstProjectEmptyStateProps {
  projectName: string;
  canCreate: boolean;
}

/**
 * onboarding.md § The first empty state: three equal actions, the MCP one level with the
 * first. The CSV card is a placeholder until import lands.
 */
export function FirstProjectEmptyState({ projectName, canCreate }: FirstProjectEmptyStateProps) {
  const { openCreateIssue } = useCreateIssueDialog();
  const unverified = useNeedsVerification();

  return (
    <section aria-label="Get started" className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{projectName} has no issues yet.</h2>
        <p className="text-text-secondary">Three ways to put the first one in. No demo data: what you see is yours.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card
          icon={<Plus />}
          title="Create your first issue"
          body="A title is enough. Status, priority and type start at the project's defaults."
          action={
            canCreate ? (
              <Button onClick={() => openCreateIssue()} className="gap-2">
                Create issue <Kbd className="h-4 border-transparent bg-ink-fg/15 text-ink-fg/80">c</Kbd>
              </Button>
            ) : (
              <p className="text-xs text-text-muted">You observe this project; a Contributor creates the first one.</p>
            )
          }
        />
        <Card
          icon={<KeyRound />}
          title="Connect an LLM"
          body="Create a token and paste one command into Claude Code or Claude Desktop. The agent files, triages and comments on issues as you."
          action={
            unverified ? (
              <div className="flex flex-col gap-2">
                <Button variant="outline" disabled className="self-start">
                  Connect an agent
                </Button>
                <VerifyEmailNotice title="Verify your email address before creating an access token." />
              </div>
            ) : (
              <ConnectAgentDialog trigger={<Button variant="outline">Connect an agent</Button>} />
            )
          }
        />
        <Card
          icon={<FileSpreadsheet />}
          title="Import from CSV"
          body="Bring existing work across with a column-mapping preview before anything is written."
          action={
            <Button variant="outline" disabled aria-disabled title="CSV import arrives in a later release">
              Coming soon
            </Button>
          }
          muted
        />
      </div>
    </section>
  );
}

function Card({
  icon,
  title,
  body,
  action,
  muted = false,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-md border bg-surface p-4', muted && 'border-dashed')}>
      <span className="grid size-8 place-items-center rounded-md bg-inset text-text-secondary [&_svg]:size-4">
        {icon}
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs leading-5 text-text-secondary">{body}</p>
      </div>
      <div>{action}</div>
    </div>
  );
}

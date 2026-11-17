'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Bot, FileSpreadsheet, Plus } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Kbd } from '@components/kbd';
import { useCreateIssueDialog } from '@components/issues/create-issue-provider';
import { ConnectAgentDialog } from '@components/projects/connect-agent-dialog';
import { useNeedsVerification, VerifyEmailNotice } from '@components/settings/verify-email-notice';
import { cn } from '@lib/utils';

interface FirstProjectEmptyStateProps {
  projectKey: string;
  projectName: string;
  canCreate: boolean;
  canImport: boolean;
  /** Why nobody here can add the first issue (observer, archived); the cards give way to this sentence. */
  readOnly?: string | null;
  /** `rows` stacks the ways in one bordered list, for a column beside the project's rail. */
  layout?: 'cards' | 'rows';
}

/** onboarding.md § The first empty state: three equal actions, the MCP one level with the first. */
export function FirstProjectEmptyState({
  projectKey,
  projectName,
  canCreate,
  canImport,
  readOnly = null,
  layout = 'cards',
}: FirstProjectEmptyStateProps) {
  const { openCreateIssue } = useCreateIssueDialog();
  const unverified = useNeedsVerification();

  if (readOnly) {
    return (
      <section aria-label="No issues yet" className="flex min-w-0 flex-col gap-1 rounded-md border px-4 py-4">
        <h2 className="font-semibold">{projectName} has no issues yet.</h2>
        <p className="text-text-secondary">{readOnly}</p>
      </section>
    );
  }

  const ways = [
    <Way
      key="create"
      layout={layout}
      icon={<Plus />}
      title="Create your first issue"
      body="A title is enough. Status, priority and type start at the project's defaults."
      action={
        canCreate ? (
          <Button onClick={() => openCreateIssue()} className="gap-2">
            Create issue <Kbd className="h-4 border-transparent bg-ink-fg/15 text-ink-fg/80 max-md:hidden">c</Kbd>
          </Button>
        ) : (
          <p className="text-xs text-text-muted">You observe this project; a Contributor creates the first one.</p>
        )
      }
    />,
    <Way
      key="agent"
      layout={layout}
      icon={<Bot />}
      title="Connect an agent"
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
    />,
    canImport ? (
      <Way
        key="import"
        layout={layout}
        icon={<FileSpreadsheet />}
        title="Import from CSV"
        body="Bring existing work across from any spreadsheet: map the columns and check every row in a dry run before anything is written."
        action={
          <Button asChild variant="outline">
            <Link href={`/projects/${projectKey}/import` as Route}>Import from CSV</Link>
          </Button>
        }
      />
    ) : null,
  ].filter(Boolean);

  return (
    <section aria-label="Get started" className="flex min-w-0 flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{projectName} has no issues yet.</h2>
        <p className="text-text-secondary">{ways.length === 3 ? 'Three' : 'Two'} ways to put the first one in.</p>
      </div>
      {layout === 'rows' ? (
        <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">{ways}</ul>
      ) : (
        <div className={cn('grid gap-3', ways.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>{ways}</div>
      )}
    </section>
  );
}

function Way({
  layout,
  icon,
  title,
  body,
  action,
}: {
  layout: 'cards' | 'rows';
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  const mark = (
    <span className="grid size-8 flex-none place-items-center rounded-md bg-inset text-text-secondary [&_svg]:size-4">
      {icon}
    </span>
  );
  if (layout === 'rows') {
    return (
      <li className="flex items-start gap-4 p-4">
        {mark}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="font-semibold">{title}</h3>
          <p className="max-w-[72ch] text-xs leading-5 text-text-secondary">{body}</p>
          <div className="pt-2">{action}</div>
        </div>
      </li>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-surface p-4">
      {mark}
      <div className="flex flex-1 flex-col gap-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs leading-5 text-text-secondary">{body}</p>
      </div>
      <div>{action}</div>
    </div>
  );
}

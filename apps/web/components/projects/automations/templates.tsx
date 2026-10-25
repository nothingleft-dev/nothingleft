'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { toast } from 'sonner';
import type { AutomationTemplate } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Checkbox } from '@components/ui/checkbox';
import { Skeleton } from '@components/ui/skeleton';
import { StatusPicker } from '@components/projects/automations/status-picker';
import { useAutomationTemplates, useCreateAutomation } from '@hooks/use-automations';
import { cn } from '@lib/utils';

const isGit = (t: AutomationTemplate) => t.automation.trigger.startsWith('git.');

function NeedsStatus({ projectKey }: { projectKey: string }) {
  return (
    <p className="text-2xs text-text-secondary">
      The project has no fitting status yet. Pick one, or{' '}
      <Link href={`/projects/${projectKey}/settings?tab=statuses` as Route} className="text-text underline">
        add one in Statuses
      </Link>
      .
    </p>
  );
}

/** The empty automations tab: each template a card, created one at a time. */
export function TemplateCards({ projectKey, gitEnabled }: { projectKey: string; gitEnabled: boolean }) {
  const templates = useAutomationTemplates(projectKey);
  const shown = (templates.data ?? []).filter(t => gitEnabled || !isGit(t));

  if (templates.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
    );
  }
  if (templates.isError) return <p className="text-sm text-danger-fg">{templates.error.message}</p>;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {shown.map(template => (
        <TemplateCard key={template.key} projectKey={projectKey} template={template} />
      ))}
    </div>
  );
}

function TemplateCard({ projectKey, template }: { projectKey: string; template: AutomationTemplate }) {
  const [status, setStatus] = useState<string | null>(template.automation.action_params.status);
  const create = useCreateAutomation(projectKey);
  return (
    <div className="flex flex-col gap-2 rounded-md border p-4">
      <p className="font-medium">{template.name}</p>
      <p className="text-xs text-text-secondary">{template.description}</p>
      {template.needs_status && !status ? <NeedsStatus projectKey={projectKey} /> : null}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
        <StatusPicker projectKey={projectKey} value={status} onChange={setStatus} label={`${template.name}: status`} />
        <Button
          size="sm"
          disabled={!status || create.isPending}
          onClick={() =>
            create.mutate(
              { ...template.automation, name: template.name, action_params: { status: status! } },
              {
                onSuccess: rule => toast.success(`${rule.name} is on.`),
                onError: error => toast.error(error.message),
              },
            )
          }
        >
          {create.isPending ? 'Adding…' : 'Add rule'}
        </Button>
      </div>
    </div>
  );
}

/** Offered once, right after a project's first repository is linked: tick, pick a status, create. */
export function TemplateOffer({ projectKey, onDone }: { projectKey: string; onDone: () => void }) {
  const templates = useAutomationTemplates(projectKey);
  const create = useCreateAutomation(projectKey);
  const git = (templates.data ?? []).filter(isGit);
  const [picked, setPicked] = useState<Record<string, { on: boolean; status: string | null }>>({});
  const [busy, setBusy] = useState(false);

  const stateOf = (t: AutomationTemplate) =>
    picked[t.key] ?? { on: !t.needs_status && t.key !== 'reopen_on_revert', status: t.automation.action_params.status };
  const chosen = git.filter(t => stateOf(t).on);
  const ready = chosen.length > 0 && chosen.every(t => stateOf(t).status);

  const createSelected = async () => {
    setBusy(true);
    let made = 0;
    for (const t of chosen) {
      try {
        await create.mutateAsync({ ...t.automation, name: t.name, action_params: { status: stateOf(t).status! } });
        made += 1;
      } catch (error) {
        toast.error(`${t.name}: ${(error as Error).message}`);
      }
    }
    setBusy(false);
    if (made > 0)
      toast.success(`${made === 1 ? 'One rule' : `${made} rules`} added. Change them on the Automations tab.`);
    onDone();
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-app p-4">
      <div className="flex flex-col gap-0.5">
        <p className="font-medium">Move issues along from git?</p>
        <p className="text-xs text-text-secondary">
          Rules that set an issue’s status when its branch or pull request moves. Each change shows in the issue’s
          history with its cause. Nothing is switched on unless you create it here.
        </p>
      </div>
      {templates.isPending ? (
        <Skeleton className="h-32" />
      ) : (
        <ul className="divide-y divide-border-subtle rounded-md border bg-surface">
          {git.map(t => {
            const s = stateOf(t);
            return (
              <li key={t.key} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <Checkbox
                  id={`template-${t.key}`}
                  checked={s.on}
                  onCheckedChange={value => setPicked({ ...picked, [t.key]: { ...s, on: value === true } })}
                />
                <label htmlFor={`template-${t.key}`} className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-xs text-text-secondary">{t.description}</span>
                  {t.needs_status && !s.status ? <NeedsStatus projectKey={projectKey} /> : null}
                </label>
                <StatusPicker
                  projectKey={projectKey}
                  value={s.status}
                  onChange={status => setPicked({ ...picked, [t.key]: { on: true, status } })}
                  label={`${t.name}: status`}
                  className={cn(!s.on && 'opacity-60')}
                />
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!ready || busy} onClick={() => void createSelected()}>
          {busy ? 'Creating…' : 'Create selected'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Not now
        </Button>
      </div>
    </div>
  );
}

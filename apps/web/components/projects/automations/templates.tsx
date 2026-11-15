'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { toast } from 'sonner';
import type { AutomationTemplate } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Checkbox } from '@components/ui/checkbox';
import { Skeleton } from '@components/ui/skeleton';
import { LoadError, errorDetail } from '@components/query-state';
import { StatusPicker } from '@components/projects/automations/status-picker';
import { useAutomationTemplates, useCreateAutomation } from '@hooks/use-automations';
import { toastError } from '@components/toast-error';
import { PendingButton } from '@components/pending-button';

const isGit = (t: AutomationTemplate) => t.automation.trigger.startsWith('git.');

function NeedsStatus({ projectKey }: { projectKey: string }) {
  return (
    <p className="text-2xs text-text-secondary">
      The project has no fitting status yet. Pick one, or{' '}
      <Link
        href={`/projects/${projectKey}/settings?tab=statuses` as Route}
        className="action-link rounded-xs font-medium text-text"
      >
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
      <ul
        className="divide-y divide-border-subtle rounded-md border"
        role="status"
        aria-label="Loading suggested rules"
      >
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className={TEMPLATE_ROW}>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-2/3" />
            </span>
            <span className="flex flex-none items-center gap-2">
              <Skeleton className="h-control w-44" />
              <Skeleton className="h-control w-20" />
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (templates.isError) {
    return (
      <LoadError onRetry={() => void templates.refetch()} detail={errorDetail(templates.error)}>
        The suggested rules could not be loaded.
      </LoadError>
    );
  }

  return (
    <ul className="divide-y divide-border-subtle rounded-md border">
      {shown.map(template => (
        <TemplateCard key={template.key} projectKey={projectKey} template={template} />
      ))}
    </ul>
  );
}

function TemplateCard({ projectKey, template }: { projectKey: string; template: AutomationTemplate }) {
  const [status, setStatus] = useState<string | null>(template.automation.action_params.status);
  const create = useCreateAutomation(projectKey);
  return (
    <li className={TEMPLATE_ROW}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-medium">{template.name}</p>
        <p className="text-xs text-text-secondary">{template.description}</p>
        {template.needs_status && !status ? <NeedsStatus projectKey={projectKey} /> : null}
      </div>
      <div className="flex flex-none items-center gap-2">
        <StatusPicker projectKey={projectKey} value={status} onChange={setStatus} label={`${template.name}: status`} />
        <PendingButton
          size="sm"
          variant="outline"
          disabled={!status}
          pending={create.isPending}
          pendingLabel="Adding…"
          onClick={() =>
            create.mutate(
              { ...template.automation, name: template.name, action_params: { status: status! } },
              {
                onSuccess: rule => toast.success(`${rule.name} is on.`),
                onError: error => toastError(`Could not add ${template.name}`, error),
              },
            )
          }
        >
          Add rule
        </PendingButton>
      </div>
    </li>
  );
}

const TEMPLATE_ROW = 'flex items-center gap-x-6 gap-y-3 px-4 py-3 max-sm:flex-col max-sm:items-start';

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
        toastError(`Could not add ${t.name}`, error as Error);
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
                />
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <PendingButton
          size="sm"
          disabled={!ready}
          onClick={() => void createSelected()}
          pending={busy}
          pendingLabel="Creating…"
        >
          Create selected
        </PendingButton>
        <Button variant="ghost" size="sm" onClick={onDone} disabled={busy}>
          Not now
        </Button>
      </div>
    </div>
  );
}

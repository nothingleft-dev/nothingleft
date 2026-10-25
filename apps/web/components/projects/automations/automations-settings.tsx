'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { AlertTriangle, FlaskConical, History, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Automation, AutomationCatalogue, AutomationTrigger, ProjectRepository } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Switch } from '@components/ui/switch';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { ConfirmDialog } from '@components/confirm-dialog';
import { FormAlert } from '@components/auth/form-alert';
import { RelativeTime } from '@components/relative-time';
import { SettingsSection } from '@components/settings/section';
import { ProviderGlyph } from '@components/git/provider-glyph';
import { AutomationEditor, type EditorTarget } from '@components/projects/automations/automation-editor';
import { BranchChips } from '@components/projects/automations/branch-chips';
import { RunsDrawer, type RunsTarget } from '@components/projects/automations/runs-drawer';
import { StatusPicker } from '@components/projects/automations/status-picker';
import { TemplateCards } from '@components/projects/automations/templates';
import { TestDialog } from '@components/projects/automations/test-dialog';
import {
  useAutomationCatalogue,
  useAutomations,
  useAutomationTemplates,
  useCreateAutomation,
  useDeleteAutomation,
  useUpdateAutomation,
} from '@hooks/use-automations';
import { useUpdateRepositoryLink } from '@hooks/use-git';
import { cn } from '@lib/utils';

// The git matrix's rows (owner, 25 Oct 2026); a commit pushed rule lives under Other automations.
const MATRIX: readonly AutomationTrigger[] = [
  'git.branch_created',
  'git.pull_request_opened',
  'git.pull_request_ready',
  'git.pull_request_merged',
  'git.pull_request_closed',
  'git.revert_merged',
];

interface AutomationsSettingsProps {
  projectKey: string;
  canEdit: boolean;
  readOnlyReason: string;
  repositories: readonly ProjectRepository[];
}

export function AutomationsSettings({ projectKey, canEdit, readOnlyReason, repositories }: AutomationsSettingsProps) {
  const router = useRouter();
  const params = useSearchParams();
  const rules = useAutomations(projectKey);
  const catalogue = useAutomationCatalogue();
  const gitEnabled = repositories.length > 0;
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [testing, setTesting] = useState<Automation | null>(null);

  const runsParam = params.get('runs');
  const runs: RunsTarget | null = runsParam
    ? { automation: runsParam === '*' ? null : runsParam, issue: params.get('issue') }
    : null;
  const setRuns = (target: RunsTarget | null) => {
    const next = new URLSearchParams(params);
    next.set('tab', 'automations');
    next.delete('runs');
    next.delete('issue');
    if (target) {
      next.set('runs', target.automation ?? '*');
      if (target.issue) next.set('issue', target.issue);
    }
    router.replace(`/projects/${projectKey}/settings?${next.toString()}` as Route, { scroll: false });
  };

  const list = useMemo(() => rules.data ?? [], [rules.data]);
  // A matrix row is the first rule, by run order, with that trigger; every other rule is listed below.
  const matrixRules = useMemo(() => {
    const first = new Map<AutomationTrigger, Automation>();
    if (gitEnabled)
      for (const rule of list)
        if (MATRIX.includes(rule.trigger) && !first.has(rule.trigger)) first.set(rule.trigger, rule);
    return first;
  }, [list, gitEnabled]);
  const others = list.filter(rule => ![...matrixRules.values()].includes(rule));

  if (rules.isPending || catalogue.isPending) return <AutomationsSkeleton />;
  if ((rules.isError && !rules.data) || catalogue.isError) {
    return (
      <FormAlert title="The automations could not be loaded.">
        <button type="button" onClick={() => void (rules.refetch(), catalogue.refetch())}>
          Try again
        </button>
      </FormAlert>
    );
  }

  const cat = catalogue.data;
  const shared = { projectKey, canEdit, onEdit: setEditing, onTest: setTesting, onRuns: setRuns };

  return (
    <>
      {canEdit ? null : <p className="text-xs text-text-secondary">{readOnlyReason}</p>}

      {list.length === 0 ? (
        <SettingsSection
          title="Automations"
          description={
            gitEnabled
              ? 'Rules that set an issue’s status when its branch or pull request moves, or when its last subtask is resolved. Every change shows in the issue’s history with its cause; a change a rule makes never fires another rule.'
              : 'Rules that set an issue’s status for you. Without a linked repository, the one that applies is the subtasks rule; link a repository in Repositories for the git ones.'
          }
        >
          {canEdit ? (
            <>
              <TemplateCards projectKey={projectKey} gitEnabled={gitEnabled} />
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-text-secondary"
                  onClick={() => setEditing({ trigger: null })}
                >
                  <Plus /> Start from scratch
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-text-secondary">No automation is set up in this project.</p>
          )}
        </SettingsSection>
      ) : (
        <>
          {gitEnabled ? (
            <SettingsSection
              title="When git moves an issue"
              description="One status per event. Pick — to leave issues alone on it. Each row is a rule; conditions opens the whole rule."
              actions={
                <Button variant="outline" size="sm" onClick={() => setRuns({ automation: null, issue: null })}>
                  <History /> All runs
                </Button>
              }
            >
              <GitMatrix catalogue={cat} rules={matrixRules} {...shared} />
              <MergedInto projectKey={projectKey} repositories={repositories} canEdit={canEdit} />
            </SettingsSection>
          ) : null}

          <SettingsSection
            title={gitEnabled ? 'Other automations' : 'Automations'}
            description={
              gitEnabled
                ? 'Further rules, in the order they run. For one trigger the first rule that changes the issue wins.'
                : 'In the order they run. Git rules wait until a repository is linked in Repositories.'
            }
            actions={
              <>
                {gitEnabled ? null : (
                  <Button variant="outline" size="sm" onClick={() => setRuns({ automation: null, issue: null })}>
                    <History /> All runs
                  </Button>
                )}
                {canEdit ? (
                  <Button size="sm" onClick={() => setEditing({ trigger: null })}>
                    <Plus /> New automation
                  </Button>
                ) : null}
              </>
            }
          >
            {others.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Nothing beyond the table above. A commit pushed rule, a second rule for one event or the subtasks rule
                goes here.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle rounded-md border">
                {others.map(rule => (
                  <RuleRow key={rule.name} rule={rule} gitEnabled={gitEnabled} {...shared} />
                ))}
              </ul>
            )}
          </SettingsSection>
        </>
      )}

      <AutomationEditor
        projectKey={projectKey}
        catalogue={cat}
        gitEnabled={gitEnabled}
        target={editing}
        onClose={() => setEditing(null)}
      />
      <TestDialog projectKey={projectKey} rule={testing} onClose={() => setTesting(null)} />
      <RunsDrawer projectKey={projectKey} target={runs} onClose={() => setRuns(null)} />
    </>
  );
}

interface Shared {
  projectKey: string;
  canEdit: boolean;
  onEdit: (target: EditorTarget) => void;
  onTest: (rule: Automation) => void;
  onRuns: (target: RunsTarget) => void;
}

function RunsLine({ rule }: { rule: Automation }) {
  if (rule.runs === 0) return <span className="text-text-muted">no runs yet</span>;
  return (
    <span>
      last ran {rule.last_run_at ? <RelativeTime value={rule.last_run_at} /> : null} · {rule.runs}{' '}
      {rule.runs === 1 ? 'run' : 'runs'}
    </span>
  );
}

function MissingFlag() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help items-center gap-1 text-2xs font-medium text-warning-fg">
          <AlertTriangle className="size-3" aria-hidden /> Status missing
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        Its status was archived or deleted, so every run skips until it is pointed at another.
      </TooltipContent>
    </Tooltip>
  );
}

function GitMatrix({
  catalogue,
  rules,
  projectKey,
  canEdit,
  onEdit,
  onRuns,
}: Shared & { catalogue: AutomationCatalogue; rules: Map<AutomationTrigger, Automation> }) {
  const templates = useAutomationTemplates(projectKey, canEdit);
  const create = useCreateAutomation(projectKey);
  const update = useUpdateAutomation(projectKey);

  const pick = (trigger: AutomationTrigger, rule: Automation | undefined, status: string | null) => {
    const fail = { onError: (error: Error) => toast.error(error.message) };
    if (rule) {
      if (status === null) update.mutate({ name: rule.name, body: { is_enabled: false } }, fail);
      else update.mutate({ name: rule.name, body: { action_params: { status }, is_enabled: true } }, fail);
      return;
    }
    if (status === null) return;
    const template = templates.data?.find(t => t.automation.trigger === trigger);
    create.mutate(
      template
        ? { ...template.automation, name: template.name, action_params: { status }, is_enabled: true }
        : { trigger, conditions: {}, action: 'issue.set_status', action_params: { status }, is_enabled: true },
      fail,
    );
  };

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[640px] table-fixed text-sm">
        <thead className="bg-app text-left text-2xs text-text-secondary">
          <tr>
            <th className="h-7 px-3 font-medium">When</th>
            <th className="w-52 px-3 font-medium">Set status to</th>
            <th className="w-56 px-3 font-medium">Runs</th>
            <th className="w-24 px-3" aria-label="Rule" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {MATRIX.map(trigger => {
            const rule = rules.get(trigger);
            const label = catalogue.triggers.find(t => t.key === trigger)?.label ?? trigger;
            const value = rule && rule.is_enabled ? String(rule.action_params.status) : null;
            return (
              <tr key={trigger} className="h-11">
                <td className="px-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{label}</span>
                    {rule && rule.name !== label ? (
                      <span className="truncate text-2xs text-text-muted">{rule.name}</span>
                    ) : null}
                  </span>
                </td>
                <td className="px-3">
                  <span className="flex items-center gap-2">
                    <StatusPicker
                      projectKey={projectKey}
                      value={value}
                      allowOff
                      disabled={!canEdit}
                      label={`${label}: status`}
                      onChange={status => pick(trigger, rule, status)}
                    />
                    {rule?.status_missing ? <MissingFlag /> : null}
                  </span>
                </td>
                <td className="px-3 text-xs text-text-secondary">
                  {rule && value !== null ? (
                    <button
                      type="button"
                      className="text-left whitespace-nowrap hover:text-text hover:underline"
                      onClick={() => onRuns({ automation: rule.name, issue: null })}
                    >
                      <RunsLine rule={rule} />
                    </button>
                  ) : (
                    <span className="text-text-muted">off</span>
                  )}
                </td>
                <td className="px-3 text-right">
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-text-secondary"
                      onClick={() => onEdit(rule ? { rule } : { trigger })}
                    >
                      conditions
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MergedInto({
  projectKey,
  repositories,
  canEdit,
}: {
  projectKey: string;
  repositories: readonly ProjectRepository[];
  canEdit: boolean;
}) {
  const update = useUpdateRepositoryLink(projectKey);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-text-secondary">
        <span className="font-medium text-text">Merged into</span> — the branches a merge into counts for the merged
        rows, per repository. They belong to the repository, so every project it is linked to shares them.
      </p>
      <ul className="flex flex-col gap-1.5">
        {repositories.map(repository => (
          <li key={repository.full_name} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex w-72 min-w-0 items-center gap-1.5 font-mono text-xs">
              <ProviderGlyph provider={repository.provider} className="text-text-muted" />
              <span className="truncate">{repository.full_name}</span>
            </span>
            <BranchChips
              repository={repository}
              disabled={!canEdit}
              onChange={branches =>
                update.mutate(
                  {
                    repository: repository.full_name,
                    body: { connection: repository.connection, merge_base_branches: branches },
                  },
                  { onError: error => toast.error(error.message) },
                )
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RuleRow({
  rule,
  gitEnabled,
  projectKey,
  canEdit,
  onEdit,
  onTest,
  onRuns,
}: Shared & { rule: Automation; gitEnabled: boolean }) {
  const update = useUpdateAutomation(projectKey);
  const remove = useDeleteAutomation(projectKey);
  const [confirming, setConfirming] = useState(false);
  const waiting = rule.trigger.startsWith('git.') && !gitEnabled;

  return (
    <li className={cn('flex items-start gap-3 px-3 py-3', !rule.is_enabled && 'text-text-muted')}>
      <Switch
        checked={rule.is_enabled}
        disabled={!canEdit}
        aria-label={`${rule.name}: ${rule.is_enabled ? 'on' : 'off'}`}
        className="mt-0.5"
        onCheckedChange={value =>
          update.mutate({ name: rule.name, body: { is_enabled: value } }, { onError: e => toast.error(e.message) })
        }
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn('font-medium', rule.is_enabled ? 'text-text' : 'text-text-secondary')}>{rule.name}</span>
          {rule.status_missing ? <MissingFlag /> : null}
          {waiting ? <span className="text-2xs text-text-muted">waits for a linked repository</span> : null}
        </span>
        <span className="text-xs text-text-secondary">{rule.sentence}</span>
        <button
          type="button"
          className="self-start text-2xs text-text-secondary hover:text-text hover:underline"
          onClick={() => onRuns({ automation: rule.name, issue: null })}
        >
          <RunsLine rule={rule} />
        </button>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`${rule.name} actions`} className="text-text-muted">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {canEdit ? (
            <>
              <DropdownMenuItem onSelect={() => onEdit({ rule })}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onTest(rule)}>
                <FlaskConical /> Test on an issue…
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuItem onSelect={() => onRuns({ automation: rule.name, issue: null })}>
            <History /> Runs
          </DropdownMenuItem>
          {canEdit ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${rule.name}?`}
        confirmLabel="Delete automation"
        pending={remove.isPending}
        onConfirm={() =>
          remove
            .mutateAsync(rule.name)
            .then(
              () => toast.success(`${rule.name} is deleted.`),
              (error: Error) => toast.error(error.message),
            )
            .finally(() => setConfirming(false))
        }
      >
        <p>It stops changing issues for everyone in the project, and its run log goes with it.</p>
        <p>Changes it already made stay in each issue’s history.</p>
      </ConfirmDialog>
    </li>
  );
}

function AutomationsSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading automations">
      <Skeleton className="h-4 w-48" />
      <div className="divide-y divide-border-subtle rounded-md border">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex h-11 items-center gap-6 px-3">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

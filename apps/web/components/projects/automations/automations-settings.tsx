'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { AlertTriangle, FlaskConical, History, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  PLAN_PRESETS,
  type Automation,
  type AutomationCatalogue,
  type AutomationTrigger,
  type ProjectRepository,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Switch } from '@components/ui/switch';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { ConfirmDialog } from '@components/confirm-dialog';
import { LoadError, errorDetail } from '@components/query-state';
import { RelativeTime } from '@components/relative-time';
import { EmptyState } from '@components/empty-state';
import { SettingsSection } from '@components/settings/section';
import { ProviderGlyph } from '@components/git/provider-glyph';
import { AutomationEditor, type EditorTarget } from '@components/projects/automations/automation-editor';
import { BranchChips } from '@components/projects/automations/branch-chips';
import { RunsDrawer, type RunsTarget } from '@components/projects/automations/runs-drawer';
import { StatusPicker, StatusText } from '@components/projects/automations/status-picker';
import { ReadOnlyNotice } from '@components/projects/read-only-notice';
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
import { useOrganization } from '@hooks/use-organizations';
import { useSession } from '@hooks/use-session';
import { repositoryLocks } from '@lib/git/repository-locks';
import { cn } from '@lib/utils';
import { toastError } from '@components/toast-error';

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
  orgAdmin: boolean;
  readOnlyReason: string;
  repositories: readonly ProjectRepository[];
}

export function AutomationsSettings({
  projectKey,
  canEdit,
  orgAdmin,
  readOnlyReason,
  repositories,
}: AutomationsSettingsProps) {
  const router = useRouter();
  const params = useSearchParams();
  const rules = useAutomations(projectKey);
  const catalogue = useAutomationCatalogue();
  const gitEnabled = repositories.length > 0;
  const session = useSession();
  const organization = useOrganization(session.status === 'signed-in' ? session.user.current_organization_slug : null);
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [viewing, setViewing] = useState<Automation | null>(null);
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
      <LoadError onRetry={() => void (rules.refetch(), catalogue.refetch())} detail={errorDetail(rules.error)}>
        The automations could not be loaded.
      </LoadError>
    );
  }

  const cat = catalogue.data;
  const shared = {
    projectKey,
    canEdit,
    onEdit: setEditing,
    onView: setViewing,
    onTest: setTesting,
    onRuns: setRuns,
  };
  const limit = organization.data ? PLAN_PRESETS[organization.data.plan].automations_per_project : null;
  const atLimit = limit !== null && list.length >= limit;
  const limitNote = `${list.length} of ${limit} automations used, the most this plan allows in one project. Delete one to add another.`;

  const newAutomation = canEdit ? (
    atLimit ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="rounded-md">
            <Button size="sm" disabled className="pointer-events-none">
              <Plus /> New automation
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{limitNote}</TooltipContent>
      </Tooltip>
    ) : (
      <Button size="sm" onClick={() => setEditing({ trigger: null })}>
        <Plus /> New automation
      </Button>
    )
  ) : null;
  const limitLine = canEdit && atLimit ? <p className="text-xs text-text-secondary">{limitNote}</p> : null;
  const headerActions = (
    <>
      <Button variant="outline" size="sm" onClick={() => setRuns({ automation: null, issue: null })}>
        <History /> All runs
      </Button>
      {newAutomation}
    </>
  );

  return (
    <>
      {canEdit ? null : <ReadOnlyNotice>{readOnlyReason}</ReadOnlyNotice>}

      {list.length === 0 ? (
        <SettingsSection
          title="Automations"
          description={
            gitEnabled
              ? 'Rules that set an issue’s status when its branch or pull request moves, or when its last subtask is resolved. Each change shows in the issue’s history with its cause, and a change made by a rule never triggers another rule.'
              : 'Rules that set an issue’s status for you. The subtask and duplicate rules work now; the git rules wait for a repository linked in Repositories.'
          }
          actions={
            canEdit ? (
              <Button variant="outline" size="sm" onClick={() => setEditing({ trigger: null })}>
                <Plus /> Start from scratch
              </Button>
            ) : null
          }
        >
          {canEdit ? (
            <TemplateCards projectKey={projectKey} gitEnabled={gitEnabled} />
          ) : (
            <EmptyState
              title="No automation is set up in this project."
              description="A Project Admin can add rules that move issues along for you."
            />
          )}
        </SettingsSection>
      ) : (
        <>
          {gitEnabled ? (
            <SettingsSection
              title="When git moves an issue"
              description={
                canEdit
                  ? 'The status each git event sets, or off to leave the issue alone. Edit conditions to narrow which issues a rule moves.'
                  : 'The status each git event sets. View shows which issues a rule moves.'
              }
              actions={headerActions}
            >
              {limitLine}
              <GitMatrix catalogue={cat} rules={matrixRules} {...shared} />
              <MergedInto projectKey={projectKey} repositories={repositories} canEdit={canEdit} orgAdmin={orgAdmin} />
            </SettingsSection>
          ) : null}

          <SettingsSection
            title={gitEnabled ? 'Other automations' : 'Automations'}
            description={
              gitEnabled
                ? 'Further rules, in the order they run. For one trigger the first rule that changes the issue wins.'
                : 'In the order they run. Git rules wait until a repository is linked in Repositories.'
            }
            actions={gitEnabled ? undefined : headerActions}
          >
            {gitEnabled ? null : limitLine}
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
        limitNote={atLimit ? limitNote : null}
        onClose={() => setEditing(null)}
      />
      <AutomationEditor
        projectKey={projectKey}
        catalogue={cat}
        gitEnabled={gitEnabled}
        target={viewing ? { rule: viewing } : null}
        readOnly
        onClose={() => setViewing(null)}
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
  onView: (rule: Automation) => void;
  onTest: (rule: Automation) => void;
  onRuns: (target: RunsTarget) => void;
}

const QUIET_ACTION = 'rounded-xs text-text-secondary underline-offset-3 hover:text-text hover:underline';

function RunsLine({ rule, onRuns }: { rule: Automation; onRuns: (target: RunsTarget) => void }) {
  if (rule.runs === 0) return <span className="text-text-muted">No runs yet</span>;
  return (
    <button
      type="button"
      className={cn(QUIET_ACTION, 'max-w-full truncate text-left tabular')}
      onClick={() => onRuns({ automation: rule.name, issue: null })}
    >
      Last ran {rule.last_run_at ? <RelativeTime value={rule.last_run_at} /> : null} · {rule.runs}{' '}
      {rule.runs === 1 ? 'run' : 'runs'}
    </button>
  );
}

function MissingFlag() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex max-w-full cursor-help items-center gap-1 text-2xs font-medium text-warning-fg">
          <AlertTriangle className="size-3 flex-none" aria-hidden />
          <span className="truncate">Status missing, so every run skips</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        Its status was archived or deleted. Pick another status and the rule runs again.
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
  onView,
  onRuns,
}: Shared & { catalogue: AutomationCatalogue; rules: Map<AutomationTrigger, Automation> }) {
  const templates = useAutomationTemplates(projectKey, canEdit);
  const create = useCreateAutomation(projectKey);
  const update = useUpdateAutomation(projectKey);

  const pick = (trigger: AutomationTrigger, rule: Automation | undefined, status: string | null) => {
    const fail = { onError: (error: Error) => toastError('Could not change the automation', error) };
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
    <div className="rounded-md border">
      <div
        aria-hidden
        className={cn(
          MATRIX_GRID,
          'h-7 items-center rounded-t-md bg-app text-2xs font-medium text-text-secondary max-sm:hidden',
        )}
      >
        <span>When</span>
        <span>Set status to</span>
        <span>Runs</span>
        <span />
      </div>
      <ul className="divide-y divide-border-subtle border-border-subtle sm:border-t">
        {MATRIX.map(trigger => {
          const rule = rules.get(trigger);
          const label = catalogue.triggers.find(t => t.key === trigger)?.label ?? trigger;
          const value = rule && rule.is_enabled ? String(rule.action_params.status) : null;
          return (
            <li key={trigger} className={cn(MATRIX_GRID, 'py-2 sm:min-h-14')}>
              <span className="flex min-w-0 flex-col max-sm:col-span-2">
                <span className="truncate">{label}</span>
                {rule && rule.name !== label ? (
                  <span className="truncate text-2xs text-text-secondary">{rule.name}</span>
                ) : null}
                {rule?.status_missing ? <MissingFlag /> : null}
              </span>
              <span className="flex min-w-0 items-center max-sm:col-span-2">
                {canEdit ? (
                  <StatusPicker
                    projectKey={projectKey}
                    value={value}
                    allowOff
                    label={`${label}: status`}
                    className="min-w-0 flex-1"
                    onChange={status => pick(trigger, rule, status)}
                  />
                ) : (
                  <span className="flex h-control min-w-0 items-center">
                    <StatusText projectKey={projectKey} value={value} />
                  </span>
                )}
              </span>
              <span className="min-w-0 text-xs text-text-secondary">
                {rule && value !== null ? (
                  <RunsLine rule={rule} onRuns={onRuns} />
                ) : !rule && !canEdit ? (
                  <span className="text-text-muted">No rule set up</span>
                ) : null}
              </span>
              <span className="text-right text-xs">
                {canEdit ? (
                  <button
                    type="button"
                    className={cn(QUIET_ACTION, 'font-medium')}
                    onClick={() => onEdit(rule ? { rule } : { trigger })}
                  >
                    Edit conditions
                  </button>
                ) : rule ? (
                  <button
                    type="button"
                    aria-label={`View ${rule.name}`}
                    className={cn(QUIET_ACTION, 'font-medium')}
                    onClick={() => onView(rule)}
                  >
                    View
                  </button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const MATRIX_GRID =
  'grid items-center gap-x-4 gap-y-2 px-3 grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_12rem_15.5rem_7rem]';

function MergedInto({
  projectKey,
  repositories,
  canEdit,
  orgAdmin,
}: {
  projectKey: string;
  repositories: readonly ProjectRepository[];
  canEdit: boolean;
  orgAdmin: boolean;
}) {
  const update = useUpdateRepositoryLink(projectKey);
  return (
    <div className="flex flex-col gap-2 pt-1">
      <p className="px-3 text-xs text-text-secondary">
        <span className="font-medium text-text">Merged into:</span> the branches that count as a merge for the merged
        rows. Set per repository and shared by every project that links it.
      </p>
      <ul className="flex flex-col gap-1.5">
        {repositories.map(repository => (
          <li key={repository.full_name} className={cn(MATRIX_GRID, 'max-sm:grid-cols-1 max-sm:gap-y-1')}>
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs">
              <ProviderGlyph provider={repository.provider} className="text-text-muted" />
              <span className="truncate">{repository.full_name}</span>
            </span>
            <span className="min-w-0 sm:col-span-3">
              <BranchChips
                repository={repository}
                disabled={!canEdit || repositoryLocks(repository, orgAdmin).branches !== null}
                onChange={branches =>
                  update.mutate(
                    {
                      repository: repository.full_name,
                      body: { connection: repository.connection, merge_base_branches: branches },
                    },
                    { onError: error => toastError('Could not change the base branches', error) },
                  )
                }
              />
            </span>
          </li>
        ))}
      </ul>
      {canEdit && repositories.some(r => repositoryLocks(r, orgAdmin).branches) ? (
        <p className="px-3 text-2xs text-text-secondary">
          Only an Org Admin can change the branches of a repository other projects use too.
        </p>
      ) : null}
    </div>
  );
}

function RuleRow({
  rule,
  gitEnabled,
  projectKey,
  canEdit,
  onEdit,
  onView,
  onTest,
  onRuns,
}: Shared & { rule: Automation; gitEnabled: boolean }) {
  const update = useUpdateAutomation(projectKey);
  const remove = useDeleteAutomation(projectKey);
  const [confirming, setConfirming] = useState(false);
  const waiting = rule.trigger.startsWith('git.') && !gitEnabled;

  return (
    <li className={cn('flex items-start gap-3 px-3 py-3', !rule.is_enabled && 'text-text-muted')}>
      {canEdit ? (
        <Switch
          checked={rule.is_enabled}
          aria-label={`${rule.name}: ${rule.is_enabled ? 'on' : 'off'}`}
          className="mt-0.5"
          onCheckedChange={value =>
            update.mutate(
              { name: rule.name, body: { is_enabled: value } },
              {
                onError: e =>
                  toastError(value ? `Could not turn ${rule.name} on` : `Could not turn ${rule.name} off`, e),
              },
            )
          }
        />
      ) : (
        <span className={cn('w-8 flex-none text-xs font-medium', rule.is_enabled ? 'text-text' : 'text-text-muted')}>
          {rule.is_enabled ? 'On' : 'Off'}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn('font-medium', rule.is_enabled ? 'text-text' : 'text-text-secondary')}>{rule.name}</span>
          {rule.status_missing ? <MissingFlag /> : null}
          {waiting ? <span className="text-2xs text-text-muted">waits for a linked repository</span> : null}
        </span>
        <span className="text-xs text-text-secondary">{rule.sentence}</span>
        <span className="flex text-2xs text-text-secondary">
          <RunsLine rule={rule} onRuns={onRuns} />
        </span>
      </div>
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`${rule.name} actions`} className="text-text-muted">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => onEdit({ rule })}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onTest(rule)}>
              <FlaskConical /> Test on an issue…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRuns({ automation: rule.name, issue: null })}>
              <History /> Runs
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          aria-label={`View ${rule.name}`}
          className={cn(QUIET_ACTION, 'text-xs font-medium')}
          onClick={() => onView(rule)}
        >
          View
        </button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete “${rule.name}”?`}
        confirmLabel="Delete automation"
        pendingLabel="Deleting…"
        pending={remove.isPending}
        onConfirm={() =>
          remove
            .mutateAsync(rule.name)
            .then(
              () => toast.success(`${rule.name} is deleted.`),
              (error: Error) => toastError(`Could not delete ${rule.name}`, error),
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

export function AutomationsSkeleton() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading automations">
      <div className="flex items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="mt-1 h-3.5 w-full max-w-[72ch]" />
          <Skeleton className="h-3.5 w-1/3" />
        </div>
        <Skeleton className="h-8 w-24 flex-none" />
        <Skeleton className="h-8 w-36 flex-none" />
      </div>
      <div className="rounded-md border">
        <div className={cn(MATRIX_GRID, 'h-7 rounded-t-md bg-app max-sm:hidden')}>
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-2.5 w-10" />
          <span />
        </div>
        <div className="divide-y divide-border-subtle border-border-subtle sm:border-t">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={cn(MATRIX_GRID, 'py-2 sm:min-h-14')}>
              <Skeleton className="h-3 w-40 max-sm:col-span-2" />
              <span className="flex items-center gap-2 max-sm:col-span-2">
                <Skeleton className="h-8 flex-1" />
                <span className="w-icon-sm flex-none" />
              </span>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="ml-auto h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2 pt-1">
        <Skeleton className="mx-3 h-3 w-96 max-w-full" />
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className={cn(MATRIX_GRID, 'h-6 max-sm:grid-cols-1')}>
            <Skeleton className="h-3 w-40" />
            <span className="flex gap-1 sm:col-span-3">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-6 w-6" />
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t pt-5">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
        <div className="divide-y divide-border-subtle rounded-md border">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-3">
              <Skeleton className="h-[1.15rem] w-8 flex-none rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-48" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

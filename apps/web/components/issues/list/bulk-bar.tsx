'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  BULK_UPDATE_MAX_ISSUES,
  type BulkUpdateIssues,
  type BulkUpdateResult,
  type IssueListItem,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { Kbd } from '@components/kbd';
import { IssueKey } from '@components/issue-key';
import { Segmented } from '@components/segmented';
import { AssigneeCommand, DateEditor, ValueCommand } from '@components/issues/pickers';
import { PriorityBadge, StatusDot, TypeBadge } from '@components/issues/value-marks';
import { useBulkUpdateIssues } from '@hooks/use-issue-search';
import { useProjectAssigneesMany } from '@hooks/use-projects';
import { useSchemaValuesMany } from '@hooks/use-project-schema';
import { useShortcut } from '@hooks/use-shortcut';
import { cn } from '@lib/utils';

interface BulkBarProps {
  selected: readonly IssueListItem[];
  onClear: () => void;
  /** Keys that failed stay selected so the person can retry or inspect them. */
  onKeepFailed: (keys: string[]) => void;
}

type Picker = 'status' | 'priority' | 'type' | 'assign' | 'due' | null;
type AssignMode = 'add' | 'remove' | 'replace';
const ASSIGN_MODES = [
  { value: 'add', label: 'Add' },
  { value: 'remove', label: 'Remove' },
  { value: 'replace', label: 'Replace' },
] as const;

const dedupeByName = <T extends { name: string }>(values: readonly T[]) => {
  const seen = new Set<string>();
  return values.filter(v => (seen.has(v.name.toLowerCase()) ? false : (seen.add(v.name.toLowerCase()), true)));
};

/** DESIGN-SYSTEM § 8a: sticky at the bottom, only while a selection exists. */
export function BulkBar({ selected, onClear, onKeepFailed }: BulkBarProps) {
  const [picker, setPicker] = useState<Picker>(null);
  const [assignMode, setAssignMode] = useState<AssignMode>('add');
  const [assignDraft, setAssignDraft] = useState<string[]>([]);
  const [failures, setFailures] = useState<BulkUpdateResult[] | null>(null);
  const bulk = useBulkUpdateIssues();
  useShortcut('Escape', onClear, selected.length > 0 && picker === null);

  const projects = useMemo(() => [...new Set(selected.map(i => i.project.key))], [selected]);
  const overCap = selected.length > BULK_UPDATE_MAX_ISSUES;
  const busy = bulk.isPending || overCap;

  const run = (changes: BulkUpdateIssues['changes'], summary: string) => {
    setPicker(null);
    bulk.mutate(
      { issues: selected.map(i => i.key), changes },
      {
        onSuccess: results => {
          const failed = results.filter(r => r.result === 'failed');
          const updated = results.filter(r => r.result === 'updated').length;
          if (failed.length === 0) {
            toast.success(`${summary} on ${updated} ${updated === 1 ? 'issue' : 'issues'}.`);
            onClear();
            return;
          }
          toast.error(`${summary} on ${updated}; ${failed.length} ${failed.length === 1 ? 'was' : 'were'} refused.`);
          setFailures(failed);
          onKeepFailed(failed.map(f => f.key));
        },
        onError: error => toast.error(error.message),
      },
    );
  };

  if (selected.length === 0) return null;

  const pop = (key: Exclude<Picker, null>, label: string, body: ReactNode, width = 'w-[260px]') => (
    <Popover open={picker === key} onOpenChange={open => setPicker(open ? key : null)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="text-text-secondary hover:text-text" disabled={busy}>
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className={cn('p-0', width)}>
        {picker === key ? body : null}
      </PopoverContent>
    </Popover>
  );

  return (
    <>
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className="sticky bottom-4 z-10 mx-auto mt-4 flex w-max max-w-full flex-wrap items-center gap-1 rounded-lg border bg-raised py-1.5 pr-1.5 pl-3 shadow-popover"
      >
        <span className="mr-2 text-xs font-medium tabular">
          {selected.length} selected
          {overCap ? <span className="ml-1 font-normal text-danger-fg">· at most {BULK_UPDATE_MAX_ISSUES}</span> : null}
        </span>
        {pop(
          'status',
          'Set status',
          <StatusPicker projects={projects} onPick={name => run({ status: name }, `Status set to ${name}`)} />,
        )}
        {pop(
          'priority',
          'Set priority',
          <ValuePicker
            projects={projects}
            table="priorities"
            onPick={name => run({ priority: name }, `Priority set to ${name}`)}
          />,
        )}
        {pop(
          'type',
          'Set type',
          <ValuePicker projects={projects} table="types" onPick={name => run({ type: name }, `Type set to ${name}`)} />,
        )}
        {pop(
          'assign',
          'Assign',
          <AssignPicker
            projects={projects}
            mode={assignMode}
            onMode={setAssignMode}
            draft={assignDraft}
            onDraft={setAssignDraft}
            onApply={() => {
              const changes =
                assignMode === 'add'
                  ? { add_assignees: assignDraft }
                  : assignMode === 'remove'
                    ? { remove_assignees: assignDraft }
                    : { assignees: assignDraft };
              const verb =
                assignMode === 'add' ? 'Assigned' : assignMode === 'remove' ? 'Unassigned' : 'Assignees replaced';
              setAssignDraft([]);
              run(changes, verb);
            }}
          />,
          'w-[300px]',
        )}
        {pop(
          'due',
          'Due date',
          <DateEditor
            value={null}
            onChange={value => run({ due_date: value }, value ? 'Due date set' : 'Due date cleared')}
          />,
          'w-[280px]',
        )}
        <span className="mx-1 h-[18px] w-px bg-border" />
        <Button
          variant="ghost"
          size="xs"
          className="gap-1.5 text-text-secondary"
          onClick={onClear}
          disabled={bulk.isPending}
        >
          Clear <Kbd className="h-4 text-[10px]">Esc</Kbd>
        </Button>
      </div>

      <Dialog open={failures !== null} onOpenChange={open => (open ? null : setFailures(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {failures?.length} {failures?.length === 1 ? 'issue was' : 'issues were'} not changed
            </DialogTitle>
            <DialogDescription>
              The others were updated. Each refusal is the same answer a single edit would have given; the refused
              issues stay selected.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-[50vh] flex-col divide-y divide-border-subtle overflow-y-auto rounded-md border">
            {(failures ?? []).map(f => (
              <li key={f.key} className="flex flex-col gap-0.5 px-3 py-2">
                <IssueKey issueKey={f.key} />
                <span className="text-xs text-danger-fg">{f.error?.message ?? 'Refused.'}</span>
                {f.error?.valid_values && f.error.valid_values.length > 0 ? (
                  <span className="text-2xs text-text-muted">Valid: {f.error.valid_values.join(', ')}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setFailures(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusPicker({ projects, onPick }: { projects: string[]; onPick: (name: string) => void }) {
  const statuses = useSchemaValuesMany(projects, 'statuses');
  return (
    <ValueCommand
      placeholder="Set status"
      loading={statuses.isPending}
      selected={null}
      options={dedupeByName(statuses.values.filter(s => !s.is_archived)).map(s => ({
        name: s.name,
        mark: <StatusDot category={s.category} color={s.color} />,
      }))}
      onSelect={onPick}
    />
  );
}

function ValuePicker({
  projects,
  table,
  onPick,
}: {
  projects: string[];
  table: 'priorities' | 'types';
  onPick: (name: string) => void;
}) {
  const values = useSchemaValuesMany(projects, table);
  return (
    <ValueCommand
      placeholder={table === 'priorities' ? 'Set priority' : 'Set type'}
      loading={values.isPending}
      selected={null}
      options={dedupeByName(values.values).map(v => ({
        name: v.name,
        mark: table === 'priorities' ? <PriorityBadge priority={v} /> : <TypeBadge type={v} />,
      }))}
      onSelect={onPick}
    />
  );
}

function AssignPicker({
  projects,
  mode,
  onMode,
  draft,
  onDraft,
  onApply,
}: {
  projects: string[];
  mode: AssignMode;
  onMode: (mode: AssignMode) => void;
  draft: string[];
  onDraft: (draft: string[]) => void;
  onApply: () => void;
}) {
  const assignees = useProjectAssigneesMany(projects);
  const people = useMemo(() => {
    const seen = new Set<string>();
    return assignees.people.filter(p => (seen.has(p.username) ? false : (seen.add(p.username), true)));
  }, [assignees.people]);

  return (
    <div>
      <div className="border-b p-2">
        <Segmented ariaLabel="Assignment mode" value={mode} options={ASSIGN_MODES} onChange={onMode} />
      </div>
      <AssigneeCommand
        people={people}
        loading={assignees.isPending}
        selected={draft}
        onToggle={username =>
          onDraft(draft.includes(username) ? draft.filter(u => u !== username) : [...draft, username])
        }
      />
      <div className="flex items-center justify-between border-t px-3 py-2 text-2xs text-text-muted">
        <span>
          {mode === 'replace' && draft.length === 0
            ? 'Everyone will be unassigned'
            : `${draft.length} ${draft.length === 1 ? 'person' : 'people'}`}
        </span>
        <Button size="xs" onClick={onApply} disabled={mode !== 'replace' && draft.length === 0}>
          Apply
        </Button>
      </div>
    </div>
  );
}

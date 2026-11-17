'use client';

import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatDuration } from '@nothingleft/format';
import type { Member, Organization } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@components/dialog';
import { RadioGroup, RadioGroupItem } from '@components/ui/radio-group';
import { Skeleton } from '@components/ui/skeleton';
import { FormAlert } from '@components/auth/form-alert';
import { MemberPicker } from '@components/organization/member-picker';
import { useApiError } from '@hooks/use-api-error';
import { useMembers, useRemovalPreview, useRemoveMember } from '@hooks/use-members';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import { cn } from '@lib/utils';
import { PendingButton } from '@components/pending-button';

type IssueChoice = 'reassign' | 'unassign';
type ViewChoice = 'delete' | 'transfer';

interface RemoveMemberDialogProps {
  organization: Organization;
  member: Member | null;
  onClose: () => void;
}

// Keyed by the member so each opening starts from the defaults.
export function RemoveMemberDialog({ organization, member, onClose }: RemoveMemberDialogProps) {
  return (
    <Dialog open={member !== null} onOpenChange={open => (open ? null : onClose())}>
      <DialogContent
        className="sm:max-w-2xl"
        onOpenAutoFocus={event => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).focus();
        }}
      >
        {member ? (
          <RemovalForm key={member.username} organization={organization} member={member} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RemovalForm({
  organization,
  member,
  onClose,
}: {
  organization: Organization;
  member: Member;
  onClose: () => void;
}) {
  const preview = useRemovalPreview(organization.slug, member.username);
  const everyone = useMembers(organization.slug, { limit: 100 });
  const remove = useRemoveMember(organization.slug);
  const error = useApiError(remove.error ?? preview.error, ['reassign_to', 'transfer_views_to']);
  const calendar = useWorkCalendar();

  const [issueChoice, setIssueChoice] = useState<IssueChoice | null>(null);
  const [reassignTo, setReassignTo] = useState<string | null>(null);
  const [viewChoice, setViewChoice] = useState<ViewChoice>('delete');
  const [transferTo, setTransferTo] = useState<string | null>(null);

  const data = preview.data;
  const candidates = data?.reassign_candidates ?? [];
  const hasOpen = (data?.open_assigned ?? 0) > 0;
  const hasViews = (data?.saved_views ?? 0) > 0;
  const issues: IssueChoice = issueChoice ?? (candidates.length > 0 ? 'reassign' : 'unassign');
  const transferTargets = (everyone.data ?? []).filter(m => m.username !== member.username);

  const ready =
    data !== undefined &&
    (!hasOpen || issues === 'unassign' || reassignTo !== null) &&
    (!hasViews || viewChoice === 'delete' || transferTo !== null);

  const submit = () => {
    remove.mutate(
      {
        username: member.username,
        choices: {
          ...(hasOpen && issues === 'reassign' && reassignTo ? { reassign_to: reassignTo } : {}),
          ...(hasViews && viewChoice === 'transfer' && transferTo ? { transfer_views_to: transferTo } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(`${member.name} was removed from ${organization.name}.`);
          onClose();
        },
      },
    );
  };

  // A refusal is about the choice it was sent with; a new choice clears it.
  const choose =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      if (remove.isError) remove.reset();
    };
  const absent = data ? KEPT.filter(row => (data[row.key] ?? 0) === 0).map(row => row.none) : [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          Remove {member.name} from {organization.name}
        </DialogTitle>
        <DialogDescription className="text-xs leading-5 text-text-secondary">
          Their account and any other organisations are untouched, and their name stays on everything they did here.
          Their username stays reserved if you add them again.
        </DialogDescription>
      </DialogHeader>

      {error.summary ? (
        <FormAlert
          title={remove.error ? `${member.name} was not removed.` : 'What removal changes could not be loaded.'}
        >
          {error.summary}
        </FormAlert>
      ) : null}

      <div className="overflow-x-auto">
        <div role="table" aria-label="What removal changes" className="min-w-[520px] border-y text-sm">
          <Row
            label="Open issues assigned"
            count={data?.open_assigned}
            below={
              hasOpen && issues === 'reassign' ? (
                <div className="flex flex-col gap-1.5">
                  <MemberPicker
                    people={candidates}
                    value={reassignTo}
                    onChange={choose(setReassignTo)}
                    placeholder="Choose a member"
                    label="Reassign open issues to"
                    invalid={error.fields['reassign_to'] !== undefined}
                  />
                  {error.fields['reassign_to'] ? (
                    <FieldProblem>{error.fields['reassign_to']}</FieldProblem>
                  ) : reassignTo === null ? (
                    <span className="text-xs text-text-secondary">
                      Choose who takes{' '}
                      {data!.open_assigned === 1 ? 'the open issue' : `the ${data!.open_assigned} open issues`}, or
                      leave {data!.open_assigned === 1 ? 'it' : 'them'} unassigned.
                    </span>
                  ) : null}
                </div>
              ) : hasOpen && candidates.length === 0 ? (
                <span className="text-xs text-text-secondary">
                  Nobody else can be assigned in every project these issues are in.
                </span>
              ) : null
            }
          >
            {!data ? (
              <Skeleton className="h-3 w-40" />
            ) : !hasOpen ? (
              <Unchanged>Nothing to reassign</Unchanged>
            ) : candidates.length === 0 ? (
              <span>Left unassigned</span>
            ) : (
              <Choice
                value={issues}
                onChange={choose((v: string) => setIssueChoice(v as IssueChoice))}
                label="Open issues"
                options={[
                  { value: 'reassign', label: 'Reassign' },
                  { value: 'unassign', label: 'Leave unassigned' },
                ]}
              />
            )}
          </Row>
          {KEPT.filter(row => !data || (data[row.key] ?? 0) > 0).map(row => (
            <Row
              key={row.key}
              label={row.label}
              count={data?.[row.key]}
              {...(row.key === 'time_logged_minutes'
                ? { format: (m: number) => formatDuration(m, calendar), mono: true }
                : {})}
            >
              <Unchanged />
            </Row>
          ))}
          <Row
            label="Saved views"
            count={data?.saved_views}
            below={
              hasViews && viewChoice === 'transfer' ? (
                <div className="flex flex-col gap-1.5">
                  <MemberPicker
                    people={transferTargets}
                    value={transferTo}
                    onChange={choose(setTransferTo)}
                    placeholder="Choose a member"
                    label="Transfer saved views to"
                    loading={everyone.isPending}
                    invalid={error.fields['transfer_views_to'] !== undefined}
                  />
                  {error.fields['transfer_views_to'] ? (
                    <FieldProblem>{error.fields['transfer_views_to']}</FieldProblem>
                  ) : transferTo === null ? (
                    <span className="text-xs text-text-secondary">
                      {data!.saved_views === 1
                        ? 'Choose who gets the saved view, or delete it.'
                        : `Choose who gets the ${data!.saved_views} saved views, or delete them.`}
                    </span>
                  ) : null}
                </div>
              ) : null
            }
          >
            {!data ? (
              <Skeleton className="h-3 w-32" />
            ) : !hasViews ? (
              <Unchanged>Nothing to move</Unchanged>
            ) : (
              <Choice
                value={viewChoice}
                onChange={choose((v: string) => setViewChoice(v as ViewChoice))}
                label="Saved views"
                options={[
                  { value: 'delete', label: 'Delete' },
                  { value: 'transfer', label: 'Transfer' },
                ]}
              />
            )}
          </Row>
          <Row label="Active sessions" count={data?.sessions}>
            <Revoked count={data?.sessions} outcome="Signed out on removal" />
          </Row>
          <Row label="Access tokens" count={data?.access_tokens} last>
            <Revoked count={data?.access_tokens} outcome="Revoked on removal" />
          </Row>
        </div>
        {absent.length > 0 ? (
          <p className="pt-2 text-xs text-text-secondary">They have no {listOf(absent)} here.</p>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={remove.isPending}>
          Cancel
        </Button>
        <PendingButton
          variant="destructive"
          onClick={submit}
          disabled={!ready}
          pending={remove.isPending}
          pendingLabel="Removing…"
        >
          Remove member
        </PendingButton>
      </DialogFooter>
    </>
  );
}

interface RowProps {
  label: string;
  count: number | undefined;
  format?: (n: number) => string;
  mono?: boolean;
  last?: boolean;
  /** Shown under the choice, in its column: the picker a choice needs. */
  below?: ReactNode;
  children: ReactNode;
}

function Row({ label, count, format = String, mono, last, below, children }: RowProps) {
  return (
    <div
      role="row"
      className={cn(
        'grid min-h-row grid-cols-[minmax(0,11rem)_4.5rem_minmax(0,1fr)] items-center gap-x-4 py-1.5',
        !last && 'border-b border-border-subtle',
      )}
    >
      <span role="rowheader" className="text-text-secondary">
        {label}
      </span>
      <span role="cell" className={cn('text-right tabular', mono && 'font-mono text-xs')}>
        {count === undefined ? <Skeleton className="ml-auto h-3 w-8" /> : format(count)}
      </span>
      <span role="cell" className="min-w-0">
        {children}
      </span>
      {below ? <div className="col-start-3 max-w-72 pt-1.5 pb-0.5">{below}</div> : null}
    </div>
  );
}

const KEPT = [
  { key: 'resolved_assigned', label: 'Resolved issues assigned', none: 'resolved issues' },
  { key: 'created', label: 'Issues created', none: 'created issues' },
  { key: 'comments', label: 'Comments', none: 'comments' },
  { key: 'time_logged_minutes', label: 'Time logged', none: 'logged time' },
] as const;

const listOf = (items: readonly string[]) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;

function Revoked({ count, outcome }: { count: number | undefined; outcome: string }) {
  return count === 0 ? <Unchanged>None to revoke</Unchanged> : <span className="text-text-secondary">{outcome}</span>;
}

function FieldProblem({ children }: { children: ReactNode }) {
  return (
    <span role="alert" className="text-xs text-danger-fg">
      {children}
    </span>
  );
}

function Unchanged({ children = 'Unchanged' }: { children?: ReactNode }) {
  return <span className="text-text-muted">{children}</span>;
}

interface ChoiceOption {
  value: string;
  label: string;
}

function Choice({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: ChoiceOption[];
}) {
  const id = useId();
  return (
    <RadioGroup value={value} onValueChange={onChange} aria-label={label} className="flex flex-wrap gap-x-5 gap-y-1.5">
      {options.map(option => (
        <div key={option.value} className="flex items-center gap-2">
          <RadioGroupItem id={`${id}-${option.value}`} value={option.value} />
          <label htmlFor={`${id}-${option.value}`} className="shrink-0 cursor-pointer">
            {option.label}
          </label>
        </div>
      ))}
    </RadioGroup>
  );
}

'use client';

import { useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { formatDuration } from '@nothingleft/format';
import type { Member, Organization } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@components/ui/radio-group';
import { Skeleton } from '@components/ui/skeleton';
import { FormAlert } from '@components/auth/form-alert';
import { MemberPicker } from '@components/organization/member-picker';
import { useApiError } from '@hooks/use-api-error';
import { useMembers, useRemovalPreview, useRemoveMember } from '@hooks/use-members';
import { useWorkCalendar } from '@hooks/use-work-calendar';
import { cn } from '@lib/utils';

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
      <DialogContent className="sm:max-w-2xl">
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
  const error = useApiError(remove.error ?? preview.error);
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

  const fieldError = error.fields['reassign_to'] ?? error.fields['transfer_views_to'];

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

      {error.summary || fieldError ? <FormAlert title={error.summary ?? fieldError!} /> : null}

      <div className="overflow-x-auto">
        <div role="table" aria-label="What removal changes" className="min-w-[520px] border-y text-sm">
          <Row
            label="Open issues assigned"
            count={data?.open_assigned}
            below={
              hasOpen && issues === 'reassign' ? (
                <MemberPicker
                  people={candidates}
                  value={reassignTo}
                  onChange={setReassignTo}
                  placeholder="Choose who takes them"
                  label="Reassign open issues to"
                />
              ) : hasOpen && candidates.length === 0 ? (
                <span className="text-xs text-text-secondary">
                  Nobody else can be assigned in every project these issues are in.
                </span>
              ) : null
            }
          >
            {!hasOpen ? (
              <Unchanged>Nothing to reassign</Unchanged>
            ) : (
              <Choice
                value={issues}
                onChange={v => setIssueChoice(v as IssueChoice)}
                label="Open issues"
                options={[
                  { value: 'reassign', label: 'Reassign', disabled: candidates.length === 0 },
                  { value: 'unassign', label: 'Leave unassigned' },
                ]}
              />
            )}
          </Row>
          <Row label="Resolved issues assigned" count={data?.resolved_assigned}>
            <Unchanged />
          </Row>
          <Row label="Issues created" count={data?.created}>
            <Unchanged />
          </Row>
          <Row label="Comments" count={data?.comments}>
            <Unchanged />
          </Row>
          <Row
            label="Time logged"
            count={data?.time_logged_minutes}
            format={minutes => (minutes === 0 ? '0m' : formatDuration(minutes, calendar))}
            mono
          >
            <Unchanged />
          </Row>
          <Row
            label="Saved views"
            count={data?.saved_views}
            below={
              hasViews && viewChoice === 'transfer' ? (
                <MemberPicker
                  people={transferTargets}
                  value={transferTo}
                  onChange={setTransferTo}
                  placeholder="Choose who gets them"
                  label="Transfer saved views to"
                  loading={everyone.isPending}
                />
              ) : null
            }
          >
            {!hasViews ? (
              <Unchanged>Nothing to move</Unchanged>
            ) : (
              <Choice
                value={viewChoice}
                onChange={v => setViewChoice(v as ViewChoice)}
                label="Saved views"
                options={[
                  { value: 'delete', label: 'Delete' },
                  { value: 'transfer', label: 'Transfer' },
                ]}
              />
            )}
          </Row>
          <Row label="Active sessions" count={data?.sessions}>
            <span>Access revoked</span>
          </Row>
          <Row label="Access tokens" count={data?.access_tokens} last>
            <span>Access revoked</span>
          </Row>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={remove.isPending}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={submit} disabled={!ready || remove.isPending}>
          {remove.isPending ? 'Removing…' : 'Remove member'}
        </Button>
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

function Unchanged({ children = 'Unchanged' }: { children?: ReactNode }) {
  return <span className="text-text-muted">{children}</span>;
}

interface ChoiceOption {
  value: string;
  label: string;
  disabled?: boolean;
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
          <RadioGroupItem id={`${id}-${option.value}`} value={option.value} disabled={option.disabled} />
          <label
            htmlFor={`${id}-${option.value}`}
            className={cn('shrink-0 cursor-pointer', option.disabled && 'cursor-not-allowed text-text-disabled')}
          >
            {option.label}
          </label>
        </div>
      ))}
    </RadioGroup>
  );
}

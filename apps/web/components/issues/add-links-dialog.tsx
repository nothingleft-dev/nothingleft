'use client';

import { useState } from 'react';
import { Check, CircleAlert, X } from 'lucide-react';
import { ISSUE_LINK_NAME_VALUES, type IssueLinkName, type IssueRef } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/dialog';
import { FormAlert } from '@components/auth/form-alert';
import { ChoiceSelect, type ChoiceOption } from '@components/choice-select';
import { IssueKey } from '@components/issue-key';
import { PickerSkeleton } from '@components/issues/pickers';
import { TypeBadge } from '@components/issues/value-marks';
import { useDebounced } from '@hooks/use-debounced';
import { useAddIssueLinks } from '@hooks/use-issue-links';
import { useIssueRefSearch } from '@hooks/use-issues';
import { isApiError } from '@lib/api/errors';
import { PendingButton } from '@components/pending-button';
import { cn } from '@lib/utils';

const HINTS: Record<IssueLinkName, string> = {
  'relates to': 'Connected, with no order between them.',
  'is required for': 'The other issue cannot be finished before this one.',
  'depends on': 'This issue cannot be finished before the other one.',
  'is duplicated by': 'The other issue repeats this one.',
  duplicates: 'This issue repeats the other one.',
  'parent for': 'The other issues become subtasks of this one.',
  'subtask of': 'The other issue becomes this one’s parent.',
};

export const linkLabel = (link: string) => link.charAt(0).toUpperCase() + link.slice(1);

export const LINK_OPTIONS: ChoiceOption<IssueLinkName>[] = ISSUE_LINK_NAME_VALUES.map(name => ({
  value: name,
  label: linkLabel(name),
  hint: HINTS[name],
}));

interface AddLinksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issueKey: string;
  issueTitle: string;
  projectKey: string;
  initialLink?: IssueLinkName;
}

export function AddLinksDialog({ open, onOpenChange, ...rest }: AddLinksDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4">
        {open ? <AddLinksForm {...rest} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddLinksForm({
  issueKey,
  issueTitle,
  projectKey,
  initialLink = 'relates to',
  onDone,
}: Omit<AddLinksDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const [link, setLink] = useState<IssueLinkName>(initialLink);
  const [chosen, setChosen] = useState<IssueRef[]>([]);
  const add = useAddIssueLinks(issueKey);
  const error = add.error ? (isApiError(add.error) ? add.error.message : 'The links could not be added.') : null;

  const submit = () => {
    if (chosen.length === 0) return;
    add.mutate({ link, issues: chosen.map(i => i.key) }, { onSuccess: onDone });
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Add links</DialogTitle>
        <DialogDescription className="text-xs break-words text-text-secondary">
          From <span className="font-mono text-text">{issueKey}</span> {issueTitle}
        </DialogDescription>
      </DialogHeader>

      <ChoiceSelect
        label="Link"
        value={link}
        options={LINK_OPTIONS}
        onChange={value => {
          setLink(value);
          add.reset();
        }}
        showHint
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">
          Issues <span className="font-normal text-text-muted">· pick one or more</span>
        </span>
        {chosen.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
            {chosen.map(issue => (
              <li key={issue.key} className="flex h-row items-center gap-2 pr-1 pl-2 text-sm">
                <TypeBadge type={issue.type} />
                <IssueKey issueKey={issue.key} resolved={issue.resolved} column />
                <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${issue.key}`}
                  onClick={() => {
                    setChosen(c => c.filter(i => i.key !== issue.key));
                    add.reset();
                  }}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <LinkTargetSearch
          projectKey={projectKey}
          exclude={[issueKey]}
          chosen={chosen.map(i => i.key)}
          onPick={issue => {
            setChosen(c => (c.some(i => i.key === issue.key) ? c.filter(i => i.key !== issue.key) : [...c, issue]));
            add.reset();
          }}
        />
      </div>

      {error ? <FormAlert title={error} /> : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <PendingButton type="submit" disabled={chosen.length === 0} pending={add.isPending} pendingLabel="Adding…">
          {chosen.length === 1 ? 'Add link' : chosen.length > 1 ? `Add ${chosen.length} links` : 'Add links'}
        </PendingButton>
      </DialogFooter>
    </form>
  );
}

interface LinkTargetSearchProps {
  projectKey: string | null;
  /** Keys never offered, such as the issue itself. */
  exclude: readonly string[];
  /** Makes the list a multi-select: rows stay after a pick, ticked, and picking one again unpicks it. */
  chosen?: readonly string[];
  onPick: (issue: IssueRef) => void;
}

export function LinkTargetSearch({ projectKey, exclude, chosen, onPick }: LinkTargetSearchProps) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 200);
  const results = useIssueRefSearch(debounced, projectKey);
  const options = (results.data ?? []).filter(i => !exclude.includes(i.key));

  return (
    <Command shouldFilter={false} className="rounded-md border">
      <CommandInput placeholder="Find by key or title" value={search} onValueChange={setSearch} />
      <CommandList className="max-h-56">
        {results.isPending ? (
          <PickerSkeleton rows={4} />
        ) : results.isError ? (
          <div role="alert" className="flex items-center gap-2 px-3 py-3 text-sm">
            <CircleAlert aria-hidden className="size-icon-sm flex-none text-danger-fg" />
            <span className="flex-1 text-text-secondary">The search could not run.</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void results.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <CommandEmpty className="px-3 py-3 text-sm text-text-secondary">No issue matches.</CommandEmpty>
        )}
        {options.map(issue => (
          <CommandItem
            key={issue.key}
            value={issue.key}
            data-checked={chosen ? chosen.includes(issue.key) : undefined}
            onSelect={() => {
              onPick(issue);
              if (!chosen) setSearch('');
            }}
          >
            <TypeBadge type={issue.type} />
            <IssueKey issueKey={issue.key} resolved={issue.resolved} column />
            <span className="min-w-0 flex-1 truncate">{issue.title}</span>
            {chosen ? <Tick checked={chosen.includes(issue.key)} /> : null}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

function Tick({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-4 flex-none place-items-center rounded-[4px] border border-border-strong',
        checked && 'border-text bg-text',
      )}
    >
      {checked ? <Check className="size-3 text-surface" strokeWidth={3} /> : null}
    </span>
  );
}

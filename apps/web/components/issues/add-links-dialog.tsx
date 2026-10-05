'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
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
} from '@components/ui/dialog';
import { FormAlert } from '@components/auth/form-alert';
import { ChoiceSelect, type ChoiceOption } from '@components/choice-select';
import { IssueKey } from '@components/issue-key';
import { PickerSkeleton } from '@components/issues/pickers';
import { TypeBadge } from '@components/issues/value-marks';
import { useDebounced } from '@hooks/use-debounced';
import { useAddIssueLinks } from '@hooks/use-issue-links';
import { useIssueRefSearch } from '@hooks/use-issues';
import { isApiError } from '@lib/api/errors';

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
        <DialogDescription className="text-xs text-text-secondary">
          From <span className="font-mono text-text">{issueKey}</span> {issueTitle}
        </DialogDescription>
      </DialogHeader>

      {error ? <FormAlert title={error} /> : null}

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
        <span className="text-sm font-medium text-text-secondary">Issues</span>
        {chosen.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border-subtle rounded-md border">
            {chosen.map(issue => (
              <li key={issue.key} className="flex h-row items-center gap-2 pr-1 pl-2.5 text-sm">
                <TypeBadge type={issue.type} />
                <IssueKey issueKey={issue.key} resolved={issue.resolved} />
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
          exclude={[issueKey, ...chosen.map(i => i.key)]}
          onPick={issue => {
            setChosen(c => [...c, issue]);
            add.reset();
          }}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={chosen.length === 0 || add.isPending}>
          {add.isPending ? 'Adding…' : chosen.length > 1 ? `Add ${chosen.length} links` : 'Add link'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface LinkTargetSearchProps {
  projectKey: string | null;
  /** Keys never offered: the issue itself and those already chosen. */
  exclude: readonly string[];
  onPick: (issue: IssueRef) => void;
}

export function LinkTargetSearch({ projectKey, exclude, onPick }: LinkTargetSearchProps) {
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 200);
  const results = useIssueRefSearch(debounced, projectKey);
  const options = (results.data ?? []).filter(i => !exclude.includes(i.key));

  return (
    <Command shouldFilter={false} className="rounded-md border">
      <CommandInput placeholder="Find by key or title" value={search} onValueChange={setSearch} />
      <CommandList className="max-h-56">
        {results.isPending ? <PickerSkeleton rows={4} /> : <CommandEmpty>No issue matches.</CommandEmpty>}
        {options.map(issue => (
          <CommandItem
            key={issue.key}
            value={issue.key}
            onSelect={() => {
              onPick(issue);
              setSearch('');
            }}
          >
            <TypeBadge type={issue.type} />
            <IssueKey issueKey={issue.key} resolved={issue.resolved} className="flex-none" />
            <span className="min-w-0 flex-1 truncate">{issue.title}</span>
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { GIT_MERGE_BASE_BRANCHES_MAX, type GitRepository } from '@nothingleft/types';
import { Input } from '@components/ui/input';

interface BranchChipsProps {
  repository: Pick<GitRepository, 'full_name' | 'default_branch' | 'merge_base_branches'>;
  onChange: (branches: string[] | null) => void;
  disabled?: boolean;
}

/**
 * The branches a merge into counts as merged. Null follows the repository's default branch;
 * removing the last chip goes back to that.
 */
export function BranchChips({ repository, onChange, disabled }: BranchChipsProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const custom = repository.merge_base_branches;
  const shown = custom ?? [repository.default_branch];

  const add = () => {
    const name = draft.trim();
    setDraft('');
    setAdding(false);
    if (!name || shown.includes(name)) return;
    onChange([...shown, name]);
  };

  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map(branch => (
        <span
          key={branch}
          className="inline-flex h-6 items-center gap-1 rounded-sm border bg-surface pr-1 pl-1.5 font-mono text-2xs"
        >
          {branch}
          {custom === null ? <span className="font-sans text-text-muted">default</span> : null}
          {custom !== null && !disabled ? (
            <button
              type="button"
              aria-label={`Stop counting merges into ${branch}`}
              className="grid size-4 place-items-center rounded-xs text-text-muted hover:bg-hover hover:text-text"
              onClick={() => {
                const next = shown.filter(b => b !== branch);
                onChange(next.length === 0 ? null : next);
              }}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
      {disabled ? null : adding ? (
        <Input
          autoFocus
          value={draft}
          aria-label={`Add a branch for ${repository.full_name}`}
          placeholder="release/*"
          className="h-6 w-32 px-1.5 font-mono text-2xs"
          onChange={event => setDraft(event.target.value)}
          onBlur={add}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
            if (event.key === 'Escape') {
              setDraft('');
              setAdding(false);
            }
          }}
        />
      ) : shown.length < GIT_MERGE_BASE_BRANCHES_MAX ? (
        <button
          type="button"
          aria-label={`Add a branch for ${repository.full_name}`}
          className="grid size-6 place-items-center rounded-sm border border-dashed text-text-muted hover:border-border-strong hover:text-text"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

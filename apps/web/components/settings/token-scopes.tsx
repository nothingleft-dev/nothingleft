'use client';

import { PAT_SCOPES, type PatScope } from '@nothingleft/types';
import { Checkbox } from '@components/ui/checkbox';

const SCOPE_HINTS: Record<PatScope, string> = {
  'issues:read': 'Read issues, comments, attachments and reports.',
  'issues:write': 'Create and edit issues, tags, links, files and shared views.',
  'comments:write': 'Write and edit comments.',
  'time:write': 'Log and edit work items.',
  'admin:project': 'Project settings, members and configuration.',
  'admin:org': 'Organisation settings, members and invites.',
};

export function ScopeChecklist({ value, onChange }: { value: PatScope[]; onChange: (next: PatScope[]) => void }) {
  const toggle = (scope: PatScope) =>
    onChange(value.includes(scope) ? value.filter(s => s !== scope) : [...value, scope]);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 font-medium">Scopes</legend>
      {PAT_SCOPES.map(scope => (
        <label key={scope} className="flex cursor-pointer items-start gap-2">
          <Checkbox className="mt-0.5" checked={value.includes(scope)} onCheckedChange={() => toggle(scope)} />
          <span className="flex flex-col">
            <span className="font-mono tabular text-xs">{scope}</span>
            <span className="text-2xs text-text-muted">{SCOPE_HINTS[scope]}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

'use client';

import { useState } from 'react';
import { parseIssueKey } from '@nothingleft/format';
import type { Automation, AutomationTestResult } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Label } from '@components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/ui/dialog';
import { FormAlert } from '@components/auth/form-alert';
import { useTestAutomation } from '@hooks/use-automations';
import { SKIP_REASON } from '@lib/git/words';

interface TestDialogProps {
  projectKey: string;
  rule: Automation | null;
  onClose: () => void;
}

/** A dry run: what the rule would do to one issue now, if its trigger fired. Nothing changes. */
export function TestDialog({ projectKey, rule, onClose }: TestDialogProps) {
  return (
    <Dialog open={rule !== null} onOpenChange={open => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        {rule ? <TestForm key={rule.name} projectKey={projectKey} rule={rule} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function describe(issue: string, result: AutomationTestResult): string {
  const status = result.changes?.status as { from?: string; to?: string } | undefined;
  if (result.result === 'would_apply' && status?.to) return `Would move ${issue} from ${status.from} to ${status.to}.`;
  return `Would leave ${issue} alone: ${result.reason ? SKIP_REASON[result.reason] : 'nothing to change'}.`;
}

function TestForm({ projectKey, rule, onClose }: { projectKey: string; rule: Automation; onClose: () => void }) {
  const [issue, setIssue] = useState(`${projectKey}-`);
  const [error, setError] = useState<string | null>(null);
  const test = useTestAutomation(projectKey);
  const key = issue.trim().toUpperCase();

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={event => {
        event.preventDefault();
        if (!parseIssueKey(key)) {
          setError(`An issue key, such as ${projectKey}-12.`);
          return;
        }
        setError(null);
        test.mutate({ name: rule.name, issue: key }, { onError: e => setError(e.message) });
      }}
    >
      <DialogHeader>
        <DialogTitle>Test {rule.name}</DialogTitle>
        <DialogDescription>{rule.sentence} The test changes nothing.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="test-issue">Issue</Label>
        <Input
          id="test-issue"
          autoFocus
          value={issue}
          className="w-40 font-mono text-xs"
          aria-invalid={error !== null}
          onChange={event => {
            setIssue(event.target.value);
            setError(null);
            test.reset();
          }}
        />
        {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
      </div>
      {test.data ? (
        <FormAlert tone={test.data.result === 'would_apply' ? 'success' : 'warning'} title={describe(key, test.data)}>
          {test.data.result === 'would_apply'
            ? 'This is what happens when the trigger next fires on it.'
            : 'Change the rule’s conditions if it should have acted.'}
        </FormAlert>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button type="submit" disabled={test.isPending}>
          {test.isPending ? 'Testing…' : 'Test'}
        </Button>
      </DialogFooter>
    </form>
  );
}

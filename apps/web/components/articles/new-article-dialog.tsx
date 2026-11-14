'use client';

import { useId, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { ClipboardList, FilePlus2, Scale, UserPlus, type LucideIcon } from 'lucide-react';
import { ARTICLE_HIERARCHY_MAX_DEPTH, type ArticleNode } from '@nothingleft/types';
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
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { ChoiceSelect, type ChoiceOption } from '@components/choice-select';
import { Kbd } from '@components/kbd';
import { useCreateArticle } from '@hooks/use-articles';
import { isApiError } from '@lib/api/errors';
import { STARTERS, starterById, type Starter, type StarterId } from '@lib/articles/starters';
import { cn } from '@lib/utils';
import { PendingButton } from '@components/pending-button';

const TOP = '__top__';

const STARTER_ICON: Record<StarterId, LucideIcon> = {
  runbook: ClipboardList,
  decision: Scale,
  onboarding: UserPlus,
  blank: FilePlus2,
};

export const starterCardClass =
  'flex h-full w-full cursor-pointer items-start gap-2.5 rounded-md border bg-surface px-3 py-2.5 text-left hover:border-border-strong hover:bg-hover';

/** The face of a starter, the same in the empty knowledge base and in the New article dialog. */
export function StarterCardBody({ starter, end }: { starter: Starter; end?: ReactNode }) {
  const Icon = STARTER_ICON[starter.id];
  return (
    <>
      <Icon aria-hidden className="mt-0.5 size-icon-sm flex-none text-text-secondary" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{starter.name}</span>
        <span className="text-xs text-text-secondary">{starter.description}</span>
      </span>
      {end}
    </>
  );
}

export interface NewArticleRequest {
  parent: string | null;
  starter: StarterId;
}

interface NewArticleDialogProps {
  project: string;
  nodes: readonly ArticleNode[];
  request: NewArticleRequest | null;
  onOpenChange: (open: boolean) => void;
}

export function NewArticleDialog({ project, nodes, request, onOpenChange }: NewArticleDialogProps) {
  return (
    <Dialog open={request !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {request ? (
          <NewArticleForm project={project} nodes={nodes} initial={request} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NewArticleForm({
  project,
  nodes,
  initial,
  onDone,
}: {
  project: string;
  nodes: readonly ArticleNode[];
  initial: NewArticleRequest;
  onDone: () => void;
}) {
  const id = useId();
  const router = useRouter();
  const create = useCreateArticle(project);
  const [title, setTitle] = useState('');
  const [starter, setStarter] = useState<StarterId>(initial.starter);
  const [parent, setParent] = useState(initial.parent ?? TOP);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ body: string; key: string } | null>(null);

  const titles = new Map(nodes.map(n => [n.slug, n.title]));
  const parents: ChoiceOption<string>[] = [
    { value: TOP, label: 'Top level', hint: 'Not under another article' },
    ...nodes
      .filter(n => n.depth < ARTICLE_HIERARCHY_MAX_DEPTH)
      .map(n => ({
        value: n.slug,
        label: n.title,
        hint: n.parent ? `Under ${titles.get(n.parent) ?? n.parent}` : 'At the top level',
      })),
  ];

  const submit = () => {
    const name = title.trim();
    if (!name) {
      setTitleError('Give the article a title. Its address is made from it.');
      return;
    }
    const body = {
      title: name,
      status: 'draft' as const,
      ...(starterById(starter).body ? { body_md: starterById(starter).body } : {}),
      ...(parent !== TOP ? { parent } : {}),
    };
    const signature = JSON.stringify(body);
    if (attempt.current?.body !== signature) attempt.current = { body: signature, key: crypto.randomUUID() };
    setError(null);
    create.mutate(
      { body, idempotencyKey: attempt.current.key },
      {
        onSuccess: article => {
          onDone();
          router.push(`/projects/${project}/articles/${article.slug}?edit=1` as Route);
        },
        onError: e => {
          if (isApiError(e) && e.field === 'title') setTitleError(e.message);
          else setError(isApiError(e) ? e.message : 'The article could not be created.');
        },
      },
    );
  };

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={e => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>New article</DialogTitle>
        <DialogDescription>It starts as a draft that only you and the project&apos;s admins can see.</DialogDescription>
      </DialogHeader>

      {error ? <FormAlert title={error} /> : null}

      <Field
        label="Title"
        autoFocus
        value={title}
        placeholder="e.g. Restoring a failed sync"
        onChange={e => {
          setTitle(e.target.value);
          setTitleError(undefined);
        }}
        error={titleError}
      />

      <div className="flex flex-col gap-1.5">
        <span id={`${id}-starter`} className="text-sm font-medium text-text-secondary">
          Start from
        </span>
        <RadioGroup
          value={starter}
          onValueChange={v => setStarter(v as StarterId)}
          aria-labelledby={`${id}-starter`}
          className="grid grid-cols-2 gap-2 max-sm:grid-cols-1"
        >
          {STARTERS.map(s => (
            <label
              key={s.id}
              htmlFor={`${id}-${s.id}`}
              className={cn(starterCardClass, starter === s.id && 'border-border-strong bg-active hover:bg-active')}
            >
              <StarterCardBody
                starter={s}
                end={<RadioGroupItem id={`${id}-${s.id}`} value={s.id} className="mt-0.5" />}
              />
            </label>
          ))}
        </RadioGroup>
      </div>

      {nodes.length > 0 ? <ChoiceSelect label="Place" value={parent} options={parents} onChange={setParent} /> : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <PendingButton
          type="submit"
          pending={create.isPending}
          pendingLabel="Creating…"
          after={<Kbd className="h-4 border-transparent bg-ink-fg/15 text-ink-fg/80">⌘↵</Kbd>}
        >
          Create draft
        </PendingButton>
      </DialogFooter>
    </form>
  );
}

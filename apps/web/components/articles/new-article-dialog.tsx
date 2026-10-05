'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
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
import { STARTERS, starterById, type StarterId } from '@lib/articles/starters';
import { cn } from '@lib/utils';

const TOP = '__top__';

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
        placeholder="Restoring a failed sync"
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
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 hover:border-border-strong hover:bg-hover',
                starter === s.id && 'border-border-strong bg-active',
              )}
            >
              <RadioGroupItem id={`${id}-${s.id}`} value={s.id} className="mt-0.5" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-text-secondary">{s.description}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      {nodes.length > 0 ? <ChoiceSelect label="Place" value={parent} options={parents} onChange={setParent} /> : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create draft'}
          <Kbd className="h-4 border-transparent bg-ink-fg/15 text-ink-fg/80">⌘↵</Kbd>
        </Button>
      </DialogFooter>
    </form>
  );
}

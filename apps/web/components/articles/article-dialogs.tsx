'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { toast } from 'sonner';
import type { Article, ArticleChildrenOnDelete } from '@nothingleft/types';
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
import { articlePath } from '@components/articles/article-row';
import { useDeleteArticle, useRestoreArticle, useUpdateArticle } from '@hooks/use-articles';
import { isApiError } from '@lib/api/errors';
import { cn } from '@lib/utils';

interface DeleteArticleDialogProps {
  article: Article;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteArticleDialog({ article, open, onOpenChange }: DeleteArticleDialogProps) {
  const id = useId();
  const router = useRouter();
  const project = article.project.key;
  const remove = useDeleteArticle(project);
  const restore = useRestoreArticle(project);
  const [children, setChildren] = useState<ArticleChildrenOnDelete>('move_up');
  // Children can appear after the page loaded; the API's refusal then asks the same question.
  const [askChildren, setAskChildren] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const withChildren = article.child_count > 0 || askChildren;
  const into = article.parent ? article.parent.title : 'the top level';

  const close = (next: boolean) => {
    if (!next) {
      setError(null);
      setChildren('move_up');
    }
    onOpenChange(next);
  };

  const confirm = () => {
    setError(null);
    remove.mutate(
      { slug: article.slug, ...(withChildren ? { children } : {}) },
      {
        onSuccess: deleted => {
          close(false);
          const parent = deleted.parent ?? article.parent;
          router.push(
            (parent ? `/projects/${project}/articles/${parent.slug}` : `/projects/${project}/articles`) as Route,
          );
          toast.success(`Deleted ${deleted.title}.`, {
            duration: 10_000,
            action: {
              label: 'Undo',
              onClick: () =>
                restore.mutateAsync(deleted.slug).then(
                  back => router.push(articlePath(back)),
                  (e: Error) => toast.error(e.message),
                ),
            },
          });
        },
        onError: e => {
          if (isApiError(e) && e.code === 'article.children_choice_required') setAskChildren(true);
          setError(isApiError(e) ? e.message : 'The article could not be deleted.');
        },
      },
    );
  };

  const count = article.child_count;
  const articlesUnder =
    count === 1 ? 'The article under it' : count > 1 ? `The ${count} articles under it` : 'The articles under it';

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Delete {article.title}?</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2 text-xs leading-5 text-text-secondary">
              <p>
                It leaves the knowledge base for everyone straight away. It can be restored for 14 days from{' '}
                <span className="font-medium text-text">Deleted articles</span>; after that it is gone, with its
                comments and files.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {withChildren ? (
          <div className="flex flex-col gap-2">
            <span id={`${id}-choice`} className="text-sm font-medium text-text-secondary">
              {articlesUnder}
            </span>
            <RadioGroup
              value={children}
              onValueChange={v => setChildren(v as ArticleChildrenOnDelete)}
              aria-labelledby={`${id}-choice`}
              className="gap-2"
            >
              <Choice
                id={`${id}-move`}
                value="move_up"
                on={children === 'move_up'}
                title="Move them up"
                detail={`They take its place under ${into}, in the same order.`}
              />
              <Choice
                id={`${id}-delete`}
                value="delete"
                on={children === 'delete'}
                title="Delete them too"
                detail="The whole branch goes, and comes back together if restored. A draft someone else is writing moves up instead."
              />
            </RadioGroup>
          </div>
        ) : null}

        {error ? <FormAlert title={error} /> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={remove.isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={remove.isPending}>
            {remove.isPending ? 'Working…' : withChildren && children === 'delete' ? 'Delete branch' : 'Delete article'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  id,
  value,
  on,
  title,
  detail,
}: {
  id: string;
  value: string;
  on: boolean;
  title: string;
  detail: string;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 hover:border-border-strong hover:bg-hover',
        on && 'border-border-strong bg-active',
      )}
    >
      <RadioGroupItem id={id} value={value} className="mt-0.5" />
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-text-secondary">{detail}</span>
      </span>
    </label>
  );
}

interface AddressDialogProps {
  article: Article;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ArticleAddressDialog({ article, open, onOpenChange }: AddressDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open ? <AddressForm article={article} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AddressForm({ article, onDone }: { article: Article; onDone: () => void }) {
  const router = useRouter();
  const [slug, setSlug] = useState(article.slug);
  const [error, setError] = useState<string | undefined>();
  const update = useUpdateArticle(article.project.key, article.slug);
  const prefix = `/projects/${article.project.key}/articles/`;

  const submit = () => {
    const next = slug.trim();
    if (!next || next === article.slug) return onDone();
    update.mutate(
      { body: { slug: next } },
      {
        onSuccess: saved => {
          onDone();
          router.replace(articlePath(saved));
        },
        onError: e => setError(isApiError(e) ? e.message : 'The address could not be changed.'),
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
    >
      <DialogHeader>
        <DialogTitle>Change the address</DialogTitle>
        <DialogDescription>
          Links to the old address stop working. Renaming the article never changes it; only this does.
        </DialogDescription>
      </DialogHeader>
      <Field
        label="Address"
        autoFocus
        value={slug}
        onChange={e => {
          setSlug(e.target.value);
          setError(undefined);
        }}
        error={error}
        hint="Letters, digits and hyphens. No other article in the project may use it."
        className="font-mono"
        below={<p className="truncate font-mono text-2xs text-text-muted">{prefix + (slug.trim() || '…')}</p>}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Change address'}
        </Button>
      </DialogFooter>
    </form>
  );
}

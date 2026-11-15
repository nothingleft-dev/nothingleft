'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  TagNameSchema,
  TAG_MERGE_MAX_SOURCES,
  TAG_NAME_MAX_LENGTH,
  type LabelColor,
  type Tag,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@components/dialog';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { ConfirmDialog } from '@components/confirm-dialog';
import { LabelColorPicker } from '@components/label-color-picker';
import { TagChip } from '@components/issues/issue-tags';
import { ReportMultiPicker, ReportPicker, type ReportOption } from '@components/reports/report-picker';
import { tagUsage } from '@components/organization/tags/tag-usage';
import { useDeleteTag, useManagedTags, useMergeTags, useUpdateTag } from '@hooks/use-tags';
import { isApiError } from '@lib/api/errors';
import { toastError } from '@components/toast-error';
import { PendingButton } from '@components/pending-button';

interface EditTagDialogProps {
  tag: Tag;
  orgAdmin: boolean;
  onClose: () => void;
  /** A name another tag holds: offered to Org Admins as a merge into that tag. */
  onMergeInstead: (tag: Tag, into: Tag) => void;
}

export function EditTagDialog({ tag, orgAdmin, onClose, onMergeInstead }: EditTagDialogProps) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState<LabelColor>(tag.color);
  const [invalid, setInvalid] = useState<string | null>(null);
  const update = useUpdateTag();
  const all = useManagedTags('');

  const error = update.error;
  const taken = isApiError(error) && error.code === 'tag.slug_taken' ? (error.validValues?.[0] ?? null) : null;
  const holder = taken ? (all.data?.tags.find(t => t.name === taken) ?? null) : null;
  const clash = taken
    ? taken.toLowerCase() === name.trim().toLowerCase()
      ? `“${taken}” already exists.`
      : `“${name.trim()}” would be the same tag as “${taken}”.`
    : undefined;
  const nameError = invalid ?? clash ?? (isApiError(error) && error.field === 'name' ? error.message : undefined);
  const otherError = error && !(isApiError(error) && error.field === 'name') ? error.message : null;

  const trimmed = name.trim();
  const renamed = trimmed !== tag.name;
  const recolored = color !== tag.color;

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = TagNameSchema.safeParse(name);
    if (!parsed.success) return setInvalid(`Give the tag a name of at most ${TAG_NAME_MAX_LENGTH} characters.`);
    setInvalid(null);
    if (!renamed && !recolored) return onClose();
    update.mutate(
      { tag, name: renamed ? parsed.data : undefined, color: recolored ? color : undefined },
      {
        onSuccess: fresh => {
          onClose();
          toast.success(renamed ? `Renamed ${tag.name} to ${fresh.name}` : `Recoloured ${fresh.name}`);
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {tag.name}</DialogTitle>
          <DialogDescription>
            The new name and colour show on every issue and article that has it, in every project.
          </DialogDescription>
        </DialogHeader>
        <form id="edit-tag" noValidate onSubmit={save} className="flex flex-col gap-4">
          {otherError ? <FormAlert title="The tag was not saved.">{otherError}</FormAlert> : null}
          <div className="flex flex-col gap-1.5">
            <Field
              label="Name"
              value={name}
              onChange={event => {
                setName(event.target.value);
                setInvalid(null);
                if (update.isError) update.reset();
              }}
              error={nameError}
              autoFocus
              below={
                renamed ? (
                  <p className="text-xs text-text-secondary">
                    Saved views that search for <span className="font-mono">tag: {tag.name}</span> follow the new name.
                  </p>
                ) : null
              }
            />
            {taken ? (
              orgAdmin && holder ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-xs text-text-secondary">Merge {tag.name} into it instead?</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => onMergeInstead(tag, holder)}>
                    Merge into {holder.name}
                  </Button>
                </div>
              ) : !orgAdmin ? (
                <p className="text-xs text-text-secondary">An Org Admin can merge the two.</p>
              ) : null
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Colour</span>
            <LabelColorPicker value={color} onChange={setColor} />
          </div>
          <div className="flex items-center gap-2 text-xs text-text-secondary">
            Preview <TagChip tag={{ name: trimmed || tag.name, slug: tag.slug, color }} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <PendingButton
            type="submit"
            form="edit-tag"
            disabled={!trimmed || taken !== null}
            pending={update.isPending}
            pendingLabel="Saving…"
          >
            Save
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const MERGE_ROW = 'grid h-row grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto] items-center gap-3 px-3';

const describe = (tag: Tag) => tagUsage(tag) ?? 'unused';

const tagOption = (tag: Tag): ReportOption => ({ value: tag.slug, label: tag.name });

interface MergeTagsDialogProps {
  initial: { tags: Tag[]; into: Tag | null };
  onClose: () => void;
}

export function MergeTagsDialog({ initial, onClose }: MergeTagsDialogProps) {
  const all = useManagedTags('');
  const merge = useMergeTags();
  const [sources, setSources] = useState<Tag[]>(initial.tags);
  const [into, setInto] = useState<Tag | null>(initial.into);

  const known = new Map((all.data?.tags ?? []).map(t => [t.slug, t]));
  for (const t of [...initial.tags, ...(initial.into ? [initial.into] : [])])
    if (!known.has(t.slug)) known.set(t.slug, t);
  const options = [...known.values()].map(tagOption);
  const ready = into !== null && sources.length > 0 && !sources.some(s => s.slug === into.slug);

  const confirm = () => {
    if (!into || !ready) return;
    merge.mutate(
      { tags: sources, into },
      {
        onSuccess: () => {
          onClose();
          toast.success(`Merged ${sources.map(s => s.name).join(', ')} into ${into.name}`);
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={open => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge tags</DialogTitle>
          <DialogDescription>
            Every issue and article with one of these tags gets the kept tag in its place, never twice.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {merge.error ? <FormAlert title="The tags were not merged.">{merge.error.message}</FormAlert> : null}
          <div className="flex flex-wrap items-center gap-2">
            <ReportMultiPicker
              label="Merge"
              values={sources.map(s => s.slug)}
              options={options.filter(o => o.value !== into?.slug)}
              onChange={slugs => setSources(slugs.slice(0, TAG_MERGE_MAX_SOURCES).flatMap(s => known.get(s) ?? []))}
              none="Choose tags"
              many={n => `${n} tags`}
              clearLabel="None"
              loading={all.isPending}
              searchable
            />
            <ReportPicker
              label="into"
              value={into?.slug ?? ''}
              fallback="Choose a tag"
              options={options.filter(o => !sources.some(s => s.slug === o.value))}
              onChange={slug => setInto(known.get(slug) ?? null)}
              loading={all.isPending}
              searchable
            />
          </div>

          {sources.length > 0 ? (
            <ul className="flex flex-col divide-y rounded-md border text-sm">
              {sources.map(s => (
                <li key={s.slug} className={MERGE_ROW}>
                  <span className="min-w-0 overflow-hidden whitespace-nowrap" title={s.name}>
                    <TagChip tag={s} />
                  </span>
                  <span className="truncate text-text-secondary tabular">{describe(s)}</span>
                  <span className="text-xs text-text-secondary">deleted</span>
                </li>
              ))}
              {into ? (
                <li className={MERGE_ROW}>
                  <span className="min-w-0 overflow-hidden whitespace-nowrap" title={into.name}>
                    <TagChip tag={into} />
                  </span>
                  <span className="truncate text-text-secondary tabular">{describe(into)}</span>
                  <span className="text-xs font-medium text-text">kept</span>
                </li>
              ) : null}
            </ul>
          ) : null}

          {ready ? (
            <p className="text-xs leading-5 text-text-secondary">
              {sources.length === 1 ? `${sources[0]!.name} is` : `${sources.length} tags are`} deleted in every project.
              Saved views searching for {sources.length === 1 ? 'it' : 'them'} will search for {into!.name}. A merge
              cannot be undone.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={merge.isPending}>
            Cancel
          </Button>
          <PendingButton
            variant="destructive"
            onClick={confirm}
            disabled={!ready}
            pending={merge.isPending}
            pendingLabel="Merging…"
          >
            {`Merge ${sources.length === 1 ? 'tag' : `${sources.length} tags`}${into ? ` into ${into.name}` : ''}`}
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteTagDialog({ tag, onClose }: { tag: Tag | null; onClose: () => void }) {
  const remove = useDeleteTag();
  const usage = tag ? tagUsage(tag) : null;
  return (
    <ConfirmDialog
      open={tag !== null}
      onOpenChange={open => (open ? undefined : onClose())}
      title={`Delete ${tag?.name ?? 'this tag'}?`}
      confirmLabel="Delete tag"
      pendingLabel="Deleting…"
      pending={remove.isPending}
      onConfirm={() => {
        if (!tag) return;
        onClose();
        remove.mutate(tag, {
          onSuccess: () => toast.success(`Deleted ${tag.name}`),
          onError: error => toastError(`Could not delete ${tag.name}`, error),
        });
      }}
    >
      {tag ? (
        <>
          <p>
            {usage
              ? `It comes off ${tagUsage(tag, ' and ')} in every project, and is removed.`
              : 'Nothing uses it; it is removed from the list.'}{' '}
            The issues and articles are otherwise untouched.
          </p>
          <p>
            A saved view that searches for it is left as written and will say the tag no longer exists. A delete cannot
            be undone.
          </p>
        </>
      ) : null}
    </ConfirmDialog>
  );
}

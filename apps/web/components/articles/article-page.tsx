'use client';

import { useEffect, useRef, useState } from 'react';
import { notFound, usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { Eye, EyeOff, FilePlus2, Link2, MoreHorizontal, Pencil, Star, Tag, Trash2, Undo2, AtSign } from 'lucide-react';
import { toast } from 'sonner';
import { checkMarkdownSize } from '@nothingleft/markdown';
import { ARTICLE_HIERARCHY_MAX_DEPTH, type Article, type TagRef } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Skeleton } from '@components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { FormAlert } from '@components/auth/form-alert';
import { MarkdownEditor } from '@components/editor/markdown-editor';
import { PersonName } from '@components/former-member-chip';
import { Kbd } from '@components/kbd';
import { Markdown, type MarkdownHeading } from '@components/markdown/markdown';
import { MarkdownAttachments } from '@components/markdown/markdown-attachments';
import { RelativeTime } from '@components/relative-time';
import { MarkdownSizeNote } from '@components/issues/markdown-size-note';
import { TagChip, TagPicker } from '@components/issues/issue-tags';
import { ArticleComments } from '@components/articles/article-comments';
import { ArticleAddressDialog, DeleteArticleDialog } from '@components/articles/article-dialogs';
import { articlePath } from '@components/articles/article-row';
import { ArticleToc } from '@components/articles/article-toc';
import { DraftMark } from '@components/articles/draft-mark';
import { useKnowledgeBase } from '@components/articles/knowledge-base';
import { useUploader } from '@hooks/use-attachments';
import {
  useArticle,
  useArticleAttachments,
  useArticleSignal,
  useArticleTag,
  useToggleArticleTask,
  useUpdateArticle,
} from '@hooks/use-articles';
import { useSession } from '@hooks/use-session';
import { useShortcut } from '@hooks/use-shortcut';
import { isApiError } from '@lib/api/errors';
import { cn } from '@lib/utils';

export function ArticlePage({ project, slug }: { project: string; slug: string }) {
  const article = useArticle(project, slug);
  const attachments = useArticleAttachments(project, slug);
  const session = useSession();
  const timeZone = session.status === 'signed-in' ? session.user.timezone : undefined;
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // A new article arrives with ?edit=1: it opens in the editor, and the flag leaves the address.
  const wantsEdit = params.get('edit') === '1';
  const [editingState, setEditing] = useState(wantsEdit);
  const [headings, setHeadings] = useState<MarkdownHeading[]>([]);
  const canEdit = article.data?.me.can_edit ?? false;
  const editing = editingState && canEdit;
  useEffect(() => {
    if (wantsEdit) router.replace(pathname as Route, { scroll: false });
  }, [wantsEdit, router, pathname]);

  useShortcut('e', () => setEditing(true), canEdit && !editing);

  if (article.isError && isApiError(article.error) && article.error.isNotFound) notFound();
  if (article.isError) return <FormAlert title="This article could not be loaded." />;
  if (article.isPending) return <ArticleSkeleton />;

  const data = article.data;

  return (
    <MarkdownAttachments files={attachments.data ?? []}>
      <div className="grid items-start gap-10 min-[1280px]:grid-cols-[minmax(0,1fr)_220px]">
        <article className="min-w-0 max-w-[900px]">
          <Provenance article={data} timeZone={timeZone} />
          <ArticleHeading article={data} onEdit={() => setEditing(true)} editing={editing} />
          {data.status === 'draft' ? (
            <p className="mt-3 rounded-md bg-inset px-3 py-2 text-xs text-text-secondary">
              A draft: only <PersonName person={data.created_by} className="font-medium text-text" /> and the
              project&apos;s admins can see it until it is published.
            </p>
          ) : null}
          {editing ? (
            <BodyEditor article={data} onDone={() => setEditing(false)} />
          ) : (
            <ArticleBody article={data} onEdit={() => setEditing(true)} onHeadings={setHeadings} />
          )}
          <ArticleComments article={data} timeZone={timeZone} />
        </article>
        <aside className="self-stretch max-[1279px]:hidden">
          {editing ? null : <ArticleToc headings={headings} />}
        </aside>
      </div>
    </MarkdownAttachments>
  );
}

function Provenance({ article, timeZone }: { article: Article; timeZone?: string | undefined }) {
  const signal = useArticleSignal(article.project.key, article.slug);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
      <span>
        Last updated by <PersonName person={article.updated_by} className="font-medium text-text" />{' '}
        <RelativeTime value={article.updated_at} timeZone={timeZone} />
      </span>
      {article.created_by.username !== article.updated_by.username ? (
        <>
          <span className="text-text-muted">·</span>
          <span>
            Written by <PersonName person={article.created_by} className="font-medium text-text" />
          </span>
        </>
      ) : null}
      <span className="ml-auto flex gap-1">
        <IconAction
          label={article.me.starred ? 'Starred — you watch this article' : 'Star (also watches)'}
          pressed={article.me.starred}
          onClick={() =>
            signal.mutate({ signal: 'star', on: !article.me.starred }, { onError: e => toast.error(e.message) })
          }
        >
          <Star className={cn(article.me.starred && 'fill-current')} />
        </IconAction>
        <ArticleMenu article={article} />
      </span>
    </div>
  );
}

function ArticleHeading({ article, onEdit, editing }: { article: Article; onEdit: () => void; editing: boolean }) {
  const [tagging, setTagging] = useState(false);
  const update = useUpdateArticle(article.project.key, article.slug);
  const tag = useArticleTag(article.project.key, article.slug);
  const canTag = article.me.can_edit;

  const publish = () =>
    update.mutate(
      { body: { status: 'published' }, optimistic: a => ({ ...a, status: 'published' }) },
      {
        onSuccess: a => toast.success(`Published ${a.title}.`),
        onError: e => toast.error(e.message),
      },
    );

  const change = (t: TagRef, on: boolean, isNew = false) =>
    tag.mutate(
      { tag: on ? t.name : t.slug, on, color: isNew ? t.color : undefined },
      { onError: e => toast.error(e.message) },
    );

  return (
    <>
      <div className="flex items-start gap-4">
        <ArticleTitle article={article} />
        <div className="mt-0.5 flex flex-none items-center gap-0.5">
          {article.status === 'draft' ? <DraftMark className="mr-1.5" /> : null}
          {article.me.can_edit && !editing ? (
            <IconAction label="Edit article" shortcut="e" onClick={onEdit}>
              <Pencil />
            </IconAction>
          ) : null}
          {canTag ? (
            <IconAction label="Add tag" onClick={() => setTagging(true)}>
              <Tag />
            </IconAction>
          ) : null}
          {article.status === 'draft' && article.me.can_publish ? (
            <Button size="sm" className="ml-1.5" onClick={publish} disabled={update.isPending}>
              Publish
            </Button>
          ) : null}
        </div>
      </div>
      {article.tags.length > 0 || canTag ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Tags">
          {article.tags.map(t => (
            <TagChip key={t.slug} tag={t} onRemove={canTag ? () => change(t, false) : undefined} />
          ))}
          {canTag ? (
            <TagPicker
              applied={article.tags}
              open={tagging}
              onOpenChange={setTagging}
              onChange={change}
              empty={article.tags.length === 0}
              context="article"
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}

const titleClass = 'flex-1 text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]';

function ArticleTitle({ article }: { article: Article }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateArticle(article.project.key, article.slug);

  if (draft === null) {
    return article.me.can_edit ? (
      <h1 className={titleClass}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setDraft(article.title)}
              className="-mx-1 cursor-text rounded-sm px-1 text-left underline decoration-border-strong decoration-dotted decoration-2 underline-offset-[6px] hover:bg-hover hover:decoration-text-secondary"
            >
              {article.title}
            </button>
          </TooltipTrigger>
          <TooltipContent>Click to rename · the address stays the same</TooltipContent>
        </Tooltip>
      </h1>
    ) : (
      <h1 className={titleClass}>{article.title}</h1>
    );
  }

  const commit = () => {
    const next = draft.trim();
    if (next === '' || next === article.title) {
      setDraft(null);
      setError(null);
      return;
    }
    update.mutate(
      { body: { title: next }, optimistic: a => ({ ...a, title: next }) },
      {
        onSuccess: () => {
          setDraft(null);
          setError(null);
        },
        onError: e => setError(isApiError(e) ? e.message : 'The title could not be saved.'),
      },
    );
  };

  return (
    <div className="flex-1">
      <label htmlFor="article-title" className="sr-only">
        Title
      </label>
      <input
        id="article-title"
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setDraft(null);
            setError(null);
          }
        }}
        aria-invalid={Boolean(error)}
        className="-mx-1 w-full rounded-sm border border-border-strong bg-surface px-1 text-2xl font-semibold tracking-tight text-text"
      />
      {error ? <p className="mt-1 text-xs text-danger-fg">{error}</p> : null}
    </div>
  );
}

interface ArticleBodyProps {
  article: Article;
  onEdit: () => void;
  onHeadings: (headings: MarkdownHeading[]) => void;
}

function ArticleBody({ article, onEdit, onHeadings }: ArticleBodyProps) {
  const toggle = useToggleArticleTask(article.project.key, article.slug);

  if (!article.body_md.trim()) {
    return article.me.can_edit ? (
      <button
        type="button"
        onClick={onEdit}
        className="mt-5 w-full max-w-[72ch] rounded-md border border-dashed px-3 py-4 text-left text-sm text-text-secondary hover:border-border-strong hover:text-text"
      >
        Write the article <Kbd className="ml-1">e</Kbd>
      </button>
    ) : (
      <p className="mt-5 text-sm text-text-secondary">This article has no text yet.</p>
    );
  }

  return (
    <Markdown
      source={article.body_md}
      className="mt-5"
      onHeadings={onHeadings}
      onToggleTask={
        article.me.can_edit
          ? (index, checked) => toggle.mutate({ index, checked }, { onError: e => toast.error(e.message) })
          : undefined
      }
    />
  );
}

function BodyEditor({ article, onDone }: { article: Article; onDone: () => void }) {
  const [text, setText] = useState(article.body_md);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateArticle(article.project.key, article.slug);
  const uploader = useUploader({ project: article.project.key, article: article.slug });
  const size = checkMarkdownSize(text);
  const blocked = size.level === 'too_large' || uploader.busy;

  const submit = () => {
    if (blocked || update.isPending) return;
    if (text === article.body_md) return onDone();
    update.mutate(
      { body: { body_md: text }, optimistic: a => ({ ...a, body_md: text }) },
      {
        onSuccess: () => {
          uploader.finish(text);
          onDone();
        },
        onError: e => setError(isApiError(e) ? e.message : 'The article could not be saved.'),
      },
    );
  };

  return (
    <div className="mt-5 flex flex-col gap-2">
      <MarkdownEditor
        value={text}
        onChange={setText}
        projectKey={article.project.key}
        label="Article"
        placeholder="Write the article. Type @ to mention someone, # to link an issue; issue keys become links."
        variant="description"
        autoFocus
        invalid={Boolean(error) || size.level === 'too_large'}
        onSubmit={submit}
        onCancel={onDone}
        uploader={uploader}
        className="[&_.ProseMirror]:min-h-[420px] [&_textarea]:min-h-[420px]"
        footer={
          <>
            <Button size="sm" onClick={submit} disabled={update.isPending || blocked}>
              {uploader.busy ? 'Uploading…' : 'Save'}{' '}
              <Kbd className="h-4 border-transparent bg-ink-fg/15 text-ink-fg/80">⌘↵</Kbd>
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
          </>
        }
      />
      <MarkdownSizeNote size={size} />
      {error ? <p className="text-xs text-danger-fg">{error}</p> : null}
    </div>
  );
}

function ArticleMenu({ article }: { article: Article }) {
  const { canCreate, openNewArticle } = useKnowledgeBase();
  const signal = useArticleSignal(article.project.key, article.slug);
  const update = useUpdateArticle(article.project.key, article.slug);
  const [deleting, setDeleting] = useState(false);
  const [addressing, setAddressing] = useState(false);
  const pending = useRef<'delete' | 'address' | null>(null);
  const depth = article.path.length + 1;

  const unpublish = () =>
    update.mutate(
      { body: { status: 'draft' }, optimistic: a => ({ ...a, status: 'draft' }) },
      {
        onSuccess: a => toast.success(`${a.title} is a draft again.`),
        onError: e => toast.error(e.message),
      },
    );

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="More actions" className="text-text-secondary">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>More: copy link, watch, address, delete</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="end"
          className="w-56"
          // Dialogs open once the menu has gone, or its focus return closes them again.
          onCloseAutoFocus={e => {
            if (!pending.current) return;
            e.preventDefault();
            if (pending.current === 'delete') setDeleting(true);
            if (pending.current === 'address') setAddressing(true);
            pending.current = null;
          }}
        >
          {canCreate && depth < ARTICLE_HIERARCHY_MAX_DEPTH ? (
            <DropdownMenuItem onSelect={() => openNewArticle({ parent: article.slug, starter: 'blank' })}>
              <FilePlus2 /> New article under this
            </DropdownMenuItem>
          ) : null}
          {article.status === 'published' && article.me.can_publish ? (
            <DropdownMenuItem onSelect={unpublish}>
              <Undo2 /> Return to draft
            </DropdownMenuItem>
          ) : null}
          {article.me.can_edit ? (
            <DropdownMenuItem onSelect={() => (pending.current = 'address')}>
              <AtSign /> Change address
            </DropdownMenuItem>
          ) : null}
          {canCreate || article.me.can_edit ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard.writeText(new URL(articlePath(article), window.location.origin).toString());
              toast.success('Link copied.');
            }}
          >
            <Link2 /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              signal.mutate({ signal: 'watch', on: !article.me.watching }, { onError: e => toast.error(e.message) })
            }
          >
            {article.me.watching ? <EyeOff /> : <Eye />}
            {article.me.watching ? 'Stop watching' : 'Watch'}
          </DropdownMenuItem>
          {article.me.can_delete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => (pending.current = 'delete')}>
                <Trash2 /> Delete article
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {article.me.can_delete ? (
        <DeleteArticleDialog article={article} open={deleting} onOpenChange={setDeleting} />
      ) : null}
      {article.me.can_edit ? (
        <ArticleAddressDialog article={article} open={addressing} onOpenChange={setAddressing} />
      ) : null}
    </>
  );
}

interface IconActionProps {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function IconAction({ label, shortcut, pressed, onClick, children }: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
          className={cn(
            'inline-flex h-control min-w-control items-center justify-center gap-1 rounded-sm px-2 text-text-secondary hover:bg-hover hover:text-text [&_svg]:size-4',
            pressed && 'text-brand-text hover:text-brand-text',
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <span className="ml-2 text-text-muted">{shortcut}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

export function ArticleSkeleton() {
  return (
    <div className="flex max-w-[900px] flex-col gap-4" role="status" aria-label="Loading">
      <Skeleton className="h-3 w-72" />
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-5 w-40" />
      <div className="mt-3 flex flex-col gap-2">
        <Skeleton className="h-4 w-full max-w-[72ch]" />
        <Skeleton className="h-4 w-5/6 max-w-[60ch]" />
        <Skeleton className="h-4 w-4/6 max-w-[64ch]" />
        <Skeleton className="mt-3 h-5 w-48" />
        <Skeleton className="h-4 w-full max-w-[72ch]" />
        <Skeleton className="h-4 w-3/5 max-w-[48ch]" />
      </div>
    </div>
  );
}

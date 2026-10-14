'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import type { Attachment } from '@nothingleft/types';
import { UploadTray } from '@components/attachments/upload-tray';
import {
  EditorToolbar,
  type AttachTool,
  type BlockType,
  type EditorCommands,
  type EditorMode,
} from '@components/editor/editor-toolbar';
import { editorExtensions, type ReferenceBridge } from '@components/editor/extensions';
import { ReferencePicker, type ReferencePickerHandle, type ReferenceQuery } from '@components/editor/reference-picker';
import { textareaCaretRect } from '@components/editor/caret';
import {
  TABLE_TEMPLATE,
  codeFence,
  currentBlockType,
  insertBlock,
  linkInline,
  prefixLines,
  triggerBefore,
  wrapInline,
  type SourceEdit,
} from '@components/editor/source-format';
import { useStorage, type Upload, type Uploader } from '@hooks/use-attachments';
import { attachmentMarkdown, escapeMarkdownLabel, isInlineImage } from '@lib/files';
import { cn } from '@lib/utils';

const MODE_KEY = 'nl:editor:mode';

const readMode = (): EditorMode => {
  if (typeof window === 'undefined') return 'visual';
  try {
    return window.localStorage.getItem(MODE_KEY) === 'markdown' ? 'markdown' : 'visual';
  } catch {
    return 'visual';
  }
};

const writeMode = (mode: EditorMode) => {
  try {
    window.localStorage.setItem(MODE_KEY, mode);
  } catch {
    // A blocked store only forgets the choice.
  }
};

export interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  /** Ranks the `#` picker and supplies the `@` picker's people. */
  projectKey: string | null;
  label: string;
  placeholder: string;
  variant?: 'description' | 'comment';
  /** Overrides the variant's minimum height, as a Tailwind class. */
  minHeight?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
  onCancel?: () => void;
  footer?: ReactNode;
  invalid?: boolean;
  className?: string;
  /** Drop, paste and the toolbar button upload through it; without one the text takes no files. */
  uploader?: Uploader | null;
}

export function MarkdownEditor({
  value,
  onChange,
  projectKey,
  label,
  placeholder,
  variant = 'comment',
  minHeight: minHeightOverride,
  autoFocus = false,
  onSubmit,
  onCancel,
  footer,
  invalid = false,
  className,
  uploader = null,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<EditorMode>(readMode);
  const modeRef = useRef(mode);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    modeRef.current = mode;
    valueRef.current = value;
    onChangeRef.current = onChange;
  });
  const uploadRef = useRef<((files: File[], at?: number) => void) | null>(null);

  const [reference, setReference] = useState<ReferenceQuery | null>(null);
  const picker = useRef<ReferencePickerHandle>(null);
  const submitRef = useRef(onSubmit);
  useEffect(() => {
    submitRef.current = onSubmit;
  });
  const [bridge] = useState<ReferenceBridge>(() => ({
    open: setReference,
    close: () => setReference(null),
    keyDown: event => picker.current?.keyDown(event) ?? false,
    submit: () => {
      if (!submitRef.current) return false;
      submitRef.current();
      return true;
    },
  }));

  const sourceId = useId();
  const emitted = useRef(value);
  // `serialised` is filled on the first update: the markdown manager is not ready at creation.
  const loaded = useRef<{ source: string; serialised: string | null }>({ source: value, serialised: null });
  const load = (e: Editor, markdown: string) => {
    emitted.current = markdown;
    e.commands.setContent(markdown, { contentType: 'markdown', emitUpdate: false });
    loaded.current = { source: markdown, serialised: null };
  };
  const extensions = useMemo(() => editorExtensions(placeholder, bridge), [placeholder, bridge]);
  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    immediatelyRender: false,
    autofocus: autoFocus && mode === 'visual' ? 'end' : false,
    editorProps: {
      handleDrop: (view, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (moved || files.length === 0 || !uploadRef.current) return false;
        event.preventDefault();
        uploadRef.current(files, view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos);
        return true;
      },
      handlePaste: (_view, event) => {
        const files = pastedFiles(event);
        if (files.length === 0 || !uploadRef.current) return false;
        event.preventDefault();
        uploadRef.current(files);
        return true;
      },
      attributes: {
        class: cn('md editor-content', variant === 'comment' && 'md-comment'),
        'aria-label': label,
        'aria-multiline': 'true',
        role: 'textbox',
      },
    },
    onUpdate: ({ editor: e }) => {
      const markdown = e.getMarkdown();
      // Loading re-serialises (padded tables, a trailing paragraph): until the person changes
      // something, the text is still exactly what came in.
      loaded.current.serialised ??= reserialise(e, loaded.current.source);
      emitted.current = markdown.trimEnd() === loaded.current.serialised ? loaded.current.source : markdown;
      onChange(emitted.current);
    },
  });

  // A value set from outside (cleared after a save, a draft restored) replaces the document.
  useEffect(() => {
    if (!editor || value === emitted.current) return;
    load(editor, value);
  }, [editor, value]);

  const [textarea, setTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const visualCommands = useVisualCommands(editor);
  const sourceCommands = useMemo(
    () => markdownCommands(textarea, value, caret, onChange),
    [textarea, value, caret, onChange],
  );

  const switchMode = (next: EditorMode) => {
    if (next === mode) return;
    setReference(null);
    if (next === 'visual' && editor) {
      load(editor, value);
    }
    setMode(next);
    writeMode(next);
    requestAnimationFrame(() =>
      next === 'visual' ? editor?.commands.focus('end') : document.getElementById(sourceId)?.focus(),
    );
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && onSubmit) {
      event.preventDefault();
      onSubmit();
    } else if (event.key === 'Escape' && onCancel && !reference) {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
      // The toolbar's link popover owns links; ⌘K only opens it.
      event.preventDefault();
      (event.currentTarget.querySelector('[aria-label="Link"]') as HTMLButtonElement | null)?.click();
    }
  };

  const updateSourceTrigger = (el: HTMLTextAreaElement) => {
    const caret = el.selectionStart;
    const found = el.selectionStart === el.selectionEnd ? triggerBefore(el.value, caret) : null;
    if (!found) return setReference(null);
    setReference({
      trigger: found.trigger,
      query: found.query,
      rect: () => textareaCaretRect(el, found.from),
      insert: text => {
        applySourceEdit(
          el,
          {
            text: el.value.slice(0, found.from) + text + ' ' + el.value.slice(caret),
            selectionStart: found.from + text.length + 1,
            selectionEnd: found.from + text.length + 1,
          },
          onChange,
        );
        setReference(null);
      },
    });
  };

  const storage = useStorage();
  const canUpload = uploader !== null && storage.available;
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // Where each upload's placeholder stands: in the text, or gone (failed, or the person deleted it).
  const placed = useRef(new Map<string, { placeholder: string; inText: boolean }>());

  const replacePlaceholder = (placeholder: string, file: Attachment | null): boolean => {
    if (modeRef.current === 'visual') return editor ? replaceInDocument(editor, placeholder, file) : false;
    const next = replaceInSource(valueRef.current, placeholder, file ? attachmentMarkdown(file) : '');
    if (next === valueRef.current) return false;
    onChangeRef.current(next);
    return true;
  };

  const insertFiles = (entries: { placeholder: string; image: boolean; name: string }[], at?: number) => {
    if (modeRef.current === 'visual') {
      if (!editor) return;
      const nodes = entries.flatMap(e => fileNodes(e.name, e.placeholder, e.image, true));
      const chain = editor.chain().focus();
      (at === undefined ? chain.insertContent(nodes) : chain.insertContentAt(at, nodes)).run();
      return;
    }
    const text = entries
      .map(e => `${e.image ? '!' : ''}[Uploading ${escapeMarkdownLabel(e.name)}…](${e.placeholder})`)
      .join('\n');
    const el = textarea;
    const current = valueRef.current;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const edit = { text: current.slice(0, start) + text + current.slice(end), caret: start + text.length };
    if (el) applySourceEdit(el, { text: edit.text, selectionStart: edit.caret, selectionEnd: edit.caret }, onChange);
    else onChange(edit.text);
  };

  const upload = (files: File[], at?: number) => {
    if (!uploader || files.length === 0) return;
    const created = uploader.start(files);
    const going = created.filter(u => u.status !== 'failed');
    for (const u of created) placed.current.set(u.id, { placeholder: u.placeholder, inText: u.status !== 'failed' });
    if (going.length > 0)
      insertFiles(
        going.map(u => ({ placeholder: u.placeholder, image: u.image, name: u.file.name })),
        at,
      );
  };
  const insertDone = (u: Upload) => {
    const file = u.attachment!;
    if (modeRef.current === 'visual') {
      editor
        ?.chain()
        .focus()
        .insertContent(fileNodes(file.filename, file.url, isInlineImage(file.mime_type), false))
        .run();
      return;
    }
    const current = valueRef.current;
    onChangeRef.current(`${current}${current && !current.endsWith('\n') ? '\n' : ''}${attachmentMarkdown(file)}`);
  };

  useEffect(() => {
    uploadRef.current = canUpload ? upload : null;
  });

  const uploads = uploader?.uploads;
  useEffect(() => {
    if (!uploads) return;
    const live = new Set<string>();
    for (const u of uploads) {
      live.add(u.id);
      const spot = placed.current.get(u.id);
      if (!spot) continue;
      if (u.status === 'done' && u.attachment) {
        const replaced = spot.inText && replacePlaceholder(spot.placeholder, u.attachment);
        // Retried after a failure, or its placeholder deleted meanwhile: it goes where the caret is.
        if (!replaced) insertDone(u);
        placed.current.delete(u.id);
      } else if (u.status === 'failed' && spot.inText) {
        replacePlaceholder(spot.placeholder, null);
        spot.inText = false;
      }
    }
    for (const [id, spot] of placed.current) {
      if (live.has(id)) continue;
      if (spot.inText) replacePlaceholder(spot.placeholder, null);
      placed.current.delete(id);
    }
  });

  const attach: AttachTool | undefined = uploader
    ? {
        onClick: () => fileInput.current?.click(),
        disabled: storage.blocked ?? undefined,
      }
    : undefined;

  const minHeight = minHeightOverride ?? (variant === 'description' ? 'min-h-80' : 'min-h-24');

  return (
    <div
      className={cn(
        'editor-frame flex flex-col rounded-md border border-border-strong bg-surface',
        invalid && 'border-danger-fg',
        dragging && 'border-text-secondary bg-hover',
        className,
      )}
      onKeyDown={onKeyDown}
      onDragOver={event => {
        if (!canUpload || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={event => {
        setDragging(false);
        // Visual mode's own drop handler places the file where it fell; anything else lands at the caret.
        if (event.defaultPrevented || !canUpload || event.dataTransfer.files.length === 0) return;
        event.preventDefault();
        upload([...event.dataTransfer.files]);
      }}
    >
      <EditorToolbar
        commands={mode === 'visual' ? visualCommands : sourceCommands}
        mode={mode}
        onModeChange={switchMode}
        attach={attach}
      />
      <div className={cn(mode === 'visual' ? 'block' : 'hidden')}>
        <EditorContent editor={editor} className={cn('px-3 py-2.5', minHeight)} />
      </div>
      {mode === 'markdown' ? (
        <textarea
          id={sourceId}
          ref={setTextarea}
          aria-label={`${label} (markdown source)`}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          spellCheck
          onChange={e => {
            onChange(e.target.value);
            updateSourceTrigger(e.target);
          }}
          onSelect={e => {
            setCaret(e.currentTarget.selectionStart);
            if (reference) updateSourceTrigger(e.currentTarget);
          }}
          onBlur={() => setReference(null)}
          onPaste={e => {
            const files = pastedFiles(e.nativeEvent);
            if (files.length === 0 || !canUpload) return;
            e.preventDefault();
            upload(files);
          }}
          onKeyDown={e => {
            if (reference && picker.current?.keyDown(e.nativeEvent)) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          className={cn(
            'field-sizing-content w-full resize-none bg-transparent px-3 py-2.5 font-mono text-xs leading-5 text-text placeholder:text-text-muted',
            minHeight,
          )}
        />
      ) : null}
      {uploader ? (
        <>
          <UploadTray
            uploads={uploader.uploads}
            onCancel={uploader.cancel}
            onRetry={uploader.retry}
            className="border-t border-border-subtle px-2 py-1.5 empty:hidden"
          />
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            tabIndex={-1}
            aria-hidden
            onChange={event => {
              upload([...(event.target.files ?? [])]);
              event.target.value = '';
            }}
          />
        </>
      ) : null}
      {footer ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-2 py-2">{footer}</div>
      ) : null}
      <ReferencePicker ref={picker} state={reference} projectKey={projectKey} onClose={() => setReference(null)} />
    </div>
  );
}

/** Screenshots arrive as files; copied cells and rich text also carry a picture of themselves, and the text wins. */
function pastedFiles(event: ClipboardEvent): File[] {
  const data = event.clipboardData;
  if (!data || data.files.length === 0 || data.getData('text/plain').trim() !== '') return [];
  return [...data.files];
}

function fileNodes(name: string, href: string, image: boolean, uploading: boolean): JSONContent[] {
  if (image) return [{ type: 'image', attrs: { src: href, alt: name } }];
  return [
    { type: 'text', text: uploading ? `Uploading ${name}…` : name, marks: [{ type: 'link', attrs: { href } }] },
    { type: 'text', text: ' ' },
  ];
}

function replaceInDocument(e: Editor, placeholder: string, file: Attachment | null): boolean {
  const { state } = e;
  const found: { from: number; to: number; image: boolean; attrs: Record<string, unknown> }[] = [];
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs.src === placeholder) {
      found.push({ from: pos, to: pos + node.nodeSize, image: true, attrs: node.attrs });
    } else if (node.isText && node.marks.some(m => m.type.name === 'link' && m.attrs.href === placeholder)) {
      found.push({ from: pos, to: pos + node.nodeSize, image: false, attrs: {} });
    }
  });
  if (found.length === 0) return false;
  const tr = state.tr;
  for (const spot of found.reverse()) {
    if (!file) tr.delete(spot.from, spot.to);
    else if (spot.image) tr.setNodeMarkup(spot.from, undefined, { ...spot.attrs, src: file.url, alt: file.filename });
    else {
      const link = state.schema.marks.link!.create({ href: file.url });
      tr.replaceWith(spot.from, spot.to, state.schema.text(file.filename, [link]));
    }
  }
  e.view.dispatch(tr);
  return true;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function replaceInSource(source: string, placeholder: string, replacement: string): string {
  return source.replace(
    new RegExp(`!?\\[(?:\\\\.|[^\\]\\\\])*\\]\\(${escapeRegExp(placeholder)}\\)`, 'g'),
    () => replacement,
  );
}

/** The markdown the editor would write for `source` untouched, to tell a real edit from re-serialising. */
const reserialise = (e: Editor, source: string) => {
  const manager = e.storage.markdown?.manager;
  return (manager ? manager.serialize(manager.parse(source)) : source).trimEnd();
};

function useVisualCommands(editor: Editor | null): EditorCommands {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return null;
      const block: BlockType | null = e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : e.isActive('paragraph')
              ? 'paragraph'
              : null;
      return {
        block,
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        strike: e.isActive('strike'),
        code: e.isActive('code'),
        link: e.isActive('link'),
        quote: e.isActive('blockquote'),
        bullet: e.isActive('bulletList'),
        ordered: e.isActive('orderedList'),
        task: e.isActive('taskList'),
        codeBlock: e.isActive('codeBlock'),
        inTable: e.isActive('table'),
      };
    },
  });

  const chain = () => editor!.chain().focus();
  return {
    block: state ? state.block : 'paragraph',
    setBlock: block => {
      if (!editor) return;
      if (block === 'paragraph') chain().setParagraph().run();
      else
        chain()
          .setHeading({ level: Number(block.slice(1)) as 1 | 2 | 3 })
          .run();
    },
    isActive: name => Boolean(state?.[name]),
    toggleMark: mark => {
      if (!editor) return;
      const c = chain();
      if (mark === 'bold') c.toggleBold().run();
      else if (mark === 'italic') c.toggleItalic().run();
      else if (mark === 'strike') c.toggleStrike().run();
      else c.toggleCode().run();
    },
    toggleBlock: block => {
      if (!editor) return;
      const c = chain();
      if (block === 'quote') c.toggleBlockquote().run();
      else if (block === 'bullet') c.toggleBulletList().run();
      else if (block === 'ordered') c.toggleOrderedList().run();
      else if (block === 'task') c.toggleTaskList().run();
      else c.toggleCodeBlock().run();
    },
    currentLink: () => (editor?.getAttributes('link').href as string | undefined) ?? null,
    setLink: url => {
      if (!editor) return;
      if (url === null) return void chain().extendMarkRange('link').unsetLink().run();
      if (editor.state.selection.empty && !editor.isActive('link')) {
        chain()
          .insertContent({ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] })
          .run();
      } else {
        chain().extendMarkRange('link').setLink({ href: url }).run();
      }
    },
    inTable: Boolean(state?.inTable),
    insertTable: () => editor && chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    table: action => {
      if (!editor) return;
      const c = chain();
      if (action === 'addRow') c.addRowAfter().run();
      else if (action === 'addColumn') c.addColumnAfter().run();
      else if (action === 'deleteRow') c.deleteRow().run();
      else if (action === 'deleteColumn') c.deleteColumn().run();
      else c.deleteTable().run();
    },
  };
}

function applySourceEdit(el: HTMLTextAreaElement, edit: SourceEdit, onChange: (value: string) => void) {
  onChange(edit.text);
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  });
}

const MARK_SYNTAX = { bold: ['**', '**'], italic: ['_', '_'], strike: ['~~', '~~'], code: ['`', '`'] } as const;
const BLOCK_PREFIX = { quote: '> ', bullet: '- ', task: '- [ ] ' } as const;

function markdownCommands(
  el: HTMLTextAreaElement | null,
  value: string,
  caret: number,
  onChange: (value: string) => void,
): EditorCommands {
  const selection = () => ({
    value,
    start: el?.selectionStart ?? value.length,
    end: el?.selectionEnd ?? value.length,
  });
  const apply = (edit: SourceEdit) => {
    if (el) applySourceEdit(el, edit, onChange);
  };
  return {
    block: currentBlockType(value, caret),
    setBlock: block =>
      apply(prefixLines(selection(), block === 'paragraph' ? '' : `${'#'.repeat(Number(block.slice(1)))} `)),
    isActive: () => false,
    toggleMark: mark => {
      const [before, after] = MARK_SYNTAX[mark];
      apply(wrapInline(selection(), before, after, mark === 'code' ? 'code' : 'text'));
    },
    toggleBlock: block => {
      if (block === 'codeBlock') return apply(codeFence(selection()));
      if (block === 'ordered') return apply(prefixLines(selection(), i => `${i + 1}. `));
      apply(prefixLines(selection(), BLOCK_PREFIX[block]));
    },
    currentLink: () => null,
    setLink: url => (url ? apply(linkInline(selection(), url)) : undefined),
    inTable: false,
    insertTable: () => apply(insertBlock(selection(), TABLE_TEMPLATE, TABLE_TEMPLATE.length - 4)),
    table: () => {},
  };
}

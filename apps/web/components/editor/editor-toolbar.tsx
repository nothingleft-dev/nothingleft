'use client';

import { useState, type ReactNode } from 'react';
import {
  Bold,
  Check,
  ChevronDown,
  Code,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Paperclip,
  SquareCode,
  Strikethrough,
  Table2,
  TextQuote,
} from 'lucide-react';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { cn } from '@lib/utils';

export type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3';
export type InlineMark = 'bold' | 'italic' | 'strike' | 'code';
export type BlockToggle = 'quote' | 'bullet' | 'ordered' | 'task' | 'codeBlock';
export type TableAction = 'addRow' | 'addColumn' | 'deleteRow' | 'deleteColumn' | 'deleteTable';

/** One surface over both modes: Tiptap commands in Visual, text edits in Markdown. */
export interface EditorCommands {
  block: BlockType | null;
  setBlock: (block: BlockType) => void;
  isActive: (name: InlineMark | BlockToggle | 'link') => boolean;
  toggleMark: (mark: InlineMark) => void;
  toggleBlock: (block: BlockToggle) => void;
  currentLink: () => string | null;
  setLink: (url: string | null) => void;
  inTable: boolean;
  insertTable: () => void;
  table: (action: TableAction) => void;
}

export type EditorMode = 'visual' | 'markdown';

const BLOCKS: { value: BlockType; label: string; className: string }[] = [
  { value: 'paragraph', label: 'Normal text', className: 'text-sm' },
  { value: 'h1', label: 'Heading 1', className: 'text-lg font-semibold' },
  { value: 'h2', label: 'Heading 2', className: 'text-md font-semibold' },
  { value: 'h3', label: 'Heading 3', className: 'text-sm font-semibold' },
];

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

/** Absent where the text takes no uploads; `disabled` names why it cannot take one now. */
export interface AttachTool {
  onClick: () => void;
  disabled?: string;
}

interface EditorToolbarProps {
  commands: EditorCommands;
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  attach?: AttachTool | undefined;
}

export function EditorToolbar({ commands, mode, onModeChange, attach }: EditorToolbarProps) {
  const block = BLOCKS.find(b => b.value === commands.block);

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex items-start gap-1 border-b border-border-subtle px-1 py-1"
      onMouseDown={e => {
        // Keep the selection in the text while a button is pressed.
        if ((e.target as HTMLElement).closest('button')) e.preventDefault();
      }}
    >
      {/* In a narrow editor the tools wrap among themselves and the mode switch keeps its corner. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-px">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Block type"
              className="inline-flex h-7 w-[108px] items-center justify-between gap-1 rounded-sm px-2 text-xs whitespace-nowrap text-text-secondary hover:bg-hover hover:text-text"
            >
              {block?.label ?? (commands.isActive('codeBlock') ? 'Code block' : 'Mixed')}
              <ChevronDown className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44" onCloseAutoFocus={e => e.preventDefault()}>
            {BLOCKS.map(b => (
              <DropdownMenuItem key={b.value} onSelect={() => commands.setBlock(b.value)}>
                <span className={cn('flex-1', b.className)}>{b.label}</span>
                {commands.block === b.value ? <Check className="size-3.5" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Divider />
        <Tool
          label="Bold"
          keys={`${MOD}B`}
          active={commands.isActive('bold')}
          onClick={() => commands.toggleMark('bold')}
        >
          <Bold />
        </Tool>
        <Tool
          label="Italic"
          keys={`${MOD}I`}
          active={commands.isActive('italic')}
          onClick={() => commands.toggleMark('italic')}
        >
          <Italic />
        </Tool>
        <Tool
          label="Strikethrough"
          keys={`${MOD}⇧S`}
          active={commands.isActive('strike')}
          onClick={() => commands.toggleMark('strike')}
        >
          <Strikethrough />
        </Tool>

        <Divider />
        <Tool label="Quote" active={commands.isActive('quote')} onClick={() => commands.toggleBlock('quote')}>
          <TextQuote />
        </Tool>
        <Tool
          label="Inline code"
          keys={`${MOD}E`}
          active={commands.isActive('code')}
          onClick={() => commands.toggleMark('code')}
        >
          <Code />
        </Tool>
        <LinkTool commands={commands} />

        <Divider />
        <Tool label="Bullet list" active={commands.isActive('bullet')} onClick={() => commands.toggleBlock('bullet')}>
          <List />
        </Tool>
        <Tool
          label="Numbered list"
          active={commands.isActive('ordered')}
          onClick={() => commands.toggleBlock('ordered')}
        >
          <ListOrdered />
        </Tool>
        <Tool label="Task list" active={commands.isActive('task')} onClick={() => commands.toggleBlock('task')}>
          <ListChecks />
        </Tool>

        <Divider />
        <Tool
          label="Code block"
          active={commands.isActive('codeBlock')}
          onClick={() => commands.toggleBlock('codeBlock')}
        >
          <SquareCode />
        </Tool>
        <TableTool commands={commands} />
        {attach ? (
          <Tool
            label="Insert image or file"
            hint={attach.disabled ?? 'Or drop files here, or paste a screenshot'}
            disabled={Boolean(attach.disabled)}
            onClick={attach.onClick}
          >
            <Paperclip />
          </Tool>
        ) : null}
      </div>

      <div role="group" aria-label="Editor mode" className="flex flex-none items-center rounded-sm bg-inset p-0.5">
        {(['visual', 'markdown'] as const).map(m => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => onModeChange(m)}
            className={cn(
              'h-6 rounded-xs px-1.5 text-2xs font-medium text-text-secondary hover:text-text',
              mode === m && 'bg-surface text-text shadow-[0_0_0_1px_var(--border)]',
            )}
          >
            {m === 'visual' ? 'Visual' : 'Markdown'}
          </button>
        ))}
      </div>
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />;
}

interface ToolProps {
  label: string;
  keys?: string;
  hint?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function Tool({ label, keys, hint, active = false, disabled = false, onClick, children }: ToolProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button fires no pointer events, so the wrapper carries the tooltip. */}
        <span className="inline-flex">
          <ToolButton label={label} active={active} disabled={disabled} onClick={onClick}>
            {children}
          </ToolButton>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {keys ? <span className="ml-2 text-text-muted">{keys}</span> : null}
        {hint ? <span className="block text-text-muted">{hint}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

interface ToolButtonProps extends Omit<ToolProps, 'keys' | 'hint'> {
  className?: string;
}

function ToolButton({ label, active, disabled, onClick, children, className }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-sm text-text-secondary hover:bg-hover hover:text-text disabled:pointer-events-none disabled:text-text-disabled [&_svg]:size-4',
        active && 'bg-active text-text',
        className,
      )}
    >
      {children}
    </button>
  );
}

function LinkTool({ commands }: { commands: EditorCommands }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const current = open ? commands.currentLink() : null;

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        if (next) setUrl(commands.currentLink() ?? '');
        setOpen(next);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Link"
              aria-pressed={commands.isActive('link')}
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-sm text-text-secondary hover:bg-hover hover:text-text [&_svg]:size-4',
                commands.isActive('link') && 'bg-active text-text',
              )}
            >
              <Link2 />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          Link <span className="ml-2 text-text-muted">{MOD}K</span>
        </TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className="w-80 p-3" onCloseAutoFocus={e => e.preventDefault()}>
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={e => {
            e.preventDefault();
            e.stopPropagation();
            const trimmed = url.trim();
            if (trimmed) commands.setLink(trimmed);
            setOpen(false);
          }}
        >
          <label htmlFor="editor-link-url" className="text-2xs font-medium text-text-secondary">
            Link address
          </label>
          <input
            id="editor-link-url"
            autoFocus
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://"
            className="h-control w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-text placeholder:text-text-muted"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!url.trim()}>
              {current ? 'Update link' : 'Add link'}
            </Button>
            {current ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  commands.setLink(null);
                  setOpen(false);
                }}
              >
                Remove link
              </Button>
            ) : null}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function TableTool({ commands }: { commands: EditorCommands }) {
  if (!commands.inTable) {
    return (
      <Tool label="Table" onClick={commands.insertTable}>
        <Table2 />
      </Tool>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Table"
          aria-pressed
          className="inline-flex h-7 items-center gap-0.5 rounded-sm bg-active px-1.5 text-text hover:bg-hover [&_svg]:size-4"
        >
          <Table2 />
          <ChevronDown className="size-3!" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48" onCloseAutoFocus={e => e.preventDefault()}>
        <DropdownMenuItem onSelect={() => commands.table('addRow')}>Add row below</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => commands.table('addColumn')}>Add column right</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => commands.table('deleteRow')}>Delete row</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => commands.table('deleteColumn')}>Delete column</DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => commands.table('deleteTable')}>
          Delete table
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

'use client';

import { Fragment, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  Bold,
  Check,
  ChevronDown,
  Code,
  Ellipsis,
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
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@components/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import { cn } from '@lib/utils';

export type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3';
export type InlineMark = 'bold' | 'italic' | 'strike' | 'code';
export type BlockToggle = 'quote' | 'bullet' | 'ordered' | 'task' | 'codeBlock';
export type TableAction =
  'addRowBefore' | 'addRowAfter' | 'addColumnBefore' | 'addColumnAfter' | 'deleteRow' | 'deleteColumn' | 'deleteTable';

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

const TABLE_ACTIONS: { action: TableAction; label: string }[][] = [
  [
    { action: 'addRowBefore', label: 'Add row above' },
    { action: 'addRowAfter', label: 'Add row below' },
    { action: 'addColumnBefore', label: 'Add column left' },
    { action: 'addColumnAfter', label: 'Add column right' },
  ],
  [
    { action: 'deleteRow', label: 'Delete row' },
    { action: 'deleteColumn', label: 'Delete column' },
  ],
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
  linkOpen: boolean;
  onLinkOpenChange: (open: boolean) => void;
  /** A menu or popover of the toolbar holds focus, which still counts as editing. */
  onMenuOpenChange: (open: boolean) => void;
}

// Pixel widths the overflow is computed from: a tool is `size-7`, a divider `mx-0.5 w-px`, all `gap-px` apart.
const TOOL = 28;
const DIVIDER = 5;
const BLOCK_MENU = 108;
const TABLE_MENU = 42;
const GAP = 1;

interface ToolSpec {
  id: string;
  label: string;
  icon: LucideIcon;
  keys?: string;
  active: boolean;
  /** Starts a group: a divider stands before it. */
  group?: boolean;
  width?: number;
}

export function EditorToolbar({
  commands,
  mode,
  onModeChange,
  attach,
  linkOpen,
  onLinkOpenChange,
  onMenuOpenChange,
}: EditorToolbarProps) {
  const block = BLOCKS.find(b => b.value === commands.block);
  const tools: ToolSpec[] = [
    { id: 'bold', label: 'Bold', icon: Bold, keys: `${MOD}B`, active: commands.isActive('bold'), group: true },
    { id: 'italic', label: 'Italic', icon: Italic, keys: `${MOD}I`, active: commands.isActive('italic') },
    {
      id: 'strike',
      label: 'Strikethrough',
      icon: Strikethrough,
      keys: `${MOD}⇧S`,
      active: commands.isActive('strike'),
    },
    { id: 'quote', label: 'Quote', icon: TextQuote, active: commands.isActive('quote'), group: true },
    { id: 'code', label: 'Inline code', icon: Code, keys: `${MOD}E`, active: commands.isActive('code') },
    { id: 'link', label: 'Link', icon: Link2, keys: `${MOD}K`, active: commands.isActive('link') },
    { id: 'bullet', label: 'Bullet list', icon: List, active: commands.isActive('bullet'), group: true },
    { id: 'ordered', label: 'Numbered list', icon: ListOrdered, active: commands.isActive('ordered') },
    { id: 'task', label: 'Task list', icon: ListChecks, active: commands.isActive('task') },
    { id: 'codeBlock', label: 'Code block', icon: SquareCode, active: commands.isActive('codeBlock'), group: true },
    {
      id: 'table',
      label: 'Table',
      icon: Table2,
      active: commands.inTable,
      width: commands.inTable ? TABLE_MENU : TOOL,
    },
    ...(attach ? [{ id: 'attach', label: 'Insert image or file', icon: Paperclip, active: false }] : []),
  ];

  const row = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(Infinity);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => setRoom(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const shown = fittingTools(tools, room);
  const hidden = tools.slice(shown);
  const linkHidden = hidden.some(t => t.id === 'link');

  const run = (id: string) => {
    if (id === 'bold' || id === 'italic' || id === 'strike' || id === 'code') commands.toggleMark(id);
    else if (id === 'quote' || id === 'bullet' || id === 'ordered' || id === 'task' || id === 'codeBlock')
      commands.toggleBlock(id);
    else if (id === 'table') commands.insertTable();
    else if (id === 'attach') attach?.onClick();
    else if (id === 'link') onLinkOpenChange(true);
  };

  const renderTool = (tool: ToolSpec) => {
    if (tool.id === 'link') {
      return (
        <Tooltip key={tool.id}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <ToolButton label="Link" active={tool.active}>
                <Link2 />
              </ToolButton>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>
            Link <span className="ml-2 text-text-muted">{tool.keys}</span>
          </TooltipContent>
        </Tooltip>
      );
    }
    if (tool.id === 'table' && commands.inTable) {
      return <TableMenu key={tool.id} commands={commands} onOpenChange={onMenuOpenChange} />;
    }
    const Icon = tool.icon;
    const disabledReason = tool.id === 'attach' ? attach?.disabled : undefined;
    return (
      <Tool
        key={tool.id}
        label={tool.label}
        keys={tool.keys}
        hint={tool.id === 'attach' ? (disabledReason ?? 'Or drop files here, or paste a screenshot') : undefined}
        active={tool.active}
        disabled={Boolean(disabledReason)}
        onClick={() => run(tool.id)}
      >
        <Icon />
      </Tool>
    );
  };

  const more =
    hidden.length > 0 ? (
      <MoreMenu
        tools={hidden}
        commands={commands}
        attachDisabled={attach?.disabled}
        onRun={run}
        onOpenChange={onMenuOpenChange}
        anchorsLink={linkHidden}
      />
    ) : null;

  return (
    <Popover
      open={linkOpen}
      onOpenChange={open => {
        onLinkOpenChange(open);
        onMenuOpenChange(open);
      }}
    >
      <div
        role="toolbar"
        aria-label="Formatting"
        className="sticky top-0 z-10 flex items-center gap-1 rounded-t-md border-b border-border-subtle bg-surface px-1 py-1"
        onMouseDown={e => {
          // Keep the selection in the text while a button is pressed.
          if ((e.target as HTMLElement).closest('button')) e.preventDefault();
        }}
      >
        {/* Tools that do not fit go under ⋯, from the end, so the row never wraps. */}
        <div ref={row} className="flex min-w-0 flex-1 items-center gap-px overflow-x-clip">
          <BlockMenu commands={commands} label={block?.label} onOpenChange={onMenuOpenChange} />
          {tools.slice(0, shown).map(tool => (
            <ToolSlot key={tool.id} divider={tool.group}>
              {renderTool(tool)}
            </ToolSlot>
          ))}
          {more}
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
      <LinkForm open={linkOpen} commands={commands} onClose={() => onLinkOpenChange(false)} />
    </Popover>
  );
}

/** How many of `tools` fit beside the block menu, leaving room for ⋯ when some do not. */
function fittingTools(tools: readonly ToolSpec[], room: number): number {
  const width = (tool: ToolSpec) => (tool.group ? DIVIDER + GAP : 0) + (tool.width ?? TOOL) + GAP;
  const all = BLOCK_MENU + tools.reduce((sum, t) => sum + width(t), 0);
  if (all <= room) return tools.length;
  let used = BLOCK_MENU + GAP + DIVIDER + GAP + TOOL;
  let count = 0;
  for (const tool of tools) {
    used += width(tool);
    if (used > room) break;
    count += 1;
  }
  return count;
}

function ToolSlot({ divider, children }: { divider: boolean | undefined; children: ReactNode }) {
  return (
    <>
      {divider ? <Divider /> : null}
      {children}
    </>
  );
}

function Divider() {
  return <span aria-hidden className="mx-0.5 h-4 w-px flex-none bg-border" />;
}

function BlockMenu({
  commands,
  label,
  onOpenChange,
}: {
  commands: EditorCommands;
  label: string | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Block type"
          className="inline-flex h-7 w-[108px] flex-none items-center justify-between gap-1 rounded-sm px-2 text-xs whitespace-nowrap text-text-secondary hover:bg-hover hover:text-text"
        >
          {label ?? (commands.isActive('codeBlock') ? 'Code block' : 'Mixed')}
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
  );
}

interface MoreMenuProps {
  tools: readonly ToolSpec[];
  commands: EditorCommands;
  attachDisabled: string | undefined;
  onRun: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  /** The link popover opens from ⋯ while the Link tool is in here. */
  anchorsLink: boolean;
}

function MoreMenu({ tools, commands, attachDisabled, onRun, onOpenChange, anchorsLink }: MoreMenuProps) {
  const trigger = (
    <DropdownMenuTrigger asChild>
      <ToolButton label="More formatting" active={tools.some(t => t.active)}>
        <Ellipsis />
      </ToolButton>
    </DropdownMenuTrigger>
  );
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <Divider />
      <Tooltip>
        <TooltipTrigger asChild>
          {anchorsLink ? <PopoverAnchor asChild>{trigger}</PopoverAnchor> : trigger}
        </TooltipTrigger>
        <TooltipContent>More formatting</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56" onCloseAutoFocus={e => e.preventDefault()}>
        {tools.map(tool => {
          const Icon = tool.icon;
          if (tool.id === 'table' && commands.inTable) {
            return (
              <DropdownMenuSub key={tool.id}>
                <DropdownMenuSubTrigger>
                  <Icon /> Table
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  <TableItems commands={commands} />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          }
          const disabled = tool.id === 'attach' ? attachDisabled : undefined;
          return (
            <DropdownMenuItem
              key={tool.id}
              disabled={Boolean(disabled)}
              // The link form opens once the menu has closed, or the closing menu would dismiss it.
              onSelect={() => (tool.id === 'link' ? requestAnimationFrame(() => onRun('link')) : onRun(tool.id))}
              className="items-start"
            >
              <Icon className="mt-0.5" />
              <span className="flex min-w-0 flex-1 flex-col">
                {tool.label}
                {disabled ? <span className="text-xs text-text-secondary">{disabled}</span> : null}
              </span>
              {tool.active ? (
                <Check className="mt-0.5 size-3.5" aria-label="On" />
              ) : tool.keys ? (
                <span className="text-xs text-text-muted">{tool.keys}</span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ToolProps {
  label: string;
  keys?: string | undefined;
  hint?: string | undefined;
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
        <span className="inline-flex flex-none">
          <ToolButton label={label} active={active} disabled={disabled} onClick={onClick}>
            {children}
          </ToolButton>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {keys ? <span className="ml-2 text-text-muted">{keys}</span> : null}
        {hint ? <span className="block max-w-64 text-text-muted">{hint}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

interface ToolButtonProps extends ComponentProps<'button'> {
  label: string;
  active?: boolean;
}

function ToolButton({ label, active = false, className, children, ...props }: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      {...props}
      className={cn(
        'inline-flex size-7 flex-none items-center justify-center rounded-sm text-text-secondary hover:bg-hover hover:text-text disabled:pointer-events-none disabled:text-text-disabled [&_svg]:size-4',
        active && 'bg-active text-text',
        className,
      )}
    >
      {children}
    </button>
  );
}

function LinkForm({ open, commands, onClose }: { open: boolean; commands: EditorCommands; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [current, setCurrent] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const link = commands.currentLink();
      setCurrent(link);
      setUrl(link ?? '');
    }
  }

  return (
    <PopoverContent align="start" className="w-80 p-3" onCloseAutoFocus={e => e.preventDefault()}>
      <form
        noValidate
        className="flex flex-col gap-2"
        onSubmit={e => {
          e.preventDefault();
          e.stopPropagation();
          const trimmed = url.trim();
          if (trimmed) commands.setLink(trimmed);
          onClose();
        }}
      >
        <label htmlFor="editor-link-url" className="text-2xs font-medium text-text-secondary">
          Link address
        </label>
        <input
          id="editor-link-url"
          data-slot="input"
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
                onClose();
              }}
            >
              Remove link
            </Button>
          ) : null}
        </div>
      </form>
    </PopoverContent>
  );
}

function TableItems({ commands }: { commands: EditorCommands }) {
  return (
    <>
      {TABLE_ACTIONS.map((group, i) => (
        <Fragment key={group[0]!.action}>
          {i > 0 ? <DropdownMenuSeparator /> : null}
          {group.map(item => (
            <DropdownMenuItem key={item.action} onSelect={() => commands.table(item.action)}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </Fragment>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={() => commands.table('deleteTable')}>
        Delete table
      </DropdownMenuItem>
    </>
  );
}

function TableMenu({ commands, onOpenChange }: { commands: EditorCommands; onOpenChange: (open: boolean) => void }) {
  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Table"
          aria-pressed
          className="inline-flex h-7 flex-none items-center gap-0.5 rounded-sm bg-active px-1.5 text-text hover:bg-hover [&_svg]:size-4"
        >
          <Table2 />
          <ChevronDown className="size-3!" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48" onCloseAutoFocus={e => e.preventDefault()}>
        <TableItems commands={commands} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

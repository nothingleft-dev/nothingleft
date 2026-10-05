'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import { ChevronRight, GripVertical, Plus } from 'lucide-react';
import { ARTICLE_HIERARCHY_MAX_DEPTH, type ArticleNode } from '@nothingleft/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { DraftMark } from '@components/articles/draft-mark';
import { useCollapsedArticles, useMoveArticle } from '@hooks/use-articles';
import { isApiError } from '@lib/api/errors';
import { ancestorsOf, canDrop, siblingsOf, subtree, visibleRows, type DropTarget } from '@lib/articles/tree';
import { cn } from '@lib/utils';

const INDENT = 14;
// A drop in the top or bottom quarter of a row lands beside it; the middle half nests inside.
const EDGE = 0.25;

interface ArticleTreeProps {
  project: string;
  nodes: readonly ArticleNode[];
  current: string | null;
  canMove: boolean;
  canCreate: boolean;
  onCreateChild: (parent: string) => void;
}

export function ArticleTree({ project, nodes, current, canMove, canCreate, onCreateChild }: ArticleTreeProps) {
  const { collapsed, toggle } = useCollapsedArticles(project);
  const move = useMoveArticle(project);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [refusal, setRefusal] = useState<{ slug: string; message: string } | null>(null);
  const pointerY = useRef(0);

  // The open article's branch is always unfolded, whatever was folded before.
  const open = useMemo(() => new Set(current ? ancestorsOf(nodes, current) : []), [nodes, current]);
  const folded = useMemo(() => new Set([...collapsed].filter(s => !open.has(s))), [collapsed, open]);
  const hiddenWhileDragging = useMemo(
    () =>
      new Set(
        dragging
          ? subtree(nodes, dragging)
              .slice(1)
              .map(n => n.slug)
          : [],
      ),
    [nodes, dragging],
  );
  const rows = visibleRows(nodes, folded).filter(n => !hiddenWhileDragging.has(n.slug));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const send = (slug: string, drop: DropTarget) => {
    if (!canDrop(nodes, slug, drop)) {
      setRefusal({ slug, message: `Articles nest at most ${ARTICLE_HIERARCHY_MAX_DEPTH} levels deep.` });
      return;
    }
    setRefusal(null);
    move.mutate(
      { slug, target: drop, nodes },
      {
        onError: error =>
          setRefusal({ slug, message: isApiError(error) ? error.message : 'The article could not be moved.' }),
      },
    );
  };

  const placeFor = (event: DragMoveEvent | DragEndEvent): DropTarget | null => {
    const over = event.over;
    const active = String(event.active.id);
    if (!over || over.id === active) return null;
    const slug = String(over.id);
    // Measured now, against the live pointer: the rects dnd-kit took at drag start drift in a scrolled rail.
    const rect = document.querySelector(`[data-tree-row="${CSS.escape(slug)}"]`)?.getBoundingClientRect();
    const ratio = rect?.height ? (pointerY.current - rect.top) / rect.height : 0.5;
    const node = nodes.find(n => n.slug === slug);
    const place = ratio < EDGE ? 'before' : ratio > 1 - EDGE ? 'after' : 'inside';
    const drop: DropTarget = { slug, place };
    if (place === 'inside' && node && node.depth >= ARTICLE_HIERARCHY_MAX_DEPTH) {
      return { slug, place: ratio < 0.5 ? 'before' : 'after' };
    }
    return drop;
  };

  const trackPointer = (e: PointerEvent) => {
    pointerY.current = e.clientY;
  };
  const onDragStart = (event: DragStartEvent) => {
    setRefusal(null);
    setDragging(String(event.active.id));
    pointerY.current = (event.activatorEvent as PointerEvent).clientY ?? 0;
    window.addEventListener('pointermove', trackPointer);
  };
  const stopTracking = () => window.removeEventListener('pointermove', trackPointer);
  const onDragMove = (event: DragMoveEvent) => setTarget(placeFor(event));
  const onDragEnd = (event: DragEndEvent) => {
    stopTracking();
    const drop = placeFor(event);
    const slug = String(event.active.id);
    setDragging(null);
    setTarget(null);
    if (drop) send(slug, drop);
  };

  // Alt+↑/↓ reorders among siblings; Alt+→ nests under the sibling above, Alt+← moves up a level.
  const onRowKeyDown = (event: KeyboardEvent, node: ArticleNode) => {
    if (!canMove || !event.altKey) return;
    const siblings = siblingsOf(nodes, node.slug);
    const at = siblings.findIndex(n => n.slug === node.slug);
    let drop: DropTarget | null = null;
    if (event.key === 'ArrowUp' && at > 0) drop = { slug: siblings[at - 1]!.slug, place: 'before' };
    if (event.key === 'ArrowDown' && at < siblings.length - 1) drop = { slug: siblings[at + 1]!.slug, place: 'after' };
    if (event.key === 'ArrowRight' && at > 0) drop = { slug: siblings[at - 1]!.slug, place: 'inside' };
    if (event.key === 'ArrowLeft' && node.parent) drop = { slug: node.parent, place: 'after' };
    if (!drop) return;
    event.preventDefault();
    send(node.slug, drop);
  };

  const draggedNode = dragging ? nodes.find(n => n.slug === dragging) : null;
  const allowed = dragging && target ? canDrop(nodes, dragging, target) : true;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        stopTracking();
        setDragging(null);
        setTarget(null);
      }}
    >
      <ul role="tree" aria-label="Articles" className="flex flex-col">
        {rows.map(node => (
          <TreeRow
            key={node.slug}
            project={project}
            node={node}
            active={node.slug === current}
            folded={folded.has(node.slug)}
            onFold={fold => toggle(node.slug, fold)}
            canMove={canMove}
            canCreate={canCreate && node.depth < ARTICLE_HIERARCHY_MAX_DEPTH}
            onCreateChild={() => onCreateChild(node.slug)}
            onKeyDown={event => onRowKeyDown(event, node)}
            drop={target?.slug === node.slug ? { place: target.place, allowed } : null}
            refusal={refusal?.slug === node.slug ? refusal.message : null}
          />
        ))}
      </ul>
      <DragOverlay dropAnimation={null} modifiers={[besideCursor]}>
        {draggedNode ? (
          <div className="flex h-7 w-max max-w-60 items-center gap-1.5 rounded-sm border bg-raised px-2 text-sm shadow-popover">
            <GripVertical className="size-3.5 text-text-muted" />
            <span className="truncate">{draggedNode.title}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// The row travels just below and right of the pointer, so the row it is over stays readable.
const besideCursor: Modifier = ({ transform, activatorEvent, draggingNodeRect }) => {
  if (!draggingNodeRect || !(activatorEvent instanceof PointerEvent)) return transform;
  return {
    ...transform,
    x: transform.x + activatorEvent.clientX - draggingNodeRect.left + 14,
    y: transform.y + activatorEvent.clientY - draggingNodeRect.top + 10,
  };
};

interface TreeRowProps {
  project: string;
  node: ArticleNode;
  active: boolean;
  folded: boolean;
  onFold: (fold: boolean) => void;
  canMove: boolean;
  canCreate: boolean;
  onCreateChild: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
  drop: { place: DropTarget['place']; allowed: boolean } | null;
  refusal: string | null;
}

function TreeRow({
  project,
  node,
  active,
  folded,
  onFold,
  canMove,
  canCreate,
  onCreateChild,
  onKeyDown,
  drop,
  refusal,
}: TreeRowProps) {
  // The whole row is what moves (and what the overlay measures); only the grip starts it.
  const {
    setNodeRef: setDragRef,
    setActivatorNodeRef,
    listeners,
    attributes,
    isDragging,
  } = useDraggable({
    id: node.slug,
    disabled: !canMove,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: node.slug, disabled: !canMove });
  const setRowRef = (el: HTMLDivElement | null) => {
    setDragRef(el);
    setDropRef(el);
  };
  const hasChildren = node.child_count > 0;
  const pad = (node.depth - 1) * INDENT;

  return (
    <li
      role="treeitem"
      aria-level={node.depth}
      aria-expanded={hasChildren ? !folded : undefined}
      aria-selected={active}
      className="relative"
    >
      <div
        ref={setRowRef}
        data-tree-row={node.slug}
        className={cn(
          'group/row relative flex h-7 items-center gap-0.5 rounded-sm pr-1 text-text-secondary hover:bg-hover hover:text-text',
          active && 'bg-active text-text',
          isDragging && 'opacity-40',
          drop?.place === 'inside' && (drop.allowed ? 'bg-brand-soft ring-1 ring-brand' : 'ring-1 ring-danger-fg'),
        )}
        style={{ paddingLeft: pad }}
      >
        {active ? <span aria-hidden className="absolute top-1 bottom-1 left-0 w-0.5 rounded-full bg-brand" /> : null}
        {drop && drop.place !== 'inside' ? (
          <span
            aria-hidden
            className={cn(
              'pointer-events-none absolute right-1 h-0.5 rounded-full',
              drop.allowed ? 'bg-brand' : 'bg-danger-fg',
              drop.place === 'before' ? '-top-px' : '-bottom-px',
            )}
            style={{ left: pad + 20 }}
          />
        ) : null}
        {hasChildren ? (
          <button
            type="button"
            aria-label={folded ? `Expand ${node.title}` : `Collapse ${node.title}`}
            onClick={() => onFold(!folded)}
            className="grid size-5 flex-none place-items-center rounded-xs text-text-muted hover:bg-active hover:text-text"
          >
            <ChevronRight className={cn('size-3 transition-transform duration-(--dur-fast)', !folded && 'rotate-90')} />
          </button>
        ) : (
          <span className="size-5 flex-none" />
        )}
        <Link
          href={`/projects/${project}/articles/${node.slug}` as Route}
          aria-current={active ? 'page' : undefined}
          onKeyDown={onKeyDown}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xs py-1 text-sm"
        >
          <span className={cn('truncate', node.status === 'draft' && 'text-text-secondary')}>{node.title}</span>
          {node.status === 'draft' ? <DraftMark /> : null}
        </Link>
        {canCreate ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={`New article under ${node.title}`}
                onClick={onCreateChild}
                className="grid size-5 flex-none place-items-center rounded-xs text-text-muted opacity-0 group-hover/row:opacity-100 hover:bg-active hover:text-text focus-visible:opacity-100"
              >
                <Plus className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">New article under this one</TooltipContent>
          </Tooltip>
        ) : null}
        {canMove ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                ref={setActivatorNodeRef}
                {...listeners}
                {...attributes}
                aria-label={`Move ${node.title}`}
                className="grid size-5 flex-none cursor-grab place-items-center rounded-xs text-text-muted opacity-0 group-hover/row:opacity-100 hover:bg-active hover:text-text focus-visible:opacity-100 active:cursor-grabbing"
              >
                <GripVertical className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Drag to move · Alt + arrows on a focused title</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {refusal ? (
        <p role="alert" className="py-1 pr-1 text-2xs text-danger-fg" style={{ paddingLeft: pad + 22 }}>
          {refusal}
        </p>
      ) : null}
    </li>
  );
}

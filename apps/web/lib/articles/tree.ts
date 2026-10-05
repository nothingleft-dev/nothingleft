import { ARTICLE_HIERARCHY_MAX_DEPTH, type ArticleNode, type UpdateArticle } from '@nothingleft/types';

export type DropPlace = 'before' | 'after' | 'inside';
export interface DropTarget {
  slug: string;
  place: DropPlace;
}

/** The node and everything beneath it: the rows that follow it deeper than it is. */
export function subtree(nodes: readonly ArticleNode[], slug: string): ArticleNode[] {
  const start = nodes.findIndex(n => n.slug === slug);
  if (start < 0) return [];
  const root = nodes[start]!;
  let end = start + 1;
  while (end < nodes.length && nodes[end]!.depth > root.depth) end++;
  return nodes.slice(start, end);
}

const height = (branch: readonly ArticleNode[]) =>
  branch.length === 0 ? 0 : Math.max(...branch.map(n => n.depth)) - branch[0]!.depth + 1;

/** Whether the move is one the API would take: never into itself, never past three levels. */
export function canDrop(nodes: readonly ArticleNode[], slug: string, target: DropTarget): boolean {
  const branch = subtree(nodes, slug);
  if (branch.length === 0 || branch.some(n => n.slug === target.slug)) return false;
  const anchor = nodes.find(n => n.slug === target.slug);
  if (!anchor) return false;
  const depth = target.place === 'inside' ? anchor.depth + 1 : anchor.depth;
  return depth + height(branch) - 1 <= ARTICLE_HIERARCHY_MAX_DEPTH;
}

/** The PATCH a drop becomes: the new parent, and the sibling it lands beside. */
export function dropBody(nodes: readonly ArticleNode[], target: DropTarget): UpdateArticle {
  const anchor = nodes.find(n => n.slug === target.slug)!;
  if (target.place === 'inside') return { parent: anchor.slug };
  return { parent: anchor.parent, [target.place]: anchor.slug };
}

/** The tree as it will look after the drop, drawn before the server answers. */
export function applyDrop(nodes: readonly ArticleNode[], slug: string, target: DropTarget): ArticleNode[] {
  const branch = subtree(nodes, slug);
  const rest = nodes.filter(n => !branch.includes(n));
  const anchor = rest.find(n => n.slug === target.slug);
  if (!anchor || branch.length === 0) return [...nodes];
  const root = branch[0]!;
  const depth = target.place === 'inside' ? anchor.depth + 1 : anchor.depth;
  const parent = target.place === 'inside' ? anchor.slug : anchor.parent;
  const shift = depth - root.depth;
  const moved = branch.map((n, i) => (i === 0 ? { ...n, depth, parent } : { ...n, depth: n.depth + shift }));

  const at = rest.indexOf(anchor);
  const insertAt = target.place === 'before' ? at : at + subtree(rest, anchor.slug).length;
  const next = [...rest.slice(0, insertAt), ...moved, ...rest.slice(insertAt)];
  return withChildCounts(next);
}

function withChildCounts(nodes: ArticleNode[]): ArticleNode[] {
  const counts = new Map<string, number>();
  for (const n of nodes) if (n.parent) counts.set(n.parent, (counts.get(n.parent) ?? 0) + 1);
  return nodes.map(n => ({ ...n, child_count: counts.get(n.slug) ?? 0 }));
}

/** The rows a reader sees: descendants of a collapsed node are hidden. */
export function visibleRows(nodes: readonly ArticleNode[], collapsed: ReadonlySet<string>): ArticleNode[] {
  const rows: ArticleNode[] = [];
  let hideBelow: number | null = null;
  for (const n of nodes) {
    if (hideBelow !== null && n.depth > hideBelow) continue;
    hideBelow = null;
    rows.push(n);
    if (n.child_count > 0 && collapsed.has(n.slug)) hideBelow = n.depth;
  }
  return rows;
}

/** Ancestors of a node, root first — so the current article's branch can be opened. */
export function ancestorsOf(nodes: readonly ArticleNode[], slug: string): string[] {
  const bySlug = new Map(nodes.map(n => [n.slug, n]));
  const chain: string[] = [];
  let parent = bySlug.get(slug)?.parent ?? null;
  while (parent && !chain.includes(parent)) {
    chain.unshift(parent);
    parent = bySlug.get(parent)?.parent ?? null;
  }
  return chain;
}

/** Siblings of a node, in order, for the Alt+arrow moves. */
export function siblingsOf(nodes: readonly ArticleNode[], slug: string): ArticleNode[] {
  const node = nodes.find(n => n.slug === slug);
  if (!node) return [];
  return nodes.filter(n => n.parent === node.parent && n.depth === node.depth);
}

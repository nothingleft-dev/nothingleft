import type { ArticleTreeRow } from '@nothingleft/db';

/** One project's live articles as a tree, with the reader's view of it: unreadable drafts are skipped. */
export interface ArticleTree {
  byId: ReadonlyMap<number, ArticleTreeRow>;
  /** Live children in sibling order, drafts included. */
  childrenOf(parentId: number | null): ArticleTreeRow[];
  /** 1 at the top. */
  depth(id: number): number;
  /** Levels from this article down, itself counted: a leaf is 1. */
  height(id: number): number;
  /** Everything beneath, at any depth, in depth-first order. */
  descendants(id: number): ArticleTreeRow[];
  /** Ancestors, the root first. */
  ancestors(id: number): ArticleTreeRow[];
}

export function articleTree(rows: readonly ArticleTreeRow[]): ArticleTree {
  const byId = new Map(rows.map(r => [r.id, r]));
  const children = new Map<number | null, ArticleTreeRow[]>();
  for (const row of rows) {
    const parent = row.parent_id !== null && byId.has(row.parent_id) ? row.parent_id : null;
    const list = children.get(parent) ?? [];
    list.push(row);
    children.set(parent, list);
  }
  for (const list of children.values()) list.sort((a, b) => a.position - b.position || a.id - b.id);

  const childrenOf = (parentId: number | null) => children.get(parentId) ?? [];
  const ancestors = (id: number): ArticleTreeRow[] => {
    const out: ArticleTreeRow[] = [];
    const seen = new Set<number>([id]);
    let parent = byId.get(id)?.parent_id ?? null;
    while (parent !== null && byId.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      out.unshift(byId.get(parent)!);
      parent = byId.get(parent)!.parent_id;
    }
    return out;
  };
  const descendants = (id: number): ArticleTreeRow[] =>
    childrenOf(id).flatMap(child => [child, ...descendants(child.id)]);
  const height = (id: number): number => 1 + Math.max(0, ...childrenOf(id).map(c => height(c.id)));

  return { byId, childrenOf, depth: id => ancestors(id).length + 1, height, descendants, ancestors };
}

export interface VisibleNode {
  row: ArticleTreeRow;
  /** The nearest readable ancestor. */
  parent: ArticleTreeRow | null;
  depth: number;
  childCount: number;
}

/**
 * The tree as one reader sees it, depth-first: an article whose parent they cannot read sits
 * under the nearest ancestor they can, or at the top.
 */
export function visibleTree(tree: ArticleTree, readable: (row: ArticleTreeRow) => boolean): VisibleNode[] {
  const order: ArticleTreeRow[] = [];
  const walk = (parentId: number | null) => {
    for (const child of tree.childrenOf(parentId)) {
      order.push(child);
      walk(child.id);
    }
  };
  walk(null);

  const visible = order.filter(readable);
  const visibleIds = new Set(visible.map(r => r.id));
  const nearest = (row: ArticleTreeRow) =>
    tree
      .ancestors(row.id)
      .reverse()
      .find(a => visibleIds.has(a.id)) ?? null;
  const parents = new Map(visible.map(r => [r.id, nearest(r)]));
  const childCount = new Map<number, number>();
  for (const parent of parents.values()) if (parent) childCount.set(parent.id, (childCount.get(parent.id) ?? 0) + 1);
  const depth = (row: ArticleTreeRow): number => {
    const parent = parents.get(row.id);
    return parent ? depth(parent) + 1 : 1;
  };
  return visible.map(row => ({
    row,
    parent: parents.get(row.id) ?? null,
    depth: depth(row),
    childCount: childCount.get(row.id) ?? 0,
  }));
}

/** New positions for a sibling list, 0…n-1, listing only the rows whose position changes. */
export function renumber(
  siblings: readonly Pick<ArticleTreeRow, 'id' | 'position'>[],
): { id: number; position: number }[] {
  return siblings.flatMap((row, position) => (row.position === position ? [] : [{ id: row.id, position }]));
}

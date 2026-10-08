interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const textOf = (node: HastNode): string => node.value ?? (node.children ?? []).map(textOf).join('');

function headerLabel(table: HastNode): string {
  const headers: string[] = [];
  const collect = (node: HastNode) => {
    if (node.type === 'element' && node.tagName === 'th') headers.push(textOf(node).trim());
    else node.children?.forEach(collect);
  };
  collect(table);
  const named = headers.filter(Boolean);
  return named.length > 0 ? `Table: ${named.join(', ')}` : 'Table';
}

// Wide tables scroll inside a labelled, focusable region so keyboard users can reach the overflow.
export function rehypeWrapTables() {
  const walk = (node: HastNode) => {
    node.children = node.children?.map(child => {
      if (child.type === 'element' && child.tagName === 'table') {
        return {
          type: 'element',
          tagName: 'div',
          properties: { className: ['table-wrap'], tabIndex: 0, role: 'region', ariaLabel: headerLabel(child) },
          children: [child],
        };
      }
      walk(child);
      return child;
    });
  };
  return (tree: HastNode) => walk(tree);
}

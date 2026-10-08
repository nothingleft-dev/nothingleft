interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const HEADING = /^h[2-6]$/;

const textOf = (node: HastNode): string => node.value ?? (node.children ?? []).map(textOf).join('');

function headerNames(table: HastNode): string[] {
  const headers: string[] = [];
  const collect = (node: HastNode) => {
    if (node.type === 'element' && node.tagName === 'th') headers.push(textOf(node).trim());
    else node.children?.forEach(collect);
  };
  collect(table);
  return headers.filter(Boolean);
}

function tableLabel(table: HastNode, section: string): string {
  const columns = headerNames(table).join(', ');
  if (section && columns) return `Table: ${section} (${columns})`;
  return `Table: ${section || columns}`.replace(/: $/, '');
}

// Wide tables scroll inside a labelled, focusable region so keyboard users can reach the overflow.
// Pages repeat column sets, so the label leads with the section heading and every region stays unique.
export function rehypeWrapTables() {
  return (tree: HastNode) => {
    let section = '';
    const used = new Map<string, number>();
    const uniqueLabel = (label: string) => {
      const count = (used.get(label) ?? 0) + 1;
      used.set(label, count);
      return count === 1 ? label : `${label} ${count}`;
    };
    const walk = (node: HastNode) => {
      node.children = node.children?.map(child => {
        if (child.type !== 'element') return child;
        if (HEADING.test(child.tagName ?? '')) section = textOf(child).trim();
        if (child.tagName === 'table') {
          return {
            type: 'element',
            tagName: 'div',
            properties: {
              className: ['table-wrap'],
              tabIndex: 0,
              role: 'region',
              ariaLabel: uniqueLabel(tableLabel(child, section)),
            },
            children: [child],
          };
        }
        walk(child);
        return child;
      });
    };
    walk(tree);
  };
}

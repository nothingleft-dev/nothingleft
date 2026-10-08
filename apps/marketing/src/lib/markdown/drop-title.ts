interface HastNode {
  type: string;
  tagName?: string;
  children?: HastNode[];
}

// The page renders the article title itself, above the article actions, so the body drops its own.
export function rehypeDropTitle() {
  return (tree: HastNode) => {
    const index = tree.children?.findIndex(node => node.type === 'element' && node.tagName === 'h1') ?? -1;
    if (index >= 0) tree.children?.splice(index, 1);
  };
}

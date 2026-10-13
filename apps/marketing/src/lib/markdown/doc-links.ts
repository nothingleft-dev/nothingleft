import { GITHUB_URL } from '../site';

interface MdNode {
  type: string;
  url?: string;
  children?: MdNode[];
}

const SIBLING_DOC = /^(?:\.\/)?([a-z0-9-]+)\.md([?#].*)?$/;
const REPO_DOC = /^\.\.\/([a-z0-9/._-]+\.(?:md|yaml|yml))(#.*)?$/;

export function rewriteDocHref(url: string): string {
  const sibling = SIBLING_DOC.exec(url);
  if (sibling) return `/docs/${sibling[1]}${sibling[2] ?? ''}`;
  const repo = REPO_DOC.exec(url);
  if (repo) return `${GITHUB_URL}/blob/main/docs/${repo[1]}${repo[2] ?? ''}`;
  return url;
}

// Manual pages link each other as files, which works on GitHub; the site serves them as routes.
export function remarkDocLinks() {
  const walk = (node: MdNode) => {
    if ((node.type === 'link' || node.type === 'definition') && node.url) node.url = rewriteDocHref(node.url);
    node.children?.forEach(walk);
  };
  return (tree: MdNode) => walk(tree);
}

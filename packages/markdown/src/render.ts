import type { Element, Root as HastRoot } from 'hast';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { remarkReferenceLinks, type ReferenceLinkOptions } from './references.ts';
import { sanitizeSchema } from './schema.ts';

export interface RenderOptions {
  mentionHref?: (username: string) => string;
  issueHref?: (key: string) => string;
  /** Resolution is live state the caller looks up; the source only holds the key. */
  isResolvedIssue?: (key: string) => boolean;
  /** Stored dimensions for an image `src`, so the page reserves its space before the bytes arrive. */
  imageSize?: (src: string) => ImageSize | null | undefined;
}

export interface ImageSize {
  width: number;
  height: number;
}

const defaultIssueHref = (key: string) => `/issue/${key}`;

function rehypeTaskIndexes() {
  return (tree: HastRoot): void => {
    let index = 0;
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'input' && node.properties.type === 'checkbox') {
        node.properties.dataTask = String(index);
        index += 1;
      }
    });
  };
}

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

function rehypeExternalLinks() {
  return (tree: HastRoot): void => {
    visit(tree, 'element', (node: Element) => {
      const href = node.properties.href;
      if (node.tagName !== 'a' || typeof href !== 'string') return;
      if (!ABSOLUTE_URL.test(href) || href.startsWith('mailto:')) return;
      node.properties.target = '_blank';
      node.properties.rel = ['noopener', 'noreferrer', 'nofollow'];
    });
  };
}

// Runs after sanitising: the numbers come from the caller, never from the source.
function rehypeImageSizes(imageSize: RenderOptions['imageSize']) {
  return (tree: HastRoot): void => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'img') return;
      node.properties.loading = 'lazy';
      const src = node.properties.src;
      const size = typeof src === 'string' ? imageSize?.(src) : null;
      if (!size) return;
      node.properties.width = size.width;
      node.properties.height = size.height;
    });
  };
}

function processor(options: RenderOptions) {
  const links: ReferenceLinkOptions = {
    mentionHref: options.mentionHref,
    issueHref: options.issueHref ?? defaultIssueHref,
    isResolvedIssue: options.isResolvedIssue,
  };
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkReferenceLinks, links)
    .use(remarkRehype)
    .use(rehypeHighlight)
    .use(rehypeTaskIndexes)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeExternalLinks)
    .use(rehypeImageSizes, options.imageSize)
    .use(rehypeStringify);
}

/** Markdown → sanitised HTML. Raw HTML in the source is dropped, not passed through. */
export function renderMarkdown(markdown: string, options: RenderOptions = {}): string {
  return String(processor(options).processSync(markdown));
}

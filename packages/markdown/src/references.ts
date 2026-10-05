import type { Node, Parent, PhrasingContent, Root, Text } from 'mdast';
import { parseIssueKey, parseUsername } from '@nothingleft/format';
import { parseMarkdown } from './parse.ts';

export interface MarkdownReferences {
  mentions: string[];
  issueKeys: string[];
}

export type TextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'mention'; username: string; raw: string }
  | { kind: 'issue'; key: string; raw: string };

// Prose extraction is stricter than parseIssueKey: uppercase, and at least one
// letter, so `2026-9` and `10-5` in running text are never taken for issues.
const REFERENCE =
  /(?<![\w@])@(?<mention>[a-z0-9](?:[a-z0-9._-]{0,37}[a-z0-9])?)|(?<![\w-])(?<issue>(?=[A-Z0-9]*[A-Z])[A-Z0-9]{2,10}-[1-9]\d*)(?![\w-])/gi;

export function splitReferences(value: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of value.matchAll(REFERENCE)) {
    const groups = match.groups as { mention?: string; issue?: string };
    const raw = match[0];
    const index = match.index;
    let segment: TextSegment | null = null;
    if (groups.mention !== undefined) {
      const username = parseUsername(groups.mention);
      if (username) segment = { kind: 'mention', username, raw };
    } else if (groups.issue !== undefined && groups.issue === groups.issue.toUpperCase()) {
      const key = parseIssueKey(groups.issue);
      if (key) segment = { kind: 'issue', key: `${key.projectKey}-${key.number}`, raw };
    }
    if (!segment) continue;
    if (index > cursor) segments.push({ kind: 'text', value: value.slice(cursor, index) });
    segments.push(segment);
    cursor = index + raw.length;
  }
  if (cursor < value.length) segments.push({ kind: 'text', value: value.slice(cursor) });
  return segments;
}

const OPAQUE_PARENTS = new Set(['link', 'linkReference', 'inlineCode', 'code', 'html', 'definition']);

function isParent(node: Node): node is Parent {
  return Array.isArray((node as Parent).children);
}

/** Visits every prose text node, skipping code and anything already a link. */
export function visitProseText(tree: Root, onText: (node: Text, index: number, parent: Parent) => number | void): void {
  const walk = (node: Node): void => {
    if (OPAQUE_PARENTS.has(node.type) || !isParent(node)) return;
    for (let index = 0; index < node.children.length; index += 1) {
      const child = node.children[index] as Node;
      if (child.type === 'text') {
        const skip = onText(child as Text, index, node);
        if (typeof skip === 'number') index += skip;
      } else {
        walk(child);
      }
    }
  };
  walk(tree);
}

export function extractReferences(markdown: string): MarkdownReferences {
  const mentions = new Set<string>();
  const issueKeys = new Set<string>();
  visitProseText(parseMarkdown(markdown), node => {
    for (const segment of splitReferences(node.value)) {
      if (segment.kind === 'mention') mentions.add(segment.username);
      else if (segment.kind === 'issue') issueKeys.add(segment.key);
    }
  });
  return { mentions: [...mentions], issueKeys: [...issueKeys] };
}

export const extractMentions = (markdown: string): string[] => extractReferences(markdown).mentions;
export const extractIssueKeys = (markdown: string): string[] => extractReferences(markdown).issueKeys;

export interface ReferenceLinkOptions {
  mentionHref?: ((username: string) => string) | undefined;
  issueHref: (key: string) => string;
  isResolvedIssue?: ((key: string) => boolean) | undefined;
}

function toNode(segment: TextSegment, options: ReferenceLinkOptions): PhrasingContent {
  switch (segment.kind) {
    case 'text':
      return { type: 'text', value: segment.value };
    case 'mention': {
      const hProperties = { className: ['mention'], dataMention: segment.username };
      const text: Text = { type: 'text', value: segment.raw };
      if (!options.mentionHref) return { ...text, data: { hName: 'span', hProperties } };
      return { type: 'link', url: options.mentionHref(segment.username), data: { hProperties }, children: [text] };
    }
    case 'issue':
      return {
        type: 'link',
        url: options.issueHref(segment.key),
        data: {
          hProperties: {
            className: options.isResolvedIssue?.(segment.key) ? ['issue-key', 'resolved'] : ['issue-key'],
            dataIssueKey: segment.key,
          },
        },
        children: [{ type: 'text', value: segment.raw }],
      };
  }
}

export function remarkReferenceLinks(options: ReferenceLinkOptions) {
  return (tree: Root): void => {
    visitProseText(tree, (node, index, parent) => {
      const segments = splitReferences(node.value);
      if (segments.length === 1 && segments[0]?.kind === 'text') return;
      const replacement = segments.map(segment => toNode(segment, options));
      parent.children.splice(index, 1, ...replacement);
      return replacement.length - 1;
    });
  };
}

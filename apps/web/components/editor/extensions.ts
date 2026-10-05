import { Extension, type AnyExtension } from '@tiptap/react';
import { PluginKey } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import Suggestion from '@tiptap/suggestion';
import { common, createLowlight } from 'lowlight';
import type { ReferenceQuery, ReferenceTrigger } from '@components/editor/reference-picker';

const lowlight = createLowlight(common);

export interface ReferenceBridge {
  open: (query: ReferenceQuery) => void;
  close: () => void;
  keyDown: (event: KeyboardEvent) => boolean;
  /** False when the host offers no submit, so the key keeps its default. */
  submit: () => boolean;
}

// Outranks the hard-break binding StarterKit puts on Mod-Enter.
const submitShortcut = (bridge: ReferenceBridge) =>
  Extension.create({
    name: 'submit-shortcut',
    priority: 1000,
    addKeyboardShortcuts: () => ({ 'Mod-Enter': () => bridge.submit() }),
  });

// Mentions and keys are stored as the plain text `@alex` / `PMS-12`: markdown holds no node for either,
// so the picker inserts text and the renderer does the linking.
function referenceSuggestion(trigger: ReferenceTrigger, bridge: ReferenceBridge) {
  return Extension.create({
    name: `reference-${trigger === '@' ? 'mention' : 'issue'}`,
    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: trigger,
          pluginKey: new PluginKey(`reference-${trigger}`),
          allow: ({ editor }) => !editor.isActive('code') && !editor.isActive('codeBlock'),
          render: () => {
            const push = (props: {
              query: string;
              clientRect?: (() => DOMRect | null) | null;
              range: { from: number; to: number };
            }) =>
              bridge.open({
                trigger,
                query: props.query,
                rect: () => props.clientRect?.() ?? null,
                insert: text => this.editor.chain().focus().insertContentAt(props.range, `${text} `).run(),
              });
            return {
              onStart: push,
              onUpdate: push,
              onKeyDown: ({ event }) => bridge.keyDown(event),
              onExit: () => bridge.close(),
            };
          },
        }),
      ];
    },
  });
}

export function editorExtensions(placeholder: string, bridge: ReferenceBridge): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      underline: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow' } },
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Image,
    Placeholder.configure({ placeholder }),
    Markdown,
    referenceSuggestion('@', bridge),
    referenceSuggestion('#', bridge),
    submitShortcut(bridge),
  ];
}

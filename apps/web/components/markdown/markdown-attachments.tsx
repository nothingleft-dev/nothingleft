'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Attachment } from '@nothingleft/types';

const MarkdownAttachmentsContext = createContext<ReadonlyMap<string, Attachment>>(new Map());

/** The issue's files by URL, so rendered markdown can reserve each image's box and name it in the lightbox. */
export function MarkdownAttachments({ files, children }: { files: readonly Attachment[]; children: ReactNode }) {
  const byUrl = useMemo(() => new Map(files.map(f => [f.url, f])), [files]);
  return <MarkdownAttachmentsContext.Provider value={byUrl}>{children}</MarkdownAttachmentsContext.Provider>;
}

export const useMarkdownAttachments = () => useContext(MarkdownAttachmentsContext);

import { ATTACHMENT_INLINE_MIME_TYPES } from '@nothingleft/types';

/** The file's SHA-256 as base64, the form presign signs into the upload URL. */
export async function sha256Base64(file: Blob): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export const mimeOf = (file: File) => file.type.trim().toLowerCase() || 'application/octet-stream';

/** An image the files route serves inline, so markdown can show it. SVG downloads, so it is a link. */
export const isInlineImage = (mime: string) =>
  mime.startsWith('image/') && (ATTACHMENT_INLINE_MIME_TYPES as readonly string[]).includes(mime);

export async function imageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!isInlineImage(mimeOf(file))) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size.width > 0 && size.height > 0 ? size : null;
  } catch {
    return null;
  }
}

export const escapeMarkdownLabel = (text: string) => text.replace(/[[\]\\]/g, '\\$&');

/** What markdown stores for a file: the permanent URL, as an image or a download link. */
export const attachmentMarkdown = (file: { filename: string; url: string; mime_type: string }) =>
  `${isInlineImage(file.mime_type) ? '!' : ''}[${escapeMarkdownLabel(file.filename)}](${file.url})`;

/** File extension for a type square: `PDF`, `CSV`; the mime subtype when the name has none. */
export function fileBadge(filename: string, mime: string): string {
  const dot = filename.lastIndexOf('.');
  const ext = dot > 0 && dot < filename.length - 1 ? filename.slice(dot + 1) : (mime.split('/')[1] ?? 'file');
  return ext.slice(0, 4).toUpperCase();
}

// The anchor is the only way to hand a blob to the browser's downloader.
export function saveDownload({ blob, filename }: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

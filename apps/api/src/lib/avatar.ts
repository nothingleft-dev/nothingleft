import { Avatar, Style } from '@dicebear/core';
import blobs from '@dicebear/styles/blobs.json' with { type: 'json' };
import initials from '@dicebear/styles/initials.json' with { type: 'json' };
import { AVATAR_INITIALS_TEXT, AVATAR_PASTEL_BACKGROUNDS, GRAVATAR_PROBE_TIMEOUT_MS } from '@config/constants';
import { PROJECT_MARK_COLORS } from '@config/project-mark-colors';
import { PALETTE_HUES, type AvatarMimeType, type PaletteHue } from '@nothingleft/types';

export const AVATAR_KINDS = ['person', 'project', 'organization'] as const;
export type AvatarKind = (typeof AVATAR_KINDS)[number];

const hex = (colors: readonly string[]) => colors.map(c => `#${c}`);
const initialsStyle = new Style(initials);

// Gray is the neutral resting state in the design system, so it is never a default identity colour.
const DEFAULT_PROJECT_HUES = PALETTE_HUES.filter(h => h !== 'gray');

export function defaultProjectColor(key: string): PaletteHue {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return DEFAULT_PROJECT_HUES[hash % DEFAULT_PROJECT_HUES.length] as PaletteHue;
}

function styleFor(
  kind: AvatarKind,
  seed: string,
  color?: PaletteHue,
): { style: Style; options: Record<string, unknown> } {
  switch (kind) {
    case 'person':
      return {
        style: initialsStyle,
        options: { backgroundColor: hex(AVATAR_PASTEL_BACKGROUNDS), textColor: hex([AVATAR_INITIALS_TEXT]) },
      };
    case 'project': {
      const { background, text } = PROJECT_MARK_COLORS[color ?? defaultProjectColor(seed)];
      // The default variant overlays a blended, half-opacity copy of the letters, unreadable at sidebar size.
      return {
        style: initialsStyle,
        options: { backgroundColor: [background], textColor: [text], initialsVariant: ['alt'], fontWeight: 600 },
      };
    }
    case 'organization':
      return { style: new Style(blobs), options: { size: 64, borderRadius: 0 } };
  }
}

/** Rendered here rather than by a hosted service, so no name, key or organisation leaves for a third party. */
export function renderAvatar(kind: AvatarKind, seed: string, color?: PaletteHue): string {
  const { style, options } = styleFor(kind, seed, color);
  return new Avatar(style, { ...options, seed }).toString();
}

export interface AvatarMarks {
  person(name: string): string;
  project(key: string, color: PaletteHue): string;
  organization(name: string): string;
}

export function avatarMarks(apiBaseUrl: string): AvatarMarks {
  const url = (kind: AvatarKind, seed: string) =>
    `${apiBaseUrl.replace(/\/$/, '')}/avatars/${kind}?seed=${encodeURIComponent(seed)}`;
  return {
    person: name => url('person', name),
    // Seeded by the key, so a rename keeps the mark and a key change moves it with the issue keys.
    project: (key, color) => `${url('project', key)}&color=${color}`,
    organization: name => url('organization', name),
  };
}

const AVATAR_EXTENSIONS: Record<AvatarMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

const AVATAR_KEY_PATTERN = /^web\/avatar\/([1-9]\d*)\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/;

export function avatarObjectKey(userId: number, mime: AvatarMimeType): string {
  return `web/avatar/${userId}/${crypto.randomUUID()}.${AVATAR_EXTENSIONS[mime]}`;
}

export function avatarKeyOwner(key: string): number | null {
  const match = AVATAR_KEY_PATTERN.exec(key);
  return match ? Number(match[1]) : null;
}

async function gravatarUrl(email: string): Promise<string | null> {
  const digest = new Bun.CryptoHasher('sha256').update(email.trim().toLowerCase()).digest('hex');
  const url = `https://gravatar.com/avatar/${digest}`;
  try {
    const response = await fetch(`${url}?d=404`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(GRAVATAR_PROBE_TIMEOUT_MS),
    });
    return response.ok ? url : null;
  } catch {
    return null;
  }
}

/**
 * Resolves steps 2–3 of the chain in docs/file-storage.md#avatars once, at write time, so no
 * render ever probes Gravatar. Null leaves step 4, the generated mark, to read time.
 */
export async function resolveAvatarUrl(input: { email: string; providerUrl?: string | null }): Promise<string | null> {
  if (input.providerUrl) return input.providerUrl;
  return gravatarUrl(input.email);
}

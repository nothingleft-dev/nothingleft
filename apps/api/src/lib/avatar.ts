import { Avatar, Style } from '@dicebear/core';
import blobs from '@dicebear/styles/blobs.json' with { type: 'json' };
import initials from '@dicebear/styles/initials.json' with { type: 'json' };
import {
  AVATAR_ELECTRIC_BACKGROUNDS,
  AVATAR_INITIALS_TEXT,
  AVATAR_PASTEL_BACKGROUNDS,
  GRAVATAR_PROBE_TIMEOUT_MS,
} from '@config/constants';
import type { AvatarMimeType } from '@nothingleft/types';

export const AVATAR_KINDS = ['person', 'project', 'organization'] as const;
export type AvatarKind = (typeof AVATAR_KINDS)[number];

const hex = (colors: readonly string[]) => colors.map(c => `#${c}`);
const initialsStyle = new Style(initials);

const STYLES: Record<AvatarKind, { style: Style; options: Record<string, unknown> }> = {
  person: {
    style: initialsStyle,
    options: { backgroundColor: hex(AVATAR_PASTEL_BACKGROUNDS), textColor: hex([AVATAR_INITIALS_TEXT]) },
  },
  // Seeded by the key, so a rename keeps the mark and a key change moves it with the issue keys.
  project: {
    style: initialsStyle,
    options: { backgroundColor: hex(AVATAR_ELECTRIC_BACKGROUNDS), textColor: hex([AVATAR_INITIALS_TEXT]) },
  },
  organization: { style: new Style(blobs), options: { size: 64, borderRadius: 0 } },
};

/** Rendered here rather than by a hosted service, so no name, key or organisation leaves for a third party. */
export function renderAvatar(kind: AvatarKind, seed: string): string {
  const { style, options } = STYLES[kind];
  return new Avatar(style, { ...options, seed }).toString();
}

export interface AvatarMarks {
  person(name: string): string;
  project(key: string): string;
  organization(name: string): string;
}

export function avatarMarks(apiBaseUrl: string): AvatarMarks {
  const url = (kind: AvatarKind, seed: string) =>
    `${apiBaseUrl.replace(/\/$/, '')}/avatars/${kind}?seed=${encodeURIComponent(seed)}`;
  return {
    person: name => url('person', name),
    project: key => url('project', key),
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

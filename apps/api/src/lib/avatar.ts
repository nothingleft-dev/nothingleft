import {
  AVATAR_ELECTRIC_BACKGROUNDS,
  AVATAR_INITIALS_TEXT,
  AVATAR_PASTEL_BACKGROUNDS,
  GRAVATAR_PROBE_TIMEOUT_MS,
} from '@config/constants';
import type { AvatarMimeType } from '@nothingleft/types';

const DICEBEAR = 'https://api.dicebear.com/10.x';

export function dicebearInitialsUrl(name: string): string {
  const seed = encodeURIComponent(name);
  const palette = `backgroundColor=${AVATAR_PASTEL_BACKGROUNDS.join(',')}&textColor=${AVATAR_INITIALS_TEXT}`;
  return `${DICEBEAR}/initials/svg?seed=${seed}&fontWeight=600&fontSize=42&${palette}`;
}

/** Seeded by the key, so a rename keeps the mark and a key change moves it with the issue keys. */
export function projectMarkUrl(key: string): string {
  return `${DICEBEAR}/initials/svg?backgroundColor=${AVATAR_ELECTRIC_BACKGROUNDS.join(',')}&textColor=${AVATAR_INITIALS_TEXT}&seed=${encodeURIComponent(key)}`;
}

export function organizationMarkUrl(name: string): string {
  return `${DICEBEAR}/blobs/svg?size=64&borderRadius=0&seed=${encodeURIComponent(name)}`;
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
 * Resolves steps 2–4 of the chain in docs/file-storage.md#avatars once, at write time,
 * so no render ever probes Gravatar. Step 1, the manual upload, overrides at read time.
 */
export async function resolveAvatarUrl(input: {
  email: string;
  name: string;
  providerUrl?: string | null;
}): Promise<string> {
  if (input.providerUrl) return input.providerUrl;
  return (await gravatarUrl(input.email)) ?? dicebearInitialsUrl(input.name);
}

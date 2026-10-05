import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES, type AvatarMimeType } from '@nothingleft/types';
import { systemContext, type UserRow, type UsersRepository } from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { AVATAR_MIRROR_HOSTS, AVATAR_MIRROR_TIMEOUT_MS } from '@config/constants';
import { avatarObjectKey } from '@lib/avatar';
import type { JobQueue } from '@lib/jobs';
import type { Storage } from '@lib/storage';

export interface AvatarMirrorDeps {
  users: UsersRepository;
  storage: Storage;
  queue: () => JobQueue;
  analytics: Analytics;
  /** Injected so a test never reaches Google or GitHub. */
  fetch: (url: string, init: RequestInit) => Promise<Response>;
}

/** Only a photo the provider itself serves is fetched server-side. */
export function providerOf(url: string | null): 'google' | 'github' | null {
  if (!url || !URL.canParse(url)) return null;
  const { protocol, hostname } = new URL(url);
  if (protocol !== 'https:') return null;
  const host = AVATAR_MIRROR_HOSTS.find(h => hostname === h || hostname.endsWith(`.${h}`));
  if (!host) return null;
  return host.includes('github') ? 'github' : 'google';
}

/**
 * Copies a provider photo into the public bucket (file-storage.md § Avatars) so nothing
 * renders from the provider's servers. A failure changes nothing: the provider URL stays in
 * avatar_url and the next Google or GitHub sign-in tries again.
 */
export function avatarMirror({ users, storage, queue, analytics, fetch }: AvatarMirrorDeps) {
  const ctx = systemContext('a photo copy belongs to the account, not an organisation');

  return {
    async request(user: UserRow): Promise<void> {
      if (!storage.configured || user.avatar_object_key || !providerOf(user.avatar_url)) return;
      await queue().send(
        'avatar.mirror',
        { user_id: user.id },
        { startAfter: new Date(), singletonKey: `avatar:${user.id}` },
      );
    },

    async run(userId: number): Promise<number> {
      const user = await users.findById(ctx, userId);
      const provider = providerOf(user?.avatar_url ?? null);
      if (!user || !provider || user.avatar_object_key || !storage.configured) return 0;

      const response = await fetch(user.avatar_url!, {
        redirect: 'error',
        signal: AbortSignal.timeout(AVATAR_MIRROR_TIMEOUT_MS),
      });
      const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim() as AvatarMimeType;
      if (!response.ok || !AVATAR_MIME_TYPES.includes(type)) return 0;
      const body = new Uint8Array(await response.arrayBuffer());
      if (body.byteLength === 0 || body.byteLength > AVATAR_MAX_BYTES) return 0;

      const key = avatarObjectKey(user.id, type);
      await storage.putPublic(key, body, type);
      // A manual upload that landed meanwhile wins; the copy is then simply unused.
      if (!(await users.setAvatarKeyIfEmpty(ctx, user.id, key))) {
        await storage.deletePublic(key);
        return 0;
      }
      analytics.capture('avatar_mirrored', { provider }, { userId: user.id });
      return 1;
    },
  };
}

export type AvatarMirror = ReturnType<typeof avatarMirror>;

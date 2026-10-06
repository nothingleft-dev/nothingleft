import {
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
  AVATAR_PRESIGN_TTL_SECONDS,
  OAUTH_PROVIDERS,
  USER_UI_PREFERENCES_MAX_BYTES,
  type AvatarMimeType,
  type AvatarPresign,
  type AvatarPresignRequest,
  type CurrentToken,
  type Me,
  type Principal,
  type TwoFactorStatus,
  type UpdateMe,
  type UpdatePreferences,
  type UserTheme,
} from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type OrganizationsRepository,
  type UserPreferencesRepository,
  type UserRow,
  type UsersRepository,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { AppError } from '@lib/errors';
import { avatarKeyOwner, avatarObjectKey, type AvatarMarks } from '@lib/avatar';
import type { Storage, StoredObject } from '@lib/storage';

const withinAvatarLimits = ({ size, content_type }: StoredObject): boolean =>
  size > 0 && size <= AVATAR_MAX_BYTES && AVATAR_MIME_TYPES.includes(content_type as AvatarMimeType);

export interface MeDeps {
  users: UsersRepository;
  preferences: UserPreferencesRepository;
  organizations: OrganizationsRepository;
  storage: Storage;
  marks: AvatarMarks;
  analytics: Analytics;
  /** The project's id when the caller can read it; a 404 otherwise. */
  readableProjectId: (principal: Principal, key: string) => Promise<number>;
  currentToken: (principal: Principal) => Promise<CurrentToken | null>;
  twoFactor: (user: UserRow) => Promise<TwoFactorStatus>;
}

export function meService({
  users,
  preferences,
  organizations,
  storage,
  marks,
  analytics,
  readableProjectId,
  currentToken,
  twoFactor,
}: MeDeps) {
  const ctx = systemContext('a user reads and edits their own account, which has no organisation');

  /** Step 1 of the chain overrides at read time; steps 2–3 are in avatar_url; step 4 follows the current name. */
  const avatarUrl = (user: UserRow): string =>
    user.avatar_object_key ? storage.publicUrl(user.avatar_object_key) : (user.avatar_url ?? marks.person(user.name));

  /** Null for a PAT, a session in no organisation yet, and one whose membership has since gone. */
  async function currentOrganizationSlug(principal: Principal | null): Promise<string | null> {
    if (principal?.via !== 'session' || principal.currentOrgId === null) return null;
    const org = tenantContext(principal.currentOrgId, principal.userId);
    const [organization, membership] = await Promise.all([
      organizations.findById(org),
      organizations.findMembership(org, principal.userId),
    ]);
    return organization && membership ? organization.slug : null;
  }

  async function toDto(user: UserRow, principal: Principal | null = null): Promise<Me> {
    const [stored, current_organization_slug, token, two_factor] = await Promise.all([
      preferences.findForUser(ctx, user.id),
      currentOrganizationSlug(principal),
      principal?.via === 'pat' ? currentToken(principal) : null,
      twoFactor(user),
    ]);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: avatarUrl(user),
      timezone: user.timezone,
      email_verified_at: user.email_verified_at?.toISOString() ?? null,
      has_password: user.password_hash !== null,
      linked_providers: OAUTH_PROVIDERS.filter(p => (p === 'google' ? user.google_id : user.github_id) !== null),
      preferences: {
        theme: (stored?.preferences.theme ?? 'system') as UserTheme,
        last_project_key: stored?.last_project_key ?? null,
        ui: stored?.preferences.ui ?? {},
      },
      current_organization_slug,
      token,
      two_factor,
    };
  }

  async function load(principal: Principal): Promise<UserRow> {
    const user = await users.findById(ctx, principal.userId);
    if (!user || user.deleted_at) throw AppError.notFound();
    return user;
  }

  return {
    async get(principal: Principal): Promise<Me> {
      return toDto(await load(principal), principal);
    },

    /** Sign-up and sign-in answer with the full account before the request carries a principal. */
    async forSession(session: { userId: number; sessionId: number; currentOrgId: number | null }): Promise<Me> {
      const user = await users.findById(ctx, session.userId);
      if (!user || user.deleted_at) throw AppError.notFound();
      return toDto(user, { via: 'session', ...session });
    },

    async update(principal: Principal, patch: UpdateMe): Promise<Me> {
      const user = await load(principal);
      const changes: Partial<UserRow> = {};
      if (patch.name !== undefined) changes.name = patch.name;
      if (patch.timezone !== undefined) changes.timezone = patch.timezone;

      const updated = Object.keys(changes).length > 0 ? await users.update(ctx, user.id, changes) : user;
      if (!updated) throw AppError.notFound();
      return toDto(updated, principal);
    },

    async updatePreferences(principal: Principal, patch: UpdatePreferences): Promise<Me> {
      const user = await load(principal);
      if (patch.theme !== undefined) await preferences.update(ctx, user.id, { theme: patch.theme });
      if (patch.ui !== undefined) {
        const current = (await preferences.findForUser(ctx, user.id))?.preferences.ui ?? {};
        const ui: Record<string, unknown> = { ...current };
        for (const [key, value] of Object.entries(patch.ui)) {
          if (value === null) delete ui[key];
          else ui[key] = value;
        }
        const bytes = new TextEncoder().encode(JSON.stringify(ui)).byteLength;
        if (bytes > USER_UI_PREFERENCES_MAX_BYTES) {
          throw new AppError(
            'preferences.ui_too_large',
            400,
            { size: Math.ceil(bytes / 1024), max: USER_UI_PREFERENCES_MAX_BYTES / 1024 },
            'ui',
          );
        }
        await preferences.update(ctx, user.id, { ui });
      }
      if (patch.last_project_key !== undefined) {
        const last_project_id =
          patch.last_project_key === null ? null : await readableProjectId(principal, patch.last_project_key);
        await preferences.update(ctx, user.id, { last_project_id });
      }
      return toDto(user, principal);
    },

    async presignAvatar(principal: Principal, input: AvatarPresignRequest): Promise<AvatarPresign> {
      if (!storage.configured) throw new AppError('storage.not_configured', 503);
      const user = await load(principal);
      const object_key = avatarObjectKey(user.id, input.mime);
      return {
        object_key,
        upload_url: await storage.presignPublicPut(
          object_key,
          { contentType: input.mime, size: input.size },
          AVATAR_PRESIGN_TTL_SECONDS,
        ),
        expires_in: AVATAR_PRESIGN_TTL_SECONDS,
      };
    },

    async completeAvatar(principal: Principal, objectKey: string): Promise<Me> {
      if (!storage.configured) throw new AppError('storage.not_configured', 503);
      // Answered before storage is asked, so a refusal never says whether the object exists.
      if (avatarKeyOwner(objectKey) !== principal.userId) {
        throw new AppError('avatar.upload_missing', 400, {}, 'object_key');
      }

      const user = await load(principal);
      const head = await storage.headPublic(objectKey);
      if (!head) throw new AppError('avatar.upload_missing', 400, {}, 'object_key');
      if (!withinAvatarLimits(head)) {
        await storage.deletePublic(objectKey);
        throw new AppError('avatar.invalid_object', 422, {}, 'object_key');
      }

      const previous = user.avatar_object_key;
      const updated = await users.update(ctx, user.id, { avatar_object_key: objectKey });
      if (!updated) throw AppError.notFound();
      if (previous && previous !== objectKey) await storage.deletePublic(previous);

      analytics.capture('avatar_uploaded', {}, { userId: user.id });
      return toDto(updated, principal);
    },

    /** Removing the upload falls back to whatever the chain already resolved. */
    async removeAvatar(principal: Principal): Promise<Me> {
      const user = await load(principal);
      const previous = user.avatar_object_key;
      if (!previous) return toDto(user, principal);

      const updated = await users.update(ctx, user.id, { avatar_object_key: null });
      if (!updated) throw AppError.notFound();
      if (storage.configured) await storage.deletePublic(previous);
      return toDto(updated, principal);
    },
  };
}

export type MeService = ReturnType<typeof meService>;

import { beforeEach, describe, expect, test } from 'bun:test';
import { noopAnalytics } from '@nothingleft/analytics';
import type { Principal } from '@nothingleft/types';
import { AVATAR_MAX_BYTES, AvatarPresignRequestSchema } from '@nothingleft/types';
import { meService, type MeDeps, type MeService } from '@services/me.service';
import { avatarMarks } from '@lib/avatar';

const marks = avatarMarks('https://api.example.test');
import type { PublicPutSpec, Storage, StoredObject } from '@lib/storage';
import { stubWorld } from './stubs.ts';

const principal: Principal = { via: 'session', userId: 1, sessionId: 1, currentOrgId: null };
const OWN_PNG = 'web/avatar/1/11111111-1111-4111-8111-111111111111.png';
const OWN_WEBP = 'web/avatar/1/22222222-2222-4222-8222-222222222222.webp';
const sys = { kind: 'system', reason: 'test' } as const;

function harness(configured = true) {
  const world = stubWorld();
  const deleted: string[] = [];
  const present = new Set<string>();
  const headed: string[] = [];
  const heads = new Map<string, StoredObject>();
  const presigned: { key: string; spec: PublicPutSpec; expiresIn: number }[] = [];

  const storage: Storage = {
    configured,
    async presignPublicPut(key, spec, expiresIn) {
      presigned.push({ key, spec, expiresIn });
      return `https://s3.test.local/nl-public/${key}?X-Amz-Signature=stub`;
    },
    async putPublic() {},
    async headPublic(key) {
      headed.push(key);
      return heads.get(key) ?? (present.has(key) ? { size: 1024, content_type: 'image/png' } : null);
    },
    async deletePublic(key) {
      deleted.push(key);
    },
    publicUrl: key => `https://static.nothingleft.dev/${key}`,
    private: null,
    connect: () => {
      throw new Error('no customer buckets here');
    },
  };

  // Organisation 7 is "acme"; user 1 is a member of it, and of nothing else.
  const organizations = {
    async findById(ctx: { orgId: number }) {
      return ctx.orgId === 7 ? { id: 7, slug: 'acme' } : undefined;
    },
    async findMembership(ctx: { orgId: number }, userId: number) {
      return ctx.orgId === 7 && userId === 1 ? { org_id: 7, user_id: 1 } : undefined;
    },
  } as unknown as MeDeps['organizations'];

  const deps: MeDeps = {
    users: world.repos.users,
    preferences: world.repos.preferences,
    organizations,
    storage,
    marks,
    analytics: noopAnalytics,
    readableProjectId: async () => 1,
    twoFactor: async () => ({ enabled: false, enabled_at: null, recovery_codes_remaining: 0 }),
    currentToken: async () => ({
      name: 'Claude Code',
      token_prefix: 'nl_pat_a1b2',
      scopes: ['issues:read'],
      project_keys: ['PMS'],
      expires_at: null,
    }),
  };
  return { me: meService(deps), world, deleted, present, headed, heads, presigned };
}

let h: ReturnType<typeof harness>;
let me: MeService;

beforeEach(async () => {
  h = harness();
  me = h.me;
  await h.world.repos.users.create(
    { kind: 'system', reason: 'seed' },
    {
      email: 'jordan@test.local',
      name: 'Jordan Rivera',
      avatar_url: null,
    },
  );
  await h.world.repos.preferences.create({ kind: 'system', reason: 'seed' }, 1);
});

describe('the Me DTO', () => {
  test('carries identity and preferences together, because the shell needs both', async () => {
    expect(await me.get(principal)).toEqual({
      id: 1,
      email: 'jordan@test.local',
      name: 'Jordan Rivera',
      avatar_url: marks.person('Jordan Rivera'),
      timezone: 'UTC',
      email_verified_at: null,
      has_password: false,
      linked_providers: [],
      preferences: { theme: 'system', last_project_key: null, ui: {} },
      current_organization_slug: null,
      token: null,
      two_factor: { enabled: false, enabled_at: null, recovery_codes_remaining: 0 },
    });
  });

  test('names the token a PAT caller is using, so an agent knows its scopes before it writes', async () => {
    const pat: Principal = { via: 'pat', userId: 1, tokenId: 1, scopes: ['issues:read'], projectIds: [3] };
    expect((await me.get(pat)).token).toEqual({
      name: 'Claude Code',
      token_prefix: 'nl_pat_a1b2',
      scopes: ['issues:read'],
      project_keys: ['PMS'],
      expires_at: null,
    });
    expect((await me.get(principal)).token).toBeNull();
  });

  test('names the session’s current organisation, and only while the caller still belongs to it', async () => {
    expect((await me.get({ ...principal, currentOrgId: 7 })).current_organization_slug).toBe('acme');
    expect((await me.get({ ...principal, currentOrgId: 8 })).current_organization_slug).toBeNull();
    const pat: Principal = { via: 'pat', userId: 1, tokenId: 1, scopes: ['issues:read'], projectIds: null };
    expect((await me.get(pat)).current_organization_slug).toBeNull();
  });

  test('reports how the account signs in, so settings never offers a password it does not have', async () => {
    const verified = new Date('2026-09-23T10:00:00Z');
    await h.world.repos.users.update({ kind: 'system', reason: 'seed' }, 1, {
      github_id: '424242',
      email_verified_at: verified,
    });
    expect(await me.get(principal)).toMatchObject({
      email_verified_at: verified.toISOString(),
      has_password: false,
      linked_providers: ['github'],
    });
  });
});

describe('the avatar chain', () => {
  test('a manual upload overrides the resolved URL at read time', async () => {
    h.present.add(OWN_PNG);
    const dto = await me.completeAvatar(principal, OWN_PNG);
    expect(dto.avatar_url).toBe(`https://static.nothingleft.dev/${OWN_PNG}`);
  });

  test('removing the upload falls back to what the chain resolved', async () => {
    h.present.add(OWN_PNG);
    await me.completeAvatar(principal, OWN_PNG);

    const dto = await me.removeAvatar(principal);
    expect(dto.avatar_url).toBe(marks.person('Jordan Rivera'));
    expect(h.deleted).toEqual([OWN_PNG]);
  });

  test('replacing an upload deletes the object it displaced', async () => {
    h.present.add(OWN_PNG);
    h.present.add(OWN_WEBP);
    await me.completeAvatar(principal, OWN_PNG);
    await me.completeAvatar(principal, OWN_WEBP);
    expect(h.deleted).toEqual([OWN_PNG]);
  });

  test('a key minted before keys named their user is still deleted by "remove photo"', async () => {
    const legacy = 'web/avatar/33333333-3333-4333-8333-333333333333.png';
    await h.world.repos.users.update(sys, 1, { avatar_object_key: legacy });
    await me.removeAvatar(principal);
    expect(h.deleted).toEqual([legacy]);
  });

  test('a generated mark follows the current name, with nothing stored', async () => {
    const dto = await me.update(principal, { name: 'Jordan N' });
    expect(dto.name).toBe('Jordan N');
    expect(dto.avatar_url).toBe(marks.person('Jordan N'));
    expect((await h.world.repos.users.findById(sys, 1))?.avatar_url).toBeNull();
  });

  test('a rename leaves a Gravatar or provider URL alone', async () => {
    await h.world.repos.users.update({ kind: 'system', reason: 'seed' }, 1, {
      avatar_url: 'https://gravatar.com/avatar/abc',
    });
    const dto = await me.update(principal, { name: 'Jordan N' });
    expect(dto.avatar_url).toBe('https://gravatar.com/avatar/abc');
  });
});

describe('avatar upload', () => {
  test('presigns a key under the caller’s own prefix, with the declared type and size signed in', async () => {
    const presign = await me.presignAvatar(principal, { mime: 'image/png', size: 2048 });
    expect(presign.object_key).toMatch(/^web\/avatar\/1\/[0-9a-f-]{36}\.png$/);
    expect(presign.upload_url).toContain('nl-public');
    expect(presign.expires_in).toBe(900);
    expect(h.presigned).toEqual([
      { key: presign.object_key, spec: { contentType: 'image/png', size: 2048 }, expiresIn: 900 },
    ]);
  });

  test('the DTO rejects an unsupported type or an oversized file before the API is reached', () => {
    expect(AvatarPresignRequestSchema.safeParse({ mime: 'image/gif', size: 10 }).success).toBe(false);
    expect(AvatarPresignRequestSchema.safeParse({ mime: 'image/png', size: AVATAR_MAX_BYTES + 1 }).success).toBe(false);
    expect(AvatarPresignRequestSchema.safeParse({ mime: 'image/webp', size: AVATAR_MAX_BYTES }).success).toBe(true);
  });

  test('completing refuses a key the API did not mint', async () => {
    await expect(me.completeAvatar(principal, '../../etc/passwd')).rejects.toThrow('was not found in storage');
  });

  test('completing refuses a key with nothing behind it', async () => {
    const attempt = me.completeAvatar(principal, 'web/avatar/1/33333333-3333-4333-8333-333333333333.png');
    await expect(attempt).rejects.toMatchObject({ code: 'avatar.upload_missing', status: 400 });
  });

  test('completing a key minted for someone else answers as a missing upload and leaves their object alone', async () => {
    const theirs = [
      'web/avatar/44444444-4444-4444-8444-444444444444.png',
      'web/avatar/2/55555555-5555-4555-8555-555555555555.png',
    ];
    for (const key of theirs) h.present.add(key);
    const absent = 'web/avatar/2/66666666-6666-4666-8666-666666666666.png';

    for (const key of [...theirs, absent]) {
      await expect(me.completeAvatar(principal, key)).rejects.toMatchObject({
        code: 'avatar.upload_missing',
        status: 400,
        field: 'object_key',
      });
    }

    await me.removeAvatar(principal);
    expect(h.headed).toEqual([]);
    expect(h.deleted).toEqual([]);
    expect((await h.world.repos.users.findById(sys, 1))?.avatar_object_key).toBeNull();
  });

  test('an unconfigured bucket refuses rather than failing at boot', async () => {
    const bare = harness(false);
    await bare.world.repos.users.create({ kind: 'system', reason: 'seed' }, { email: 'a@b.c', name: 'A' });
    await expect(bare.me.presignAvatar(principal, { mime: 'image/png', size: 10 })).rejects.toThrow(
      'File storage is not configured',
    );
  });
});

describe('avatar bytes', () => {
  const MIB = 1024 * 1024;

  test('a stored object over the limit or of another type is refused and deleted', async () => {
    const cases: [string, StoredObject][] = [
      ['web/avatar/1/77777777-7777-4777-8777-777777777777.png', { size: 50 * MIB, content_type: 'image/png' }],
      ['web/avatar/1/88888888-8888-4888-8888-888888888888.png', { size: 1024, content_type: 'text/html' }],
    ];
    for (const [key, head] of cases) {
      h.heads.set(key, head);
      await expect(me.completeAvatar(principal, key)).rejects.toMatchObject({
        code: 'avatar.invalid_object',
        status: 422,
        field: 'object_key',
      });
    }
    expect(h.deleted).toEqual(cases.map(([key]) => key));
    expect((await h.world.repos.users.findById(sys, 1))?.avatar_object_key).toBeNull();
  });

  test('an empty object, or one with no type, is not an image', async () => {
    const empty = 'web/avatar/1/99999999-9999-4999-8999-999999999999.png';
    const untyped = 'web/avatar/1/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png';
    h.heads.set(empty, { size: 0, content_type: 'image/png' });
    h.heads.set(untyped, { size: 1024, content_type: undefined });
    await expect(me.completeAvatar(principal, empty)).rejects.toMatchObject({ code: 'avatar.invalid_object' });
    await expect(me.completeAvatar(principal, untyped)).rejects.toMatchObject({ code: 'avatar.invalid_object' });
    expect(h.deleted).toEqual([empty, untyped]);
  });

  test('exactly the limit is accepted, one byte more is not', async () => {
    const atLimit = 'web/avatar/1/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp';
    const over = 'web/avatar/1/cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp';
    h.heads.set(atLimit, { size: AVATAR_MAX_BYTES, content_type: 'image/webp' });
    h.heads.set(over, { size: AVATAR_MAX_BYTES + 1, content_type: 'image/webp' });
    expect((await me.completeAvatar(principal, atLimit)).avatar_url).toBe(`https://static.nothingleft.dev/${atLimit}`);
    await expect(me.completeAvatar(principal, over)).rejects.toMatchObject({ code: 'avatar.invalid_object' });
  });

  test('a refused upload leaves the current photo in place', async () => {
    h.present.add(OWN_PNG);
    await me.completeAvatar(principal, OWN_PNG);
    const bad = 'web/avatar/1/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png';
    h.heads.set(bad, { size: 50 * MIB, content_type: 'image/png' });

    await expect(me.completeAvatar(principal, bad)).rejects.toMatchObject({ code: 'avatar.invalid_object' });
    expect(h.deleted).toEqual([bad]);
    expect((await h.world.repos.users.findById(sys, 1))?.avatar_object_key).toBe(OWN_PNG);
  });
});

describe('preferences', () => {
  test('the theme is stored and echoed in the full resource', async () => {
    const dto = await me.updatePreferences(principal, { theme: 'dark' });
    expect(dto.preferences.theme).toBe('dark');
    expect(dto.email).toBe('jordan@test.local');
  });
});

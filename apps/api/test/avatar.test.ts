import { describe, expect, test } from 'bun:test';
import { AVATAR_INITIALS_TEXT, AVATAR_PASTEL_BACKGROUNDS } from '@config/constants';
import { avatarKeyOwner, avatarObjectKey, dicebearInitialsUrl } from '@lib/avatar';

describe('dicebearInitialsUrl', () => {
  test('draws from the pastel set with fixed dark text, seeded by the name', () => {
    const url = new URL(dicebearInitialsUrl('Jordan Rivera'));
    expect(url.searchParams.get('seed')).toBe('Jordan Rivera');
    expect(url.searchParams.get('backgroundColor')).toBe(AVATAR_PASTEL_BACKGROUNDS.join(','));
    expect(url.searchParams.get('textColor')).toBe(AVATAR_INITIALS_TEXT);
  });
});

describe('avatar object keys', () => {
  test('a minted key names the user it belongs to', () => {
    const key = avatarObjectKey(42, 'image/webp');
    expect(key).toMatch(/^web\/avatar\/42\/[0-9a-f-]{36}\.webp$/);
    expect(avatarKeyOwner(key)).toBe(42);
    expect(avatarObjectKey(42, 'image/jpeg')).toEndWith('.jpg');
    expect(avatarObjectKey(42, 'image/webp')).not.toBe(key);
  });

  test('a key the API could not have minted has no owner', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    for (const key of [
      `web/avatar/${uuid}.png`,
      `web/avatar/01/${uuid}.png`,
      `web/avatar/0/${uuid}.png`,
      `web/avatar/-1/${uuid}.png`,
      `web/avatar/1/../2/${uuid}.png`,
      `web/avatar/1/${uuid}.gif`,
      `web/avatar/1/${uuid}.png/extra`,
      '../../etc/passwd',
    ]) {
      expect(avatarKeyOwner(key)).toBeNull();
    }
  });
});

import { describe, expect, test } from 'bun:test';
import { AVATAR_ELECTRIC_BACKGROUNDS, AVATAR_INITIALS_TEXT, AVATAR_PASTEL_BACKGROUNDS } from '@config/constants';
import { avatarKeyOwner, avatarMarks, avatarObjectKey, renderAvatar } from '@lib/avatar';

describe('generated marks', () => {
  test('a person draws from the pastel set with fixed dark text, the same for the same name', () => {
    const svg = renderAvatar('person', 'Jordan Rivera');
    expect(svg).toStartWith('<svg');
    expect(svg).toContain('>JR<');
    expect(svg).toContain(`fill="#${AVATAR_INITIALS_TEXT}"`);
    expect(AVATAR_PASTEL_BACKGROUNDS.some(c => svg.includes(`fill="#${c}"`))).toBe(true);
    expect(renderAvatar('person', 'Jordan Rivera')).toBe(svg);
  });

  test('a project draws from the electric set, an organisation is a blob', () => {
    const project = renderAvatar('project', 'PP');
    expect(AVATAR_ELECTRIC_BACKGROUNDS.some(c => project.includes(`fill="#${c}"`))).toBe(true);
    expect(renderAvatar('organization', 'Acme Corporation')).toContain('<path');
  });

  test('a mark loads nothing from elsewhere', () => {
    for (const svg of [renderAvatar('person', 'A'), renderAvatar('project', 'PP'), renderAvatar('organization', 'A')]) {
      expect(svg).not.toMatch(/(href|src)="https?:/);
    }
  });

  test('mark URLs point at this API, never a third party', () => {
    const marks = avatarMarks('https://api.example.test/');
    expect(marks.person('Jordan Rivera')).toBe('https://api.example.test/avatars/person?seed=Jordan%20Rivera');
    expect(marks.project('PP')).toBe('https://api.example.test/avatars/project?seed=PP');
    expect(marks.organization('A&B')).toBe('https://api.example.test/avatars/organization?seed=A%26B');
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

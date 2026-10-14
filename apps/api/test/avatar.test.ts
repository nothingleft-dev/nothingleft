import { describe, expect, test } from 'bun:test';
import { AVATAR_INITIALS_TEXT, AVATAR_PASTEL_BACKGROUNDS } from '@config/constants';
import { PROJECT_MARK_COLORS } from '@config/project-mark-colors';
import { avatarKeyOwner, avatarMarks, avatarObjectKey, defaultProjectColor, renderAvatar } from '@lib/avatar';

describe('generated marks', () => {
  test('a person draws from the pastel set with fixed dark text, the same for the same name', () => {
    const svg = renderAvatar('person', 'Jordan Rivera');
    expect(svg).toStartWith('<svg');
    expect(svg).toContain('>JR<');
    expect(svg).toContain(`fill="#${AVATAR_INITIALS_TEXT}"`);
    expect(AVATAR_PASTEL_BACKGROUNDS.some(c => svg.includes(`fill="#${c}"`))).toBe(true);
    expect(renderAvatar('person', 'Jordan Rivera')).toBe(svg);
  });

  test('a project is drawn in its chosen colour, an organisation is a blob', () => {
    const project = renderAvatar('project', 'PP', 'teal');
    expect(project).toContain(`fill="#${PROJECT_MARK_COLORS.teal.background}"`);
    expect(project).toContain('fill="#ffffff"');
    expect(project).toContain('font-weight="600"');
    expect(project).not.toContain('mix-blend-mode');
    expect(renderAvatar('project', 'PP', 'violet')).toContain(`fill="#${PROJECT_MARK_COLORS.violet.background}"`);
    expect(renderAvatar('organization', 'Acme Corporation')).toContain('<path');
  });

  test("a project mark without a colour takes the key's default, never gray", () => {
    const fallback = defaultProjectColor('PP');
    expect(fallback).not.toBe('gray');
    expect(renderAvatar('project', 'PP')).toBe(renderAvatar('project', 'PP', fallback));
  });

  test('a mark loads nothing from elsewhere', () => {
    for (const svg of [renderAvatar('person', 'A'), renderAvatar('project', 'PP'), renderAvatar('organization', 'A')]) {
      expect(svg).not.toMatch(/(href|src)="https?:/);
    }
  });

  test('mark URLs point at this API, never a third party', () => {
    const marks = avatarMarks('https://api.example.test/');
    expect(marks.person('Jordan Rivera')).toBe('https://api.example.test/avatars/person?seed=Jordan%20Rivera');
    expect(marks.project('PP', 'teal')).toBe('https://api.example.test/avatars/project?seed=PP&color=teal');
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

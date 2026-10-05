import { describe, expect, test } from 'bun:test';
import { seal, unseal } from '@lib/crypto';
import { hashRecoveryCode, issueRecoveryCodes, newTotpSecret, totpCode, verifyTotp } from '@lib/totp';

const key = Buffer.alloc(32, 7);

describe('seal', () => {
  test('a fresh IV on every seal, and it opens only for its own row and purpose', () => {
    const a = seal(key, 'totp', 'users:1', 'JBSWY3DPEHPK3PXP');
    const b = seal(key, 'totp', 'users:1', 'JBSWY3DPEHPK3PXP');
    expect(a).not.toBe(b);
    expect(a).toStartWith('v1.');
    expect(unseal(key, 'totp', 'users:1', a)).toBe('JBSWY3DPEHPK3PXP');
    expect(() => unseal(key, 'totp', 'users:2', a)).toThrow();
    expect(() => unseal(key, 'byo_storage', 'users:1', a)).toThrow();
    expect(() => unseal(Buffer.alloc(32, 8), 'totp', 'users:1', a)).toThrow();
  });
});

describe('verifyTotp', () => {
  const secret = newTotpSecret();
  const at = new Date('2026-09-27T10:00:10Z');

  test('accepts the current step and one either side, never two away', () => {
    expect(verifyTotp(secret, totpCode(secret, at), null, at)).not.toBeNull();
    expect(verifyTotp(secret, totpCode(secret, new Date(at.getTime() - 30_000)), null, at)).not.toBeNull();
    expect(verifyTotp(secret, totpCode(secret, new Date(at.getTime() + 30_000)), null, at)).not.toBeNull();
    expect(verifyTotp(secret, totpCode(secret, new Date(at.getTime() - 90_000)), null, at)).toBeNull();
  });

  test('a step at or before the last one accepted is a replay', () => {
    const step = verifyTotp(secret, totpCode(secret, at), null, at)!;
    expect(verifyTotp(secret, totpCode(secret, at), step, at)).toBeNull();
    expect(verifyTotp(secret, '12 34 56', null, at)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', null, at)).toBeNull();
  });
});

describe('recovery codes', () => {
  test('ten distinct codes, read back regardless of case, spaces or dashes', () => {
    const { codes, hashes } = issueRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/);
    const loose = ` ${codes[0]!.toUpperCase().replace('-', ' ')} `;
    expect(hashRecoveryCode(loose).equals(hashes[0]!)).toBe(true);
  });
});

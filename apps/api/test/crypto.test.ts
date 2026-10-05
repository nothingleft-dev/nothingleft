import { describe, expect, test } from 'bun:test';
import { PAT_PREFIX } from '@nothingleft/types';
import { issueOneTimeToken, issuePat, issueSessionToken, randomToken, sha256 } from '@lib/crypto';
import { hashPassword, verifyPassword } from '@lib/password';

describe('sha256', () => {
  test('is stable and 32 raw bytes, matching the bytea columns', () => {
    const a = sha256('token');
    expect(a.length).toBe(32);
    expect(a.equals(sha256('token'))).toBe(true);
    expect(a.equals(sha256('other'))).toBe(false);
  });
});

describe('issueSessionToken', () => {
  test('returns an opaque value and only its hash for storage', () => {
    const { token, token_hash } = issueSessionToken();
    expect(token).not.toContain('.'); // nothing JWT-shaped, ever
    expect(token_hash.equals(sha256(token))).toBe(true);
  });

  test('never repeats', () => {
    const seen = new Set(Array.from({ length: 200 }, () => issueSessionToken().token));
    expect(seen.size).toBe(200);
  });

  test('carries 32 bytes of entropy', () => {
    expect(Buffer.from(randomToken(), 'base64url').length).toBe(32);
  });
});

describe('issuePat', () => {
  test('matches the documented format', () => {
    const { token } = issuePat();
    expect(token).toMatch(/^nl_pat_[A-Za-z0-9]{43}$/);
  });

  test('the display prefix is greppable and derived from the token', () => {
    const { token, token_prefix } = issuePat();
    expect(token_prefix.startsWith(PAT_PREFIX)).toBe(true);
    expect(token.startsWith(token_prefix)).toBe(true);
    expect(token_prefix.length).toBe(PAT_PREFIX.length + 8);
  });

  test('stores only the hash', () => {
    const { token, token_hash } = issuePat();
    expect(token_hash.equals(sha256(token))).toBe(true);
  });

  test('uses the whole base62 alphabet rather than skewing to the first letters', () => {
    const chars = new Set(
      Array.from({ length: 300 }, () => issuePat().token.slice(PAT_PREFIX.length))
        .join('')
        .split(''),
    );
    expect(chars.size).toBeGreaterThan(55);
  });
});

describe('issueOneTimeToken', () => {
  test('is opaque and hashed for storage', () => {
    const { token, token_hash } = issueOneTimeToken();
    expect(token.length).toBeGreaterThan(20);
    expect(token_hash.equals(sha256(token))).toBe(true);
  });
});

describe('password hashing', () => {
  test('is argon2id and verifies round-trip', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  test('salts, so the same password hashes differently', async () => {
    expect(await hashPassword('same-password-twice')).not.toBe(await hashPassword('same-password-twice'));
  });
});

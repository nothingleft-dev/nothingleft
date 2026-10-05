import { describe, expect, test } from 'bun:test';
import type { FastifyRequest } from 'fastify';
import { extractCredential } from '@middleware/auth';

const req = (headers: Record<string, string>, cookies: Record<string, string> = {}) =>
  ({ headers, cookies }) as unknown as FastifyRequest;

describe('extractCredential', () => {
  test('prefers a PAT bearer header', () => {
    expect(extractCredential(req({ authorization: 'Bearer nl_pat_abc' }, { sid: 'x' }))).toEqual({
      kind: 'pat',
      token: 'nl_pat_abc',
    });
  });

  test('ignores bearer tokens without the PAT prefix (no JWT anywhere)', () => {
    expect(extractCredential(req({ authorization: 'Bearer eyJhbGciOi' }))).toBeNull();
  });

  test('falls back to the session cookie', () => {
    expect(extractCredential(req({}, { sid: 'abc' }))).toEqual({ kind: 'session', token: 'abc' });
  });
});

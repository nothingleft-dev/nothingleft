import { describe, expect, test } from 'bun:test';
import type { InvitationRow } from '@nothingleft/db';
import { statusOf } from '@services/invitations.service';

const row = (patch: Partial<InvitationRow>): InvitationRow =>
  ({
    kind: 'link',
    max_uses: null,
    use_count: 0,
    expires_at: null,
    revoked_at: null,
    ...patch,
  }) as InvitationRow;

describe('statusOf', () => {
  test('a default share link is active forever', () => {
    expect(statusOf(row({ use_count: 500 }))).toBe('active');
  });

  test('revocation outranks every other state', () => {
    expect(statusOf(row({ revoked_at: new Date(), use_count: 1, max_uses: 1 }))).toBe('revoked');
  });

  test('a spent email invitation reads as accepted, a spent link as exhausted', () => {
    expect(statusOf(row({ kind: 'email', max_uses: 1, use_count: 1 }))).toBe('accepted');
    expect(statusOf(row({ max_uses: 3, use_count: 3 }))).toBe('exhausted');
  });

  test('expiry is compared with the given clock', () => {
    const at = new Date('2026-09-23T00:00:00Z');
    expect(statusOf(row({ expires_at: at }), at.getTime() - 1)).toBe('active');
    expect(statusOf(row({ expires_at: at }), at.getTime())).toBe('expired');
  });
});

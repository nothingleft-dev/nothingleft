import { describe, expect, test } from 'bun:test';
import { systemContext, tenantContext } from '../src/tenant-context.ts';

describe('tenantContext', () => {
  test('refuses an empty orgId', () => {
    expect(() => tenantContext(0)).toThrow();
  });

  test('is frozen so a caller cannot widen the tenant mid-request', () => {
    const ctx = tenantContext(1, 2);
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(ctx).toEqual({ kind: 'tenant', orgId: 1, userId: 2 });
  });

  test('defaults userId to null for system actors', () => {
    expect(tenantContext(1).userId).toBeNull();
  });
});

describe('systemContext', () => {
  test('requires a reason', () => {
    expect(() => systemContext('')).toThrow();
    expect(systemContext('login').kind).toBe('system');
  });
});

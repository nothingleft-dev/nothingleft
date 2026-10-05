import { describe, expect, test } from 'bun:test';
import {
  DeepHealthSchema,
  HealthSchema,
  MeSchema,
  ORG_PLANS,
  PLAN_PRESETS,
  passwordStrength,
  planLimits,
  USER_THEMES,
  type DeepHealth,
  type Me,
} from '../src/index.ts';

const me: Me = {
  id: 1,
  email: 'alex@example.com',
  name: 'Alex Lee',
  avatar_url: null,
  timezone: 'Asia/Kolkata',
  email_verified_at: '2026-09-23T10:00:00.000Z',
  has_password: false,
  linked_providers: ['google'],
  preferences: { theme: 'system', last_project_key: null, ui: {} },
  current_organization_slug: null,
  token: null,
  two_factor: { enabled: false, enabled_at: null, recovery_codes_remaining: 0 },
};

describe('MeSchema', () => {
  test('accepts a profile with its preferences', () => {
    expect(MeSchema.parse(me)).toEqual(me);
  });

  test('only names providers it supports', () => {
    expect(MeSchema.safeParse({ ...me, linked_providers: ['gitlab'] }).success).toBe(false);
  });

  test('keeps ids numeric, matching bigint identity keys', () => {
    expect(MeSchema.safeParse({ ...me, id: '1' }).success).toBe(false);
  });

  test('allows an avatar and a last project', () => {
    const withBoth = {
      ...me,
      avatar_url: 'https://cdn.example.com/a.png',
      preferences: { ...me.preferences, last_project_key: 'PMS' },
    };
    expect(MeSchema.parse(withBoth)).toEqual(withBoth);
  });

  test('rejects an unknown theme', () => {
    expect(MeSchema.safeParse({ ...me, preferences: { ...me.preferences, theme: 'sepia' } }).success).toBe(false);
  });

  test('requires preferences rather than defaulting them', () => {
    const withoutPreferences = { ...me, preferences: undefined };
    expect(MeSchema.safeParse(withoutPreferences).success).toBe(false);
  });

  test('carries every declared theme', () => {
    for (const theme of USER_THEMES) {
      expect(MeSchema.safeParse({ ...me, preferences: { ...me.preferences, theme } }).success).toBe(true);
    }
  });
});

describe('HealthSchema', () => {
  test('is ok and nothing else', () => {
    expect(HealthSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
    expect(HealthSchema.safeParse({ status: 'degraded' }).success).toBe(false);
  });
});

describe('DeepHealthSchema', () => {
  test('reports each dependency', () => {
    const degraded: DeepHealth = { status: 'degraded', checks: { db: 'ok', redis: 'fail', storage: 'not_configured' } };
    expect(DeepHealthSchema.parse(degraded)).toEqual(degraded);
  });

  test('rejects a check outside ok / fail', () => {
    expect(DeepHealthSchema.safeParse({ status: 'ok', checks: { db: 'ok', redis: 'slow' } }).success).toBe(false);
  });

  test('requires every dependency to be reported', () => {
    expect(DeepHealthSchema.safeParse({ status: 'ok', checks: { db: 'ok' } }).success).toBe(false);
  });
});

describe('plan presets', () => {
  test('every plan is a limit preset, and only two of them are public', () => {
    expect(Object.keys(PLAN_PRESETS).sort()).toEqual([...ORG_PLANS].sort());
    const publicPlans = ORG_PLANS.filter(p => PLAN_PRESETS[p].public);
    expect(publicPlans).toEqual(['free', 'pro']);
  });

  test('null seats means unlimited, not zero', () => {
    expect(PLAN_PRESETS.pro_lite.seats).toBeNull();
    expect(PLAN_PRESETS.unlimited.seats).toBeNull();
    expect(PLAN_PRESETS.free.seats).toBe(20);
  });

  test('FREE_* overrides apply to the free plan and nothing else', () => {
    expect(planLimits('free', { seats: 5, storage_bytes: 123 })).toMatchObject({ seats: 5, storage_bytes: 123 });
    expect(planLimits('free', { seats: null })).toMatchObject({ seats: null });
    expect(planLimits('unlimited', { seats: 5 })).toEqual(PLAN_PRESETS.unlimited);
  });

  test('an omitted override leaves the preset alone', () => {
    expect(planLimits('free')).toEqual(PLAN_PRESETS.free);
  });
});

describe('passwordStrength', () => {
  test('anything under the minimum scores zero and says how far is left', () => {
    expect(passwordStrength('abc')).toMatchObject({ score: 0, label: 'Too short', meetsMinimum: false });
    expect(passwordStrength('abcdefg').tip).toBe('1 more character to go.');
    expect(passwordStrength('').tip).toBeNull();
  });

  test('the minimum is eight characters', () => {
    expect(passwordStrength('abcdefgh').meetsMinimum).toBe(true);
    expect(passwordStrength('abcdefg').meetsMinimum).toBe(false);
  });

  test('a common password is weak however long it is', () => {
    expect(passwordStrength('mypasswordislong').label).toBe('Weak');
  });

  test('anything guessable from the account itself is weak', () => {
    const context = { name: 'Jordan Rivera', email: 'jordan.rivera@example.com' };
    expect(passwordStrength('jordanRivera2026!', context).label).toBe('Weak');
    expect(passwordStrength('correcthorsebatterystaple', context).label).toBe('Strong');
  });

  test('repeats and keyboard runs are weak', () => {
    expect(passwordStrength('aaaaaaaaaaaa').label).toBe('Weak');
    expect(passwordStrength('qwertyuiop123').label).toBe('Weak');
  });

  test('length outranks symbols', () => {
    expect(passwordStrength('Xk9$mQ2!').score).toBeLessThan(passwordStrength('rivet-clove-tundra-mellow').score);
  });

  test('a strong password has nothing left to advise', () => {
    expect(passwordStrength('rivet clove tundra mellow').tip).toBeNull();
  });
});

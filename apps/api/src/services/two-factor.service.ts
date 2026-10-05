import {
  SIGN_IN_LOCKOUT_SECONDS,
  SIGN_IN_MAX_ATTEMPTS,
  STEP_UP_RECENT_SIGN_IN_SECONDS,
  type Acknowledgement,
  type ConfirmTwoFactor,
  type Principal,
  type StepUp,
  type TwoFactorRecoveryCodes,
  type TwoFactorSetup,
  type TwoFactorStatus,
} from '@nothingleft/types';
import {
  systemContext,
  type SessionsRepository,
  type TotpRecoveryCodesRepository,
  type UserRow,
  type UsersRepository,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { AppError } from '@lib/errors';
import { seal, unseal } from '@lib/crypto';
import { bestEffort, type Mailer } from '@lib/email';
import { verifyPassword } from '@lib/password';
import { hashRecoveryCode, isTotpShaped, issueRecoveryCodes, newTotpSecret, otpauthUri, verifyTotp } from '@lib/totp';

interface Counter {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

export interface TwoFactorDeps {
  users: UsersRepository;
  recoveryCodes: TotpRecoveryCodesRepository;
  sessions: SessionsRepository;
  mailer: Mailer;
  analytics: Analytics;
  redis: Counter;
  masterKey: Buffer;
  appBaseUrl: string;
  now?: () => Date;
}

export type SecondFactor = 'totp' | 'recovery_code';

const failuresKey = (userId: number) => `tfa:fail:${userId}`;
const aadFor = (userId: number) => `users:${userId}`;

export const requireSession = (principal: Principal): Extract<Principal, { via: 'session' }> => {
  if (principal.via !== 'session') throw new AppError('auth.session_required', 403);
  return principal;
};

export function twoFactorService(deps: TwoFactorDeps) {
  const { users, recoveryCodes, sessions, mailer, analytics, redis, masterKey, appBaseUrl } = deps;
  const now = deps.now ?? (() => new Date());
  const notify = bestEffort(mailer, error => analytics.captureException(error));
  const ctx = systemContext('two-factor state lives on the org-less users table');
  const securityUrl = `${appBaseUrl}/settings?tab=security`;

  async function account(userId: number): Promise<UserRow> {
    const user = await users.findById(ctx, userId);
    if (!user) throw AppError.unauthorized();
    return user;
  }

  const enabled = (user: UserRow) => user.totp_enabled_at !== null && user.totp_secret_ciphertext !== null;

  async function refuseWhenLocked(userId: number): Promise<void> {
    if (Number(await redis.get(failuresKey(userId))) >= SIGN_IN_MAX_ATTEMPTS) {
      throw new AppError('auth.account_locked', 429, { minutes: SIGN_IN_LOCKOUT_SECONDS / 60 });
    }
  }

  async function countFailure(userId: number): Promise<void> {
    const failures = await redis.incr(failuresKey(userId));
    if (failures === 1) await redis.expire(failuresKey(userId), SIGN_IN_LOCKOUT_SECONDS);
  }

  /** Spends a TOTP step or a recovery code; null when neither matched. */
  async function spend(user: UserRow, code: string): Promise<SecondFactor | null> {
    if (!user.totp_secret_ciphertext) return null;
    const secret = unseal(masterKey, 'totp', aadFor(user.id), user.totp_secret_ciphertext);
    const step = verifyTotp(secret, code, user.totp_last_used_step, now());
    if (step !== null) return (await users.claimTotpStep(ctx, user.id, step)) ? 'totp' : null;

    const used = await recoveryCodes.consume(ctx, user.id, hashRecoveryCode(code));
    if (!used) return null;
    const remaining = await recoveryCodes.countUnused(ctx, user.id);
    await notify.send({
      to: user.email,
      subject: 'email.recovery_code_used.subject',
      body: 'email.recovery_code_used.body',
      params: { name: user.name, remaining, url: securityUrl },
    });
    analytics.capture('recovery_code_used', { remaining }, { userId: user.id });
    return 'recovery_code';
  }

  /**
   * The second factor, counted against the account: too many wrong codes lock it for the
   * same window as wrong passwords.
   */
  async function verifySecondFactor(user: UserRow, code: string, field: string): Promise<SecondFactor> {
    await refuseWhenLocked(user.id);
    const factor = await spend(user, code);
    if (!factor) {
      await countFailure(user.id);
      throw new AppError('two_factor.invalid_code', 401, {}, field);
    }
    await redis.del(failuresKey(user.id));
    return factor;
  }

  /**
   * Confirms a destructive action: the password, plus a code when two-factor is on. An
   * account with no password proves itself by a sign-in within the last ten minutes.
   */
  async function stepUp(principal: Principal, input: StepUp): Promise<UserRow> {
    const session = requireSession(principal);
    const user = await account(session.userId);
    if (user.password_hash) {
      if (!input.current_password) throw new AppError('auth.password_required', 400, {}, 'current_password');
      await refuseWhenLocked(user.id);
      if (!(await verifyPassword(input.current_password, user.password_hash))) {
        await countFailure(user.id);
        throw new AppError('auth.wrong_password', 401, {}, 'current_password');
      }
    } else {
      const row = await sessions.findForUser(ctx, user.id, session.sessionId);
      const age = row ? (now().getTime() - row.created_at.getTime()) / 1000 : Infinity;
      if (age > STEP_UP_RECENT_SIGN_IN_SECONDS) {
        throw new AppError('auth.recent_sign_in_required', 403, { minutes: STEP_UP_RECENT_SIGN_IN_SECONDS / 60 });
      }
    }
    if (enabled(user)) {
      if (!input.code) throw new AppError('two_factor.code_required', 400, {}, 'code');
      await verifySecondFactor(user, input.code, 'code');
    }
    return user;
  }

  async function status(user: UserRow): Promise<TwoFactorStatus> {
    return {
      enabled: enabled(user),
      enabled_at: user.totp_enabled_at?.toISOString() ?? null,
      recovery_codes_remaining: enabled(user) ? await recoveryCodes.countUnused(ctx, user.id) : 0,
    };
  }

  async function freshCodes(userId: number): Promise<string[]> {
    const { codes, hashes } = issueRecoveryCodes();
    await recoveryCodes.replace(ctx, userId, hashes);
    return codes;
  }

  return {
    stepUp,
    verifySecondFactor,
    refuseWhenLocked,
    status,
    isEnabled: enabled,

    async statusFor(userId: number): Promise<TwoFactorStatus> {
      return status(await account(userId));
    },

    /** A new pending secret each call; nothing is enabled until a code from it is confirmed. */
    async setup(principal: Principal): Promise<TwoFactorSetup> {
      const user = await account(requireSession(principal).userId);
      if (enabled(user)) throw new AppError('two_factor.already_enabled', 409);
      // Two-factor guards password sign-in only; an account without a password has nothing to guard.
      if (!user.password_hash) throw new AppError('auth.no_password_set', 400);
      const secret = newTotpSecret();
      await users.update(ctx, user.id, {
        totp_secret_ciphertext: seal(masterKey, 'totp', aadFor(user.id), secret),
        totp_enabled_at: null,
        totp_last_used_step: null,
      });
      return { secret, otpauth_uri: otpauthUri(secret, user.email) };
    },

    async confirm(principal: Principal, input: ConfirmTwoFactor): Promise<TwoFactorRecoveryCodes> {
      const user = await account(requireSession(principal).userId);
      if (enabled(user)) throw new AppError('two_factor.already_enabled', 409);
      if (!user.totp_secret_ciphertext) throw new AppError('two_factor.not_set_up', 409);
      await refuseWhenLocked(user.id);
      if (!user.password_hash || !(await verifyPassword(input.current_password, user.password_hash))) {
        await countFailure(user.id);
        throw new AppError('auth.wrong_password', 401, {}, 'current_password');
      }
      const secret = unseal(masterKey, 'totp', aadFor(user.id), user.totp_secret_ciphertext);
      const step = verifyTotp(secret, input.code, null, now());
      if (step === null) {
        await countFailure(user.id);
        throw new AppError('two_factor.invalid_code', 401, {}, 'code');
      }
      const enabledAt = now();
      await users.update(ctx, user.id, { totp_enabled_at: enabledAt, totp_last_used_step: step });
      const codes = await freshCodes(user.id);
      await notify.send({
        to: user.email,
        subject: 'email.two_factor_enabled.subject',
        body: 'email.two_factor_enabled.body',
        params: { name: user.name, url: securityUrl },
      });
      analytics.capture('two_factor_enabled', {}, { userId: user.id });
      return { recovery_codes: codes, enabled_at: enabledAt.toISOString() };
    },

    async disable(principal: Principal, input: StepUp): Promise<Acknowledgement> {
      const before = await account(requireSession(principal).userId);
      if (!enabled(before)) throw new AppError('two_factor.not_enabled', 409);
      const withRecovery = input.code !== undefined && !isTotpShaped(input.code);
      const user = await stepUp(principal, input);
      await users.update(ctx, user.id, {
        totp_secret_ciphertext: null,
        totp_enabled_at: null,
        totp_last_used_step: null,
      });
      await recoveryCodes.deleteUnused(ctx, user.id);
      await notify.send({
        to: user.email,
        subject: 'email.two_factor_disabled.subject',
        body: 'email.two_factor_disabled.body',
        params: { name: user.name, url: securityUrl },
      });
      analytics.capture('two_factor_disabled', { with_recovery_code: withRecovery }, { userId: user.id });
      return { ok: true };
    },

    async regenerateCodes(principal: Principal, input: StepUp): Promise<TwoFactorRecoveryCodes> {
      const before = await account(requireSession(principal).userId);
      if (!enabled(before)) throw new AppError('two_factor.not_enabled', 409);
      const user = await stepUp(principal, input);
      const codes = await freshCodes(user.id);
      await notify.send({
        to: user.email,
        subject: 'email.recovery_codes_regenerated.subject',
        body: 'email.recovery_codes_regenerated.body',
        params: { name: user.name, url: securityUrl },
      });
      analytics.capture('recovery_codes_regenerated', {}, { userId: user.id });
      return { recovery_codes: codes, enabled_at: user.totp_enabled_at!.toISOString() };
    },
  };
}

export type TwoFactorService = ReturnType<typeof twoFactorService>;

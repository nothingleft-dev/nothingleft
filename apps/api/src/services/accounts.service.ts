import {
  ONE_TIME_TOKEN_TTL_SECONDS,
  SESSION_TTL_SECONDS,
  SIGN_IN_LOCKOUT_SECONDS,
  SIGN_IN_MAX_ATTEMPTS,
  type Acknowledgement,
  type ChangeEmail,
  type ChangePassword,
  type OneTimeTokenPurpose,
  type Principal,
  type SignIn,
  type SignUp,
  type TwoFactorSignIn,
} from '@nothingleft/types';
import {
  systemContext,
  type NewUserRow,
  type OneTimeTokensRepository,
  type PersonalAccessTokensRepository,
  type SessionsRepository,
  type TotpRecoveryCodesRepository,
  type UserPreferencesRepository,
  type UsersRepository,
  type UserRow,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { t } from '@nothingleft/i18n';
import { AppError } from '@lib/errors';
import { issueOneTimeToken, issueSessionToken, sha256 } from '@lib/crypto';
import { hashPassword, verifyPassword } from '@lib/password';
import { bestEffort, type Mailer } from '@lib/email';
import type { ProviderProfile } from '@lib/oauth';
import type { RequestFacts } from '@lib/request';
import { TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS, TWO_FACTOR_CHALLENGE_TTL_SECONDS } from '@config/constants';
import { randomToken } from '@lib/crypto';
import type { AuthService } from '@services/auth.service';
import type { TwoFactorService } from '@services/two-factor.service';

export interface SignedInSession {
  token: string;
  user: UserRow;
  sessionId: number;
  currentOrgId: number | null;
}

/** The password was right and the account has two-factor on: the second step is pending. */
export interface TwoFactorPending {
  challenge: string;
  expires_at: Date;
}

export interface ProviderTimezone {
  /** The browser's own zone; when present it replaces the stored one, as a password sign-in does. */
  device?: string | undefined;
  /** Edge-header fallback, used only for a new account. */
  fallback: string;
}

interface Counter {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

interface PendingSignIn {
  user_id: number;
  timezone: string | null;
}

/** The repositories an atomic write needs, rebound to the transaction by app.ts. */
export interface TransactionalRepos {
  users: UsersRepository;
  preferences: UserPreferencesRepository;
  sessions: SessionsRepository;
  tokens: PersonalAccessTokensRepository;
  oneTimeTokens: OneTimeTokensRepository;
  recoveryCodes: TotpRecoveryCodesRepository;
}

export interface AccountsDeps {
  inTransaction: <T>(body: (repos: TransactionalRepos) => Promise<T>) => Promise<T>;
  /** Injected so a test never reaches the breach list or Gravatar over the network. */
  isPasswordBreached: (password: string) => Promise<boolean>;
  resolveAvatarUrl: (input: { email: string; providerUrl?: string | null }) => Promise<string | null>;
  users: UsersRepository;
  sessions: SessionsRepository;
  oneTimeTokens: OneTimeTokensRepository;
  auth: AuthService;
  twoFactor: TwoFactorService;
  mailer: Mailer;
  analytics: Analytics;
  redis: Counter;
  appBaseUrl: string;
  /** True when the token is a live email invitation to exactly this address. */
  invitationProvesEmail: (token: string, email: string) => Promise<boolean>;
  /** The organisation a new session starts in; null for an account with no memberships. */
  defaultOrganization: (userId: number) => Promise<number | null>;
  /** Queues the copy of a provider photo into the public bucket, once the account has one to copy. */
  mirrorAvatar: (user: UserRow) => Promise<void>;
}

const ACK: Acknowledgement = { ok: true };
const attemptsKey = (email: string) => `signin:${email.toLowerCase()}`;
const challengeKey = (token: string) => `tfa:${sha256(token).toString('hex')}`;
const challengeAttemptsKey = (token: string) => `${challengeKey(token)}:n`;
const providerColumn = { google: 'google_id', github: 'github_id' } as const;

export function accountsService(deps: AccountsDeps) {
  const { inTransaction, users, sessions, oneTimeTokens, auth, twoFactor, mailer, analytics, redis, appBaseUrl } = deps;
  const notify = bestEffort(mailer, error => analytics.captureException(error));

  /** For a request whose whole point is the email: a failed send is an honest 502. */
  async function sendOrFail(message: Parameters<Mailer['send']>[0]) {
    try {
      await mailer.send(message);
    } catch (error) {
      analytics.captureException(error);
      throw new AppError('email.send_failed', 502);
    }
  }
  const { isPasswordBreached, resolveAvatarUrl, invitationProvesEmail, defaultOrganization } = deps;
  const ctx = systemContext('email and password identity lives on org-less tables');

  async function mintOneTimeToken(userId: number, purpose: OneTimeTokenPurpose, newEmail?: string) {
    const { token, token_hash } = issueOneTimeToken();
    await oneTimeTokens.create(ctx, {
      user_id: userId,
      purpose,
      token_hash,
      expires_at: new Date(Date.now() + ONE_TIME_TOKEN_TTL_SECONDS[purpose] * 1000),
      ...(newEmail ? { new_email: newEmail } : {}),
    });
    return token;
  }

  async function consumeOneTimeToken(purpose: OneTimeTokenPurpose, token: string) {
    const row = await oneTimeTokens.findUnused(ctx, purpose, sha256(token));
    if (!row) throw new AppError('auth.invalid_token', 400, {}, 'token');
    if (row.expires_at.getTime() <= Date.now()) throw new AppError('auth.token_expired', 400, {}, 'token');
    const consumed = await oneTimeTokens.consume(ctx, row.id);
    if (!consumed) throw new AppError('auth.invalid_token', 400, {}, 'token');
    return consumed;
  }

  async function startSession(user: UserRow, facts: RequestFacts): Promise<SignedInSession> {
    const { token, token_hash } = issueSessionToken();
    // Resolved before the insert, so the new session's own null does not count as most recent.
    const current_org_id = await defaultOrganization(user.id);
    const session = await sessions.create(ctx, {
      token_hash,
      user_id: user.id,
      current_org_id,
      user_agent: facts.user_agent,
      ip: facts.ip,
      country_code: facts.country_code,
      expires_at: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    });
    await users.update(ctx, user.id, {
      last_login_at: new Date(),
      last_login_ip: facts.ip,
      ...(facts.country_code && !user.country_code ? { country_code: facts.country_code } : {}),
    });
    return { token, user, sessionId: session.id, currentOrgId: current_org_id };
  }

  /** `next` brings a share-link sign-up back to the invitation once the address is proven. */
  async function sendVerification(send: Mailer['send'], user: UserRow, next?: string) {
    const token = await mintOneTimeToken(user.id, 'email_verify');
    const url = `${appBaseUrl}/verify-email?token=${token}${next ? `&next=${encodeURIComponent(next)}` : ''}`;
    await send({
      to: user.email,
      subject: 'email.verify.subject',
      body: 'email.verify.body',
      params: { name: user.name, url },
    });
  }

  return {
    async signUp(input: SignUp, facts: RequestFacts, timezone: string): Promise<SignedInSession> {
      if (await users.findByEmail(ctx, input.email)) {
        throw new AppError('auth.email_taken', 409, {}, 'email');
      }
      if (await isPasswordBreached(input.password)) {
        throw new AppError('auth.password_breached', 400, {}, 'password');
      }

      const [password_hash, avatar_url, invited] = await Promise.all([
        hashPassword(input.password),
        resolveAvatarUrl({ email: input.email }),
        input.invitation_token ? invitationProvesEmail(input.invitation_token, input.email) : false,
      ]);

      const user = await inTransaction(async repos => {
        const created = await repos.users.create(ctx, {
          email: input.email,
          name: input.name,
          password_hash,
          avatar_url,
          timezone,
          country_code: facts.country_code,
          ...(invited ? { email_verified_at: new Date() } : {}),
        });
        await repos.preferences.create(ctx, created.id);
        return created;
      });

      // The account already exists, so a mail outage must not fail the sign-up: the
      // unverified user signs in and asks for the email again from settings.
      if (!invited) {
        await sendVerification(
          notify.send,
          user,
          input.invitation_token ? `/invite/${input.invitation_token}` : undefined,
        );
      }
      analytics.capture('account_created', { method: 'password' }, { userId: user.id });
      return startSession(user, facts);
    },

    async signIn(input: SignIn, facts: RequestFacts): Promise<SignedInSession | TwoFactorPending> {
      const key = attemptsKey(input.email);
      if (Number(await redis.get(key)) >= SIGN_IN_MAX_ATTEMPTS) {
        throw new AppError('auth.account_locked', 429, { minutes: SIGN_IN_LOCKOUT_SECONDS / 60 });
      }

      const user = await users.findByEmail(ctx, input.email);
      const ok = user?.password_hash ? await verifyPassword(input.password, user.password_hash) : false;
      if (!user || !ok) {
        const attempts = await redis.incr(key);
        if (attempts === 1) await redis.expire(key, SIGN_IN_LOCKOUT_SECONDS);
        throw new AppError('auth.invalid_credentials', 401);
      }
      if (user.deactivated_at || user.deleted_at) throw new AppError('auth.account_deactivated', 403);

      await redis.del(key);
      if (twoFactor.isEnabled(user)) {
        // A paused second step says so now, not after the person has typed a code.
        await twoFactor.refuseWhenLocked(user.id);
        // No session yet: the password step hands over an opaque challenge, never a token with claims.
        const challenge = randomToken();
        const pending: PendingSignIn = { user_id: user.id, timezone: input.timezone ?? null };
        await redis.set(challengeKey(challenge), JSON.stringify(pending), 'EX', TWO_FACTOR_CHALLENGE_TTL_SECONDS);
        return { challenge, expires_at: new Date(Date.now() + TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000) };
      }
      if (input.timezone && input.timezone !== user.timezone) {
        await users.update(ctx, user.id, { timezone: input.timezone });
      }
      analytics.capture('signed_in', { method: 'password', second_factor: 'none' }, { userId: user.id });
      return startSession(user, facts);
    },

    /** The second step of a password sign-in. A challenge survives five wrong codes, then the password is asked again. */
    async completeTwoFactor(
      challenge: string | undefined,
      input: TwoFactorSignIn,
      facts: RequestFacts,
    ): Promise<SignedInSession> {
      const raw = challenge ? await redis.get(challengeKey(challenge)) : null;
      if (!challenge || !raw) throw new AppError('two_factor.challenge_expired', 401);
      const pending = JSON.parse(raw) as PendingSignIn;
      const user = await users.findById(ctx, pending.user_id);
      if (!user || !user.password_hash || user.deactivated_at || user.deleted_at || !twoFactor.isEnabled(user)) {
        await redis.del(challengeKey(challenge));
        throw new AppError('two_factor.challenge_expired', 401);
      }

      const field = input.code !== undefined ? 'code' : 'recovery_code';
      let factor;
      try {
        factor = await twoFactor.verifySecondFactor(user, (input.code ?? input.recovery_code)!, field);
      } catch (error) {
        const attempts = await redis.incr(challengeAttemptsKey(challenge));
        if (attempts === 1) await redis.expire(challengeAttemptsKey(challenge), TWO_FACTOR_CHALLENGE_TTL_SECONDS);
        if (attempts >= TWO_FACTOR_CHALLENGE_MAX_ATTEMPTS) await redis.del(challengeKey(challenge));
        throw error;
      }
      await redis.del(challengeKey(challenge));
      await redis.del(challengeAttemptsKey(challenge));
      if (pending.timezone && pending.timezone !== user.timezone) {
        await users.update(ctx, user.id, { timezone: pending.timezone });
      }
      analytics.capture('signed_in', { method: 'password', second_factor: factor }, { userId: user.id });
      return startSession(user, facts);
    },

    async signInWithProvider(
      profile: ProviderProfile,
      facts: RequestFacts,
      timezone: ProviderTimezone,
    ): Promise<SignedInSession & { created: boolean; linked_unverified_account: boolean }> {
      if (!profile.email_verified || !profile.email) throw new AppError('auth.oauth_email_unverified', 403);
      const column = providerColumn[profile.provider];

      let existing = await users.findByProviderId(ctx, profile.provider, profile.provider_id);
      if (!existing) {
        existing = await users.findByEmail(ctx, profile.email);
        if (existing?.[column]) throw new AppError('auth.oauth_account_conflict', 409);
      }

      if (existing) {
        if (existing.deactivated_at || existing.deleted_at) throw new AppError('auth.account_deactivated', 403);
        const userId = existing.id;
        const patch: Partial<NewUserRow> = {};
        if (!existing[column]) patch[column] = profile.provider_id;
        const avatar_url = await resolveAvatarUrl({ email: existing.email, providerUrl: profile.avatar_url });
        if (avatar_url !== existing.avatar_url) patch.avatar_url = avatar_url;
        if (timezone.device && timezone.device !== existing.timezone) patch.timezone = timezone.device;

        const linked_unverified_account = !existing.email_verified_at;
        let user = existing;
        if (linked_unverified_account) {
          // Whoever set this password never proved the address; the provider just did. Anything
          // the account issued goes with it, or a squatter who pre-registered the email keeps a way in.
          const recovered = await inTransaction(async repos => {
            const updated = await repos.users.update(ctx, userId, {
              ...patch,
              email_verified_at: new Date(),
              password_hash: null,
              totp_secret_ciphertext: null,
              totp_enabled_at: null,
              totp_last_used_step: null,
            });
            await repos.recoveryCodes.deleteUnused(ctx, userId);
            await repos.tokens.revokeAllForUser(ctx, userId);
            await repos.oneTimeTokens.deleteAllInvolving(ctx, userId);
            const revoked = await repos.sessions.deleteAllForUser(ctx, userId);
            return { updated, revoked };
          });
          await auth.invalidateMany(recovered.revoked.map(r => r.id));
          user = recovered.updated ?? existing;
          await notify.send({
            to: user.email,
            subject: 'email.unverified_account_linked.subject',
            body: 'email.unverified_account_linked.body',
            params: {
              name: user.name,
              email: user.email,
              provider: t(`provider.${profile.provider}`),
              url: `${appBaseUrl}/settings?tab=security`,
            },
          });
        } else if (Object.keys(patch).length > 0) {
          user = (await users.update(ctx, userId, patch)) ?? existing;
        }
        analytics.capture('signed_in', { method: profile.provider, second_factor: 'none' }, { userId: user.id });
        await deps.mirrorAvatar(user);
        return { ...(await startSession(user, facts)), created: false, linked_unverified_account };
      }

      const name = profile.name ?? profile.email.split('@')[0] ?? profile.email;
      const avatar_url = await resolveAvatarUrl({ email: profile.email, providerUrl: profile.avatar_url });
      const user = await inTransaction(async repos => {
        const created = await repos.users.create(ctx, {
          email: profile.email,
          email_verified_at: new Date(),
          name,
          avatar_url,
          [column]: profile.provider_id,
          timezone: timezone.device ?? timezone.fallback,
          country_code: facts.country_code,
        });
        await repos.preferences.create(ctx, created.id);
        return created;
      });
      analytics.capture('account_created', { method: profile.provider }, { userId: user.id });
      await deps.mirrorAvatar(user);
      return { ...(await startSession(user, facts)), created: true, linked_unverified_account: false };
    },

    async signOut(principal: Principal): Promise<Acknowledgement> {
      if (principal.via !== 'session') return ACK;
      await sessions.deleteForUser(ctx, principal.userId, principal.sessionId);
      await auth.invalidate(principal.sessionId);
      return ACK;
    },

    async verifyEmail(token: string): Promise<Acknowledgement> {
      const consumed = await consumeOneTimeToken('email_verify', token);
      await users.update(ctx, consumed.user_id, { email_verified_at: new Date() });
      return ACK;
    },

    async resendVerification(principal: Principal): Promise<Acknowledgement> {
      const user = await users.findById(ctx, principal.userId);
      if (!user) throw AppError.notFound();
      if (!user.email_verified_at) await sendVerification(sendOrFail, user);
      return ACK;
    },

    /** Always acknowledges: whether the address has an account is not disclosed. */
    async requestPasswordReset(email: string): Promise<Acknowledgement> {
      const user = await users.findByEmail(ctx, email);
      if (user && !user.deleted_at) {
        const token = await mintOneTimeToken(user.id, 'password_reset');
        // Best effort even here: an error only for real accounts would disclose which exist.
        await notify.send({
          to: user.email,
          subject: 'email.password_reset.subject',
          body: 'email.password_reset.body',
          params: { name: user.name, url: `${appBaseUrl}/reset-password?token=${token}` },
        });
      }
      return ACK;
    },

    async resetPassword(token: string, password: string): Promise<Acknowledgement> {
      if (await isPasswordBreached(password)) {
        throw new AppError('auth.password_breached', 400, {}, 'password');
      }
      const consumed = await consumeOneTimeToken('password_reset', token);
      const password_hash = await hashPassword(password);
      const user = await users.update(ctx, consumed.user_id, { password_hash });
      if (!user) throw AppError.notFound();
      await oneTimeTokens.deleteForUser(ctx, user.id, 'password_reset');

      const revoked = await sessions.deleteAllForUser(ctx, user.id);
      await auth.invalidateMany(revoked.map(r => r.id));
      await notify.send({
        to: user.email,
        subject: 'email.password_changed.subject',
        body: 'email.password_changed.body',
        params: { name: user.name, url: `${appBaseUrl}/reset-password` },
      });
      analytics.capture('password_reset_completed', {}, { userId: user.id });
      return ACK;
    },

    async changePassword(principal: Principal, input: ChangePassword): Promise<Acknowledgement> {
      const user = await users.findById(ctx, principal.userId);
      if (!user) throw AppError.notFound();
      if (!user.password_hash) throw new AppError('auth.no_password_set', 400);
      if (!(await verifyPassword(input.current_password, user.password_hash))) {
        throw new AppError('auth.wrong_password', 401, {}, 'current_password');
      }
      if (await isPasswordBreached(input.password)) {
        throw new AppError('auth.password_breached', 400, {}, 'password');
      }

      await users.update(ctx, user.id, { password_hash: await hashPassword(input.password) });
      await oneTimeTokens.deleteForUser(ctx, user.id, 'password_reset');
      const keep = principal.via === 'session' ? principal.sessionId : undefined;
      const revoked = await sessions.deleteAllForUser(ctx, user.id, keep);
      await auth.invalidateMany(revoked.map(r => r.id));
      await notify.send({
        to: user.email,
        subject: 'email.password_changed.subject',
        body: 'email.password_changed.body',
        params: { name: user.name, url: `${appBaseUrl}/settings?tab=security` },
      });
      return ACK;
    },

    async requestEmailChange(principal: Principal, input: ChangeEmail): Promise<Acknowledgement> {
      const user = await users.findById(ctx, principal.userId);
      if (!user) throw AppError.notFound();
      if (!user.email_verified_at) throw new AppError('auth.email_unverified', 403);
      if (!user.password_hash) throw new AppError('auth.no_password_set', 400);
      if (!(await verifyPassword(input.current_password, user.password_hash))) {
        throw new AppError('auth.wrong_password', 401, {}, 'current_password');
      }
      const existing = await users.findByEmail(ctx, input.email);
      if (existing && existing.id !== user.id) throw new AppError('auth.email_taken', 409, {}, 'email');

      const token = await mintOneTimeToken(user.id, 'email_change', input.email);
      await sendOrFail({
        to: input.email,
        subject: 'email.email_change_verify.subject',
        body: 'email.email_change_verify.body',
        params: { name: user.name, new_email: input.email, url: `${appBaseUrl}/verify-email?token=${token}` },
      });
      return ACK;
    },

    async confirmEmailChange(token: string): Promise<Acknowledgement> {
      const consumed = await consumeOneTimeToken('email_change', token);
      if (!consumed.new_email) throw new AppError('auth.invalid_token', 400, {}, 'token');

      const before = await users.findById(ctx, consumed.user_id);
      if (!before) throw AppError.notFound();
      const taken = await users.findByEmail(ctx, consumed.new_email);
      if (taken && taken.id !== before.id) throw new AppError('auth.email_taken', 409, {}, 'email');

      const old_email = before.email;
      await users.update(ctx, before.id, { email: consumed.new_email, email_verified_at: new Date() });

      const params = { name: before.name, old_email, new_email: consumed.new_email };
      for (const to of [old_email, consumed.new_email]) {
        await notify.send({ to, subject: 'email.email_changed.subject', body: 'email.email_changed.body', params });
      }
      analytics.capture('email_changed', {}, { userId: before.id });
      return ACK;
    },
  };
}

export type AccountsService = ReturnType<typeof accountsService>;

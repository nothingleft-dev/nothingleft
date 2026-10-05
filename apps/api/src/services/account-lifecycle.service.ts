import type { Acknowledgement, Principal, StepUp } from '@nothingleft/types';
import {
  systemContext,
  type OneTimeTokensRepository,
  type OrganizationsRepository,
  type PersonalAccessTokensRepository,
  type SessionsRepository,
  type UserRow,
  type UsersRepository,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { AppError } from '@lib/errors';
import { bestEffort, type Mailer } from '@lib/email';
import type { AuthService } from '@services/auth.service';
import type { TwoFactorService } from '@services/two-factor.service';

/** The repositories one deactivation writes together, rebound to the transaction by app.ts. */
export interface LifecycleRepos {
  users: UsersRepository;
  sessions: SessionsRepository;
  tokens: PersonalAccessTokensRepository;
  oneTimeTokens: OneTimeTokensRepository;
}

export interface AccountLifecycleDeps {
  users: UsersRepository;
  organizations: OrganizationsRepository;
  inTransaction: <T>(body: (repos: LifecycleRepos) => Promise<T>) => Promise<T>;
  auth: AuthService;
  twoFactor: TwoFactorService;
  mailer: Mailer;
  analytics: Analytics;
  now?: () => Date;
}

type Actor = 'self' | 'operator';

export function accountLifecycleService(deps: AccountLifecycleDeps) {
  const { users, organizations, inTransaction, auth, twoFactor, mailer, analytics } = deps;
  const now = deps.now ?? (() => new Date());
  const notify = bestEffort(mailer, error => analytics.captureException(error));
  const ctx = systemContext('an account is global: deactivation reaches every organisation it belongs to');

  /** An Owner must stay reachable while their organisation lives, a scheduled deletion included. */
  async function refuseOwner(user: UserRow): Promise<void> {
    const owned = await organizations.listOwnedBy(ctx, user.id);
    if (owned.length > 0) {
      throw new AppError(
        'account.owns_organization',
        409,
        {},
        undefined,
        owned.map(o => o.slug),
      );
    }
  }

  async function deactivate(user: UserRow, by: Actor): Promise<void> {
    if (user.deleted_at) throw new AppError('account.not_found', 404);
    if (user.deactivated_at) throw new AppError('account.already_deactivated', 409);
    await refuseOwner(user);

    const revoked = await inTransaction(async repos => {
      await repos.users.update(ctx, user.id, { deactivated_at: now() });
      await repos.tokens.revokeAllForUser(ctx, user.id);
      await repos.oneTimeTokens.deleteAllInvolving(ctx, user.id);
      return repos.sessions.deleteAllForUser(ctx, user.id);
    });
    await auth.invalidateMany(revoked.map(r => r.id));

    await notify.send({
      to: user.email,
      subject: 'email.account_deactivated.subject',
      body: 'email.account_deactivated.body',
      params: { name: user.name },
    });
    analytics.capture('account_deactivated', { by }, { userId: user.id });
  }

  return {
    async deactivateSelf(principal: Principal, input: StepUp): Promise<Acknowledgement> {
      const user = await twoFactor.stepUp(principal, input);
      await deactivate(user, 'self');
      return { ok: true };
    },

    /** The platform operator's path, from `bun run account` - never a route. */
    async deactivateByEmail(email: string): Promise<UserRow> {
      const user = await users.findByEmail(ctx, email);
      if (!user) throw new AppError('account.not_found', 404);
      await deactivate(user, 'operator');
      return (await users.findById(ctx, user.id))!;
    },

    /** Everything returns as it was: memberships were never touched. Sessions and tokens do not. */
    async reactivateByEmail(email: string): Promise<UserRow> {
      const user = await users.findByEmail(ctx, email);
      if (!user || user.deleted_at) throw new AppError('account.not_found', 404);
      if (!user.deactivated_at) throw new AppError('account.not_deactivated', 409);
      const updated = (await users.update(ctx, user.id, { deactivated_at: null }))!;
      await notify.send({
        to: updated.email,
        subject: 'email.account_reactivated.subject',
        body: 'email.account_reactivated.body',
        params: { name: updated.name },
      });
      analytics.capture('account_reactivated', {}, { userId: updated.id });
      return updated;
    },
  };
}

export type AccountLifecycleService = ReturnType<typeof accountLifecycleService>;

declare module 'fastify' {
  interface FastifyInstance {
    /** The platform operator's deactivate and reactivate, for scripts/account.ts - never a route. */
    accountLifecycle: AccountLifecycleService;
  }
}

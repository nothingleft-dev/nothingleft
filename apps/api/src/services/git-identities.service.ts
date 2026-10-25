import type { Analytics } from '@nothingleft/analytics';
import {
  ONE_TIME_TOKEN_TTL_SECONDS,
  type ClaimGitIdentity,
  type GitIdentity,
  type GitProviderKind,
  type GitIdentityVerification,
  type MemberGitIdentity,
  type Principal,
} from '@nothingleft/types';
import {
  systemContext,
  tenantContext,
  type GitEntitiesRepository,
  type GitIdentitiesRepository,
  type GitIdentityRow,
  type OneTimeTokensRepository,
  type OrganizationsRepository,
  type UsersRepository,
} from '@nothingleft/db';
import { issueOneTimeToken, sha256 } from '@lib/crypto';
import type { Mailer } from '@lib/email';
import { AppError } from '@lib/errors';
import type { JobQueue } from '@lib/jobs';
import { isUniqueViolation } from '@lib/pg-errors';
import type { ProviderRegistry } from '@git/providers/index';
import type { AccessService } from '@services/access';
import { missingSelfServiceScope } from '@services/permissions';

export interface GitIdentitiesDeps {
  access: AccessService;
  identities: GitIdentitiesRepository;
  entities: GitEntitiesRepository;
  users: UsersRepository;
  organizations: OrganizationsRepository;
  oneTimeTokens: OneTimeTokensRepository;
  providers: ProviderRegistry;
  mailer: Mailer;
  queue: () => JobQueue;
  analytics: Analytics;
  appBaseUrl: string;
  now?: () => Date;
}

const sys = systemContext('a git identity belongs to the account, in every organisation');
const MINUTE_MS = 60_000;
// One link per address per ten minutes, and a handful an hour, so a claim cannot be used to mail strangers.
const RESEND_AFTER_MS = 10 * MINUTE_MS;
const LINKS_PER_HOUR = 5;

export function gitIdentitiesService(deps: GitIdentitiesDeps) {
  const { access, identities, entities, users, organizations, oneTimeTokens, providers } = deps;
  const now = deps.now ?? (() => new Date());

  function requireScope(principal: Principal) {
    const lacking = missingSelfServiceScope(principal, 'git_identity.manage');
    if (lacking) throw AppError.scopeMissing(lacking);
  }

  const toDto = (row: GitIdentityRow): GitIdentity => ({
    id: row.id,
    provider: row.provider as GitProviderKind,
    base_url: row.base_url,
    login: row.login,
    email: row.email,
    verified_by: row.verified_by as GitIdentityVerification,
    verified_at: row.verified_at?.toISOString() ?? null,
    pending: row.verified_at === null,
    created_at: row.created_at.toISOString(),
  });

  const keyOf = (row: GitIdentityRow) => ({
    provider: row.provider,
    base_url: row.base_url,
    login: row.login,
    email: row.email,
  });

  const rematch = (userId: number) =>
    deps
      .queue()
      .send('git.rematch_authors', { user_id: userId }, { startAfter: now(), singletonKey: `rematch:${userId}` });

  /**
   * Deletes the identity, unattributes what it matches, then re-matches from what the account still
   * has, so a row another of its identities (or its own address) also matches comes back.
   */
  async function forget(row: GitIdentityRow) {
    await identities.remove(sys, row.user_id, row.id);
    for (const { organization } of await organizations.listForUser(sys, row.user_id)) {
      await entities.unmatchAuthors(tenantContext(organization.id), row.user_id, keyOf(row));
    }
    await rematch(row.user_id);
  }

  async function mine(userId: number): Promise<GitIdentity[]> {
    return (await identities.listForUser(sys, userId)).map(toDto);
  }

  async function sendVerification(userId: number, email: string) {
    const user = await users.findById(sys, userId);
    if (!user) throw AppError.notFound();
    const at = now().getTime();
    if (
      (await oneTimeTokens.countRecent(sys, userId, 'git_identity_email', new Date(at - RESEND_AFTER_MS), email)) > 0
    ) {
      return;
    }
    if (
      (await oneTimeTokens.countRecent(sys, userId, 'git_identity_email', new Date(at - 60 * MINUTE_MS))) >=
      LINKS_PER_HOUR
    ) {
      throw new AppError('git.identity_links_limited', 429, { minutes: 60 });
    }
    const { token, token_hash } = issueOneTimeToken();
    await oneTimeTokens.create(sys, {
      user_id: userId,
      purpose: 'git_identity_email',
      token_hash,
      new_email: email,
      expires_at: new Date(now().getTime() + ONE_TIME_TOKEN_TTL_SECONDS.git_identity_email * 1000),
    });
    await deps.mailer.send({
      to: email,
      subject: 'email.git_identity_verify.subject',
      body: 'email.git_identity_verify.body',
      params: { name: user.name, email, url: `${deps.appBaseUrl}/verify-git-email?token=${token}` },
    });
  }

  async function insert(row: Parameters<GitIdentitiesRepository['insert']>[1]): Promise<GitIdentityRow> {
    try {
      return await identities.insert(sys, row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError('git.identity_taken', 409, {}, row.login ? 'login' : 'email');
      throw error;
    }
  }

  return {
    async list(principal: Principal): Promise<GitIdentity[]> {
      requireScope(principal);
      return mine(principal.userId);
    },

    /**
     * A login counts at once (an Org Admin can remove a wrong one); an email only once the link
     * sent to it is followed, unless it is the account's own verified address.
     */
    async claim(principal: Principal, input: ClaimGitIdentity): Promise<GitIdentity[]> {
      requireScope(principal);
      const provider = providers.get(input.provider);
      const baseUrl = input.base_url ?? provider?.defaultBaseUrl;
      if (!baseUrl) throw new AppError('git.provider_unknown', 422, { provider: input.provider }, 'provider');
      const at = now();
      let added = true;
      if (input.login) {
        await insert({
          user_id: principal.userId,
          provider: input.provider,
          base_url: baseUrl,
          login: input.login.replace(/^@/, ''),
          verified_by: 'claim',
          verified_at: at,
        });
        await rematch(principal.userId);
      } else {
        const email = input.email!.toLowerCase();
        const user = await users.findById(sys, principal.userId);
        const owner = await users.findByEmail(sys, email);
        if (owner && owner.id !== principal.userId && owner.email_verified_at) {
          throw new AppError('git.identity_taken', 409, {}, 'email');
        }
        const ownAddress = user?.email.toLowerCase() === email && user.email_verified_at !== null;
        const existing = await identities.findOwnEmail(sys, principal.userId, email);
        if (existing?.verified_at) return mine(principal.userId);
        added = !existing;
        if (!existing) {
          await insert({
            user_id: principal.userId,
            provider: input.provider,
            base_url: baseUrl,
            email,
            verified_by: 'email',
            verified_at: ownAddress ? at : null,
          });
        }
        if (ownAddress) await rematch(principal.userId);
        else await sendVerification(principal.userId, email);
      }
      if (added) {
        deps.analytics.capture(
          'git_identity_claimed',
          { provider: input.provider, kind: input.login ? 'login' : 'email' },
          { userId: principal.userId },
        );
      }
      return mine(principal.userId);
    },

    /** The link in the email: the claim starts matching commits. */
    async confirm(token: string): Promise<GitIdentity> {
      const row = await oneTimeTokens.findUnused(sys, 'git_identity_email', sha256(token));
      if (!row || !row.new_email) throw new AppError('auth.invalid_token', 400, {}, 'token');
      if (row.expires_at <= now()) throw new AppError('auth.token_expired', 400, {}, 'token');
      if (!(await oneTimeTokens.consume(sys, row.id))) throw new AppError('auth.invalid_token', 400, {}, 'token');
      const identity = await identities.findOwnEmail(sys, row.user_id, row.new_email);
      if (!identity) throw new AppError('auth.invalid_token', 400, {}, 'token');
      if (identity.verified_at) return toDto(identity);
      let verified: GitIdentityRow | undefined;
      try {
        verified = await identities.markVerified(sys, identity.id, now());
      } catch (error) {
        // Someone else verified the same address first.
        if (isUniqueViolation(error)) throw new AppError('git.identity_taken', 409, {}, 'email');
        throw error;
      }
      await rematch(row.user_id);
      return toDto(verified ?? identity);
    },

    async remove(principal: Principal, id: number): Promise<GitIdentity[]> {
      requireScope(principal);
      const row = await identities.findById(sys, id);
      if (!row || row.user_id !== principal.userId) throw new AppError('git.identity_not_found', 404, {}, 'id');
      await forget(row);
      return mine(principal.userId);
    },

    async listForOrg(principal: Principal, slug: string): Promise<MemberGitIdentity[]> {
      const org = await access.org(principal, slug);
      access.require(principal, 'org.git.identities.manage', org.scope);
      const rows = (await identities.listForOrg(org.ctx)).filter(r => r.verified_at !== null);
      const members = await organizations.findMembersByUserIds(org.ctx, [...new Set(rows.map(r => r.user_id))]);
      return rows.flatMap(row => {
        const m = members.find(x => x.user.id === row.user_id);
        return m ? [{ ...toDto(row), member: access.memberRef(m.user, m.membership) }] : [];
      });
    },

    /** An Org Admin takes back a member's claim, say a login that is not theirs. */
    async removeForMember(principal: Principal, slug: string, id: number): Promise<MemberGitIdentity[]> {
      const org = await access.org(principal, slug);
      access.require(principal, 'org.git.identities.manage', org.scope);
      const row = await identities.findById(sys, id);
      const member = row ? await organizations.findMembership(org.ctx, row.user_id) : undefined;
      // Only an unproven login: an email the person verified is theirs, whatever an admin thinks.
      if (!row || !member || member.removed_at || row.verified_by !== 'claim') {
        throw new AppError('git.identity_not_found', 404, {}, 'id');
      }
      await forget(row);
      return this.listForOrg(principal, slug);
    },

    /** The job a claim queues: every organisation the account is in, every verified identity. */
    async rematchAuthors(userId: number): Promise<number> {
      const user = await users.findById(sys, userId);
      const claims = (await identities.listForUser(sys, userId)).filter(r => r.verified_at !== null).map(keyOf);
      // The account's own verified address matches at write time too, so it is re-matched alongside.
      if (user?.email_verified_at) claims.push({ provider: '', base_url: '', login: null, email: user.email });
      let n = 0;
      for (const { organization } of await organizations.listForUser(sys, userId)) {
        for (const claim of claims) n += await entities.rematchAuthors(tenantContext(organization.id), userId, claim);
      }
      return n;
    },
  };
}

export type GitIdentitiesService = ReturnType<typeof gitIdentitiesService>;

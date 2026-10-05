import type {
  CreatedPersonalAccessToken,
  CurrentToken,
  CreatePersonalAccessToken,
  PatScope,
  PersonalAccessToken,
  Principal,
} from '@nothingleft/types';
import {
  systemContext,
  type OrganizationsRepository,
  type PersonalAccessTokensRepository,
  type PersonalAccessTokenWithProjects,
  type ProjectsRepository,
  type TokenProjectRef,
  type UsersRepository,
} from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { AppError } from '@lib/errors';
import { issuePat } from '@lib/crypto';
import { bestEffort, type Mailer } from '@lib/email';
import { requireSession } from '@services/two-factor.service';

export interface TokensDeps {
  tokens: PersonalAccessTokensRepository;
  inTransaction: <T>(body: (repos: { tokens: PersonalAccessTokensRepository }) => Promise<T>) => Promise<T>;
  projects: ProjectsRepository;
  organizations: OrganizationsRepository;
  users: UsersRepository;
  mailer: Mailer;
  analytics: Analytics;
  appBaseUrl: string;
}

export function tokensService({
  tokens,
  inTransaction,
  projects,
  organizations,
  users,
  mailer,
  analytics,
  appBaseUrl,
}: TokensDeps) {
  const notify = bestEffort(mailer, error => analytics.captureException(error));
  const ctx = systemContext('a personal access token is user-level, never organisation-scoped');

  async function toDto(row: PersonalAccessTokenWithProjects, userId: number): Promise<PersonalAccessToken> {
    const restricted = row.project_ids;
    const keys = restricted
      ? (await projects.listAcrossUserOrgs(ctx, userId, { ids: restricted })).map(p => p.key).sort()
      : null;
    return {
      id: row.id,
      name: row.name,
      token_prefix: row.token_prefix,
      scopes: row.scopes as PatScope[],
      project_keys: keys,
      expires_at: row.expires_at?.toISOString() ?? null,
      last_used_at: row.last_used_at?.toISOString() ?? null,
      created_at: row.created_at.toISOString(),
      revoked_at: row.revoked_at?.toISOString() ?? null,
    };
  }

  async function resolveProjects(userId: number, keys: string[]): Promise<TokenProjectRef[]> {
    const found = await projects.listAcrossUserOrgs(ctx, userId, { keys });
    for (const key of keys) {
      const matches = found.filter(p => p.key === key);
      if (matches.length === 0) throw new AppError('project.not_found', 404, { key }, 'project_keys');
      if (matches.length > 1) {
        const slugs = new Map(
          (await organizations.listForUser(ctx, userId)).map(m => [m.organization.id, m.organization.slug]),
        );
        const candidates = [...new Set(matches.map(m => slugs.get(m.org_id)!))].sort();
        throw new AppError('organization_ambiguous', 400, {}, 'project_keys', candidates);
      }
    }
    return found.map(p => ({ project_id: p.id, org_id: p.org_id }));
  }

  return {
    async list(principal: Principal): Promise<PersonalAccessToken[]> {
      const rows = await tokens.listForUser(ctx, principal.userId);
      return Promise.all(rows.map(row => toDto(row, principal.userId)));
    },

    async current(principal: Principal): Promise<CurrentToken | null> {
      if (principal.via !== 'pat') return null;
      const row = (await tokens.listForUser(ctx, principal.userId)).find(t => t.id === principal.tokenId);
      if (!row) return null;
      const { name, token_prefix, scopes, project_keys, expires_at } = await toDto(row, principal.userId);
      return { name, token_prefix, scopes, project_keys, expires_at };
    },

    async create(principal: Principal, input: CreatePersonalAccessToken): Promise<CreatedPersonalAccessToken> {
      requireSession(principal);
      const owner = await users.findById(ctx, principal.userId);
      if (!owner) throw AppError.unauthorized();
      if (!owner.email_verified_at) throw new AppError('auth.email_unverified', 403);

      const keys = input.project_keys ?? null;
      const restrictedTo = keys && keys.length > 0 ? await resolveProjects(principal.userId, keys) : null;

      const issued = issuePat();
      const row = await inTransaction(async repos => {
        const created = await repos.tokens.create(ctx, {
          user_id: principal.userId,
          name: input.name,
          token_hash: issued.token_hash,
          token_prefix: issued.token_prefix,
          scopes: [...input.scopes],
          restricted: restrictedTo !== null,
          expires_at: input.expires_at ? new Date(input.expires_at) : null,
        });
        await repos.tokens.addProjects(ctx, created.id, restrictedTo ?? []);
        return { ...created, project_ids: restrictedTo?.map(p => p.project_id) ?? null };
      });

      await notify.send({
        to: owner.email,
        subject: 'email.pat_created.subject',
        body: 'email.pat_created.body',
        params: { name: owner.name, token_name: input.name, url: `${appBaseUrl}/settings?tab=tokens` },
      });

      analytics.capture(
        'pat_created',
        { scope_count: input.scopes.length, project_restricted: restrictedTo !== null, expires: !!input.expires_at },
        { userId: principal.userId },
      );

      // Only the hash reached the database; this response is the one place the raw token exists.
      return { ...(await toDto(row, principal.userId)), token: issued.token };
    },

    async revoke(principal: Principal, id: number): Promise<PersonalAccessToken> {
      requireSession(principal);
      const row = await tokens.revokeForUser(ctx, principal.userId, id);
      if (!row) throw new AppError('token.not_found', 404);
      analytics.capture('pat_revoked', {}, { userId: principal.userId });
      return toDto(row, principal.userId);
    },
  };
}

export type TokensService = ReturnType<typeof tokensService>;

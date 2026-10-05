import type { Principal, Session } from '@nothingleft/types';
import { systemContext, type SessionsRepository, type SessionWithOrg } from '@nothingleft/db';
import type { Analytics } from '@nothingleft/analytics';
import { AppError } from '@lib/errors';
import type { AuthService } from '@services/auth.service';
import type { TenancyService } from '@services/tenancy.service';
import { requireSession } from '@services/two-factor.service';

export interface SessionsDeps {
  sessions: SessionsRepository;
  auth: AuthService;
  tenancy: TenancyService;
  analytics: Analytics;
}

const currentSessionId = (principal: Principal) => (principal.via === 'session' ? principal.sessionId : null);

export function sessionsService({ sessions, auth, tenancy, analytics }: SessionsDeps) {
  const ctx = systemContext('a user reads and revokes their own sessions across organisations');

  const toDto = (row: SessionWithOrg, currentId: number | null): Session => ({
    id: row.session.id,
    current: row.session.id === currentId,
    user_agent: row.session.user_agent,
    ip: row.session.ip,
    country_code: row.session.country_code,
    current_organization_slug: row.organization_slug,
    created_at: row.session.created_at.toISOString(),
    last_seen_at: row.session.last_seen_at.toISOString(),
    expires_at: row.session.expires_at.toISOString(),
  });

  async function one(principal: Principal, id: number): Promise<Session> {
    const rows = await sessions.listForUser(ctx, principal.userId);
    const found = rows.find(r => r.session.id === id);
    if (!found) throw new AppError('session.not_found', 404);
    return toDto(found, currentSessionId(principal));
  }

  return {
    async list(principal: Principal): Promise<Session[]> {
      const rows = await sessions.listForUser(ctx, principal.userId);
      const currentId = currentSessionId(principal);
      return rows.map(r => toDto(r, currentId));
    },

    async revoke(principal: Principal, id: number): Promise<Session> {
      requireSession(principal);
      const final = await one(principal, id);
      const removed = await sessions.deleteForUser(ctx, principal.userId, id);
      if (!removed) throw new AppError('session.not_found', 404);
      await auth.invalidate(id);
      analytics.capture('sessions_revoked', { count: 1, all: false }, { userId: principal.userId });
      return final;
    },

    /** Sign out everywhere. The caller's own session survives so the page stays usable. */
    async revokeOthers(principal: Principal): Promise<Session[]> {
      const keep = requireSession(principal).sessionId;
      const revoked = await sessions.deleteAllForUser(ctx, principal.userId, keep);
      await auth.invalidateMany(revoked.map(r => r.id));
      if (revoked.length > 0) {
        analytics.capture('sessions_revoked', { count: revoked.length, all: true }, { userId: principal.userId });
      }
      return this.list(principal);
    },

    /** After creating or joining an organisation the browser lands in it; a PAT has no current one. */
    async enterOrganization(principal: Principal, orgId: number): Promise<void> {
      if (principal.via !== 'session') return;
      await sessions.setCurrentOrg(ctx, principal.sessionId, orgId);
      await auth.invalidate(principal.sessionId);
    },

    /** A removed member's browsers stop pointing at the organisation; their other ones are untouched. */
    async countLive(userId: number): Promise<number> {
      return sessions.countLiveForUser(ctx, userId);
    },

    async forgetOrganization(userId: number, orgId: number): Promise<void> {
      const cleared = await sessions.clearCurrentOrgForUser(ctx, userId, orgId);
      await auth.invalidateMany(cleared.map(r => r.id));
    },

    async setCurrentOrganization(principal: Principal, slug: string): Promise<Session> {
      if (principal.via !== 'session') throw AppError.forbidden();
      const organization = await tenancy.findBySlugForUser(principal.userId, slug);
      await sessions.setCurrentOrg(ctx, principal.sessionId, organization.id);
      await auth.invalidate(principal.sessionId);
      return one(principal, principal.sessionId);
    },
  };
}

export type SessionsService = ReturnType<typeof sessionsService>;

import { z } from 'zod';
import { OAuthProviderSchema, type OAuthCallback, type OAuthProvider, type OAuthStart } from '@nothingleft/types';
import { OAUTH_STATE_TTL_SECONDS } from '@config/constants';
import { AppError } from '@lib/errors';
import { issuePkcePair, randomToken } from '@lib/crypto';
import type { OAuthClients } from '@lib/oauth';
import type { RequestFacts } from '@lib/request';
import type { AccountsService } from '@services/accounts.service';

interface StateStore {
  set(key: string, value: string, mode: 'EX', seconds: number): Promise<unknown>;
  getdel(key: string): Promise<string | null>;
}

export interface OAuthDeps {
  clients: OAuthClients;
  accounts: AccountsService;
  store: StateStore;
  appBaseUrl: string;
}

const PendingSchema = z.object({ provider: OAuthProviderSchema, verifier: z.string() });
const stateKey = (state: string) => `oauth:${state}`;

export function oauthService({ clients, accounts, store, appBaseUrl }: OAuthDeps) {
  const redirectUri = (provider: OAuthProvider) => `${appBaseUrl}/auth/${provider}/callback`;
  const clientFor = (provider: OAuthProvider) => {
    const client = clients[provider];
    if (!client) throw new AppError('auth.oauth_not_configured', 503);
    return client;
  };

  return {
    /** The caller binds `state` to the browser (a cookie) so a callback cannot be replayed from elsewhere. */
    async start(provider: OAuthProvider): Promise<OAuthStart & { state: string }> {
      const client = clientFor(provider);
      const state = randomToken();
      const { verifier, challenge } = issuePkcePair();
      await store.set(stateKey(state), JSON.stringify({ provider, verifier }), 'EX', OAUTH_STATE_TTL_SECONDS);
      const authorize_url = client.authorizeUrl({
        state,
        codeChallenge: challenge,
        redirectUri: redirectUri(provider),
      });
      return { state, authorize_url };
    },

    async complete(
      provider: OAuthProvider,
      input: OAuthCallback,
      boundState: string | undefined,
      facts: RequestFacts,
      fallbackTimezone: string,
    ) {
      const client = clientFor(provider);
      if (!boundState || boundState !== input.state) throw new AppError('auth.oauth_state_invalid', 400);

      const pending = PendingSchema.safeParse(JSON.parse((await store.getdel(stateKey(input.state))) ?? 'null'));
      if (!pending.success || pending.data.provider !== provider) {
        throw new AppError('auth.oauth_state_invalid', 400);
      }

      const profile = await client.exchange({
        code: input.code,
        codeVerifier: pending.data.verifier,
        redirectUri: redirectUri(provider),
      });
      return accounts.signInWithProvider(profile, facts, { device: input.timezone, fallback: fallbackTimezone });
    },
  };
}

export type OAuthService = ReturnType<typeof oauthService>;

import { z } from 'zod';
import type { OAuthProvider } from '@nothingleft/types';
import type { Env } from '@config/env';
import { OAUTH_REQUEST_TIMEOUT_MS } from '@config/constants';
import { AppError } from '@lib/errors';

export interface ProviderProfile {
  provider: OAuthProvider;
  provider_id: string;
  email: string;
  email_verified: boolean;
  name: string | null;
  avatar_url: string | null;
}

export interface AuthorizeInput {
  state: string;
  codeChallenge: string;
  redirectUri: string;
}

export interface ExchangeInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface OAuthClient {
  authorizeUrl(input: AuthorizeInput): string;
  exchange(input: ExchangeInput): Promise<ProviderProfile>;
}

export type OAuthClients = Partial<Record<OAuthProvider, OAuthClient>>;

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

interface Credentials {
  clientId: string;
  clientSecret: string;
}

const TokenResponse = z.object({ access_token: z.string().min(1) });

const GoogleUserinfo = z.object({
  sub: z.string().min(1),
  email: z.string().min(1),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.string().optional(),
});

const GithubUser = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
});

const GithubEmails = z.array(z.object({ email: z.string(), primary: z.boolean(), verified: z.boolean() }));

const failed = () => new AppError('auth.oauth_failed', 502);

async function readJson<S extends z.ZodType>(fetchImpl: Fetch, url: string, init: RequestInit, schema: S) {
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(OAUTH_REQUEST_TIMEOUT_MS) });
  } catch {
    throw failed();
  }
  if (!response.ok) throw failed();
  const parsed = schema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw failed();
  return parsed.data as z.output<S>;
}

function withQuery(base: string, params: Record<string, string>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

export function googleClient({ clientId, clientSecret }: Credentials, fetchImpl: Fetch = fetch): OAuthClient {
  return {
    authorizeUrl: ({ state, codeChallenge, redirectUri }) =>
      withQuery('https://accounts.google.com/o/oauth2/v2/auth', {
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      }),

    async exchange({ code, codeVerifier, redirectUri }) {
      const { access_token } = await readJson(
        fetchImpl,
        'https://oauth2.googleapis.com/token',
        {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret,
          }).toString(),
        },
        TokenResponse,
      );
      // The userinfo endpoint carries the same email_verified claim as the ID token, without
      // this service having to decode a JWT.
      const info = await readJson(
        fetchImpl,
        'https://openidconnect.googleapis.com/v1/userinfo',
        { headers: { authorization: `Bearer ${access_token}` } },
        GoogleUserinfo,
      );
      return {
        provider: 'google',
        provider_id: info.sub,
        email: info.email,
        email_verified: info.email_verified,
        name: info.name?.trim() || null,
        avatar_url: info.picture ?? null,
      };
    },
  };
}

export function githubClient({ clientId, clientSecret }: Credentials, fetchImpl: Fetch = fetch): OAuthClient {
  return {
    authorizeUrl: ({ state, codeChallenge, redirectUri }) =>
      withQuery('https://github.com/login/oauth/authorize', {
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'read:user user:email',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      }),

    async exchange({ code, codeVerifier, redirectUri }) {
      // GitHub answers a bad code with 200 and an `error` body, which TokenResponse rejects.
      const { access_token } = await readJson(
        fetchImpl,
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            code_verifier: codeVerifier,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret,
          }).toString(),
        },
        TokenResponse,
      );
      const headers = {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${access_token}`,
        'user-agent': 'nothingleft',
        'x-github-api-version': '2022-11-28',
      };
      const [user, emails] = await Promise.all([
        readJson(fetchImpl, 'https://api.github.com/user', { headers }, GithubUser),
        readJson(fetchImpl, 'https://api.github.com/user/emails', { headers }, GithubEmails),
      ]);
      // `/user` returns whatever public email the user typed, verified or not; only the
      // primary address from `/user/emails` carries a trustworthy `verified` flag.
      const primary = emails.find(e => e.primary);
      return {
        provider: 'github',
        provider_id: String(user.id),
        email: primary?.email ?? '',
        email_verified: primary?.verified === true,
        name: user.name?.trim() || user.login,
        avatar_url: user.avatar_url,
      };
    },
  };
}

export function createOAuthClients(env: Env): OAuthClients {
  const clients: OAuthClients = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    clients.google = googleClient({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET });
  }
  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    clients.github = githubClient({ clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET });
  }
  return clients;
}

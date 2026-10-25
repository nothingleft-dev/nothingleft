import { createHmac } from 'node:crypto';
import { t } from '@nothingleft/i18n';
import {
  GIT_TOKEN_EXPIRY_WARNING_DAYS,
  type GitAuthKind,
  type GitConnectionHealth,
  type GitProviderKind,
} from '@nothingleft/types';
import type { GitConnectionRow } from '@nothingleft/db';
import { seal, unseal } from '@lib/crypto';
import { AppError } from '@lib/errors';
import { GitProviderError } from '@git/http';
import type { ConnectionAuth, GitProvider } from '@git/provider';
import type { ProviderRegistry } from '@git/providers/index';

const aad = (connectionId: number) => `git_connections:${connectionId}`;

/**
 * The token of the hook registered on one repository. A connection's hooks share its secret, so a
 * hook whose payload a project maintainer can template could otherwise speak for any repository.
 */
export function repositoryHookSecret(connectionSecret: string, providerRepoId: string): string {
  return createHmac('sha256', connectionSecret).update(`repository:${providerRepoId}`).digest('hex');
}

export interface HookParts {
  hook_id: string;
  secret: string;
}

export const sealToken = (master: Buffer, connectionId: number, token: string): string =>
  seal(master, 'git_connection', aad(connectionId), token);

export const sealHook = (master: Buffer, connectionId: number, hook: HookParts): string =>
  seal(master, 'git_hook', aad(connectionId), JSON.stringify(hook));

export function unsealHook(
  master: Buffer,
  row: Pick<GitConnectionRow, 'id' | 'hook_secret_ciphertext'>,
): HookParts | null {
  if (!row.hook_secret_ciphertext) return null;
  return JSON.parse(unseal(master, 'git_hook', aad(row.id), row.hook_secret_ciphertext)) as HookParts;
}

export function connectionAuth(master: Buffer, row: GitConnectionRow): ConnectionAuth {
  return {
    base_url: row.base_url,
    auth_kind: row.auth_kind as GitAuthKind,
    installation_id: row.installation_id,
    token: row.token_ciphertext ? unseal(master, 'git_connection', aad(row.id), row.token_ciphertext) : null,
  };
}

/** `github:acme-inc`, with `@host` when the connection is not on the provider's own host. */
export function connectionName(
  row: Pick<GitConnectionRow, 'provider' | 'account_login' | 'base_url'>,
  provider: Pick<GitProvider, 'defaultBaseUrl'> | undefined,
): string {
  const name = `${row.provider}:${row.account_login}`;
  if (!provider || row.base_url === provider.defaultBaseUrl) return name;
  return `${name}@${new URL(row.base_url).host}`;
}

export function webhookUrl(apiBaseUrl: string, kind: string, hookId: string): string {
  return `${apiBaseUrl.replace(/\/$/, '')}/v1/git/webhooks/${kind}/${hookId}`;
}

export function health(
  row: Pick<GitConnectionRow, 'status' | 'last_error' | 'token_expires_at' | 'revoked_at'>,
  now: Date,
): GitConnectionHealth {
  if (row.revoked_at) return row.last_error === 'uninstalled' ? 'removed_at_provider' : 'disconnected';
  if (row.status === 'suspended') return 'suspended';
  if (row.status === 'token_expired') return 'token_expired';
  if (row.status === 'failing') return 'failing';
  const warnFrom = now.getTime() + GIT_TOKEN_EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000;
  if (row.token_expires_at && row.token_expires_at.getTime() <= warnFrom) return 'expiring';
  return 'active';
}

export function providerLabel(kind: GitProviderKind | string): string {
  return kind === 'github' || kind === 'gitlab' ? t(`git.provider.${kind}.label`) : kind;
}

/** A provider call's failure, as the person who asked for it is told. */
export function providerFailure(error: unknown, kind: string): unknown {
  if (!(error instanceof GitProviderError)) return error;
  const provider = providerLabel(kind);
  if (error.reason === 'token_invalid' || error.reason === 'forbidden') {
    return new AppError('git.token_invalid', 422, { provider }, 'token');
  }
  if (error.reason === 'rate_limited') return new AppError('git.provider_rate_limited', 503, { provider });
  return new AppError('git.provider_unreachable', 502, { provider });
}

export function providerOf(providers: ProviderRegistry, kind: string): GitProvider {
  const provider = providers.get(kind as GitProviderKind);
  if (!provider) throw new AppError('git.provider_unknown', 404, { provider: kind }, 'provider');
  return provider;
}

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { GitProviderKind } from '@nothingleft/types';
import { repositoryHookSecret } from '@git/connection';

export interface GitFixture {
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** A recorded delivery: `test/fixtures/git/<provider>/<name>.json`, headers without the signature. */
export function gitFixture(provider: GitProviderKind, name: string): GitFixture {
  const file = new URL(`./fixtures/git/${provider}/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(file, 'utf8')) as GitFixture;
}

/** The delivery as the provider sends it: raw JSON plus the signature header its secret produces. */
export function signedDelivery(
  provider: GitProviderKind,
  fixture: GitFixture,
  secret: string,
  over: { delivery?: string; body?: Record<string, unknown>; registeredHook?: boolean } = {},
): { headers: Record<string, string>; payload: string } {
  const body = over.body ?? fixture.body;
  const payload = JSON.stringify(body);
  const headers: Record<string, string> = { ...fixture.headers, 'content-type': 'application/json' };
  if (provider === 'github') {
    if (over.delivery) headers['x-github-delivery'] = over.delivery;
    headers['x-hub-signature-256'] = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
  } else {
    if (over.delivery) headers['x-gitlab-event-uuid'] = over.delivery;
    // A hook the server registered sends its repository's own token, derived from the connection's.
    const project = (body['project'] as { id?: unknown } | undefined)?.id ?? body['project_id'];
    headers['x-gitlab-token'] = over.registeredHook ? repositoryHookSecret(secret, String(project)) : secret;
  }
  return { headers, payload };
}

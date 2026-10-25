import type { GitProviderKind } from '@nothingleft/types';
import type { GitProvider, ProviderDeps } from '@git/provider';
import { githubProvider, type GitHubAppConfig } from './github.ts';
import { gitlabProvider } from './gitlab.ts';

export type ProviderRegistry = ReadonlyMap<GitProviderKind, GitProvider>;

export function createProviders(deps: ProviderDeps & { githubApp: GitHubAppConfig | null }): ProviderRegistry {
  const providers: GitProvider[] = [githubProvider({ ...deps, app: deps.githubApp }), gitlabProvider(deps)];
  return new Map(providers.map(p => [p.kind, p]));
}

export type { GitHubAppConfig };

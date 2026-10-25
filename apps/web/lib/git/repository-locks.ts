import type { GitRepository } from '@nothingleft/types';

export interface RepositoryLocks {
  /** Why a Project Admin may not change it here; null when they may. */
  everyProject: string | null;
  branches: string | null;
}

// The API's git.repository_shared rule: every-project is an Org Admin's switch, and so are the
// merge branches of a repository another project uses too.
export function repositoryLocks(
  repository: Pick<GitRepository, 'projects' | 'match_all_projects'>,
  projectKey: string,
  orgAdmin: boolean,
): RepositoryLocks {
  if (orgAdmin) return { everyProject: null, branches: null };
  const shared = repository.match_all_projects || repository.projects.some(key => key !== projectKey);
  return {
    everyProject: 'Only an Org Admin can change this: it decides which projects’ issues the repository reaches.',
    branches: shared ? 'Only an Org Admin can change these: other projects use this repository too.' : null,
  };
}

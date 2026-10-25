import { describe, expect, test } from 'bun:test';
import { systemContext } from '../src/tenant-context.ts';
import { gitConnectionsRepository } from '../src/repositories/git-connections.repository.ts';
import { gitRepositoriesRepository } from '../src/repositories/git-repositories.repository.ts';
import { gitEntitiesRepository } from '../src/repositories/git-entities.repository.ts';
import { gitLinksRepository } from '../src/repositories/git-links.repository.ts';
import { gitIdentitiesRepository } from '../src/repositories/git-identities.repository.ts';
import type { Queryable } from '../src/client.ts';
import { failsInSavepoint, inRolledBackTx, seedIssueWorld } from './fixtures.ts';

const sys = systemContext('test');
const at = new Date('2026-10-25T10:00:00Z');

const commit = (sha: string) => ({
  sha,
  message_subject: `API-1 ${sha}`,
  message_full: null,
  author_name: 'Alex',
  author_email: 'alex@example.com',
  author_login: null,
  author_provider_id: null,
  author_user_id: null,
  committed_at: at,
  html_url: `https://github.com/acme/web/commit/${sha}`,
});

const pull = (number: number) => ({
  number,
  title: `API-1 #${number}`,
  state: 'open',
  head_ref: 'feat/api-1',
  head_sha: 'aaa',
  base_ref: 'main',
  html_url: `https://github.com/acme/web/pull/${number}`,
  provider_updated_at: at,
  opened_at: at,
  updated_at: at,
});

async function seed(tx: Queryable) {
  const world = await seedIssueWorld(tx);
  const conns = gitConnectionsRepository(tx);
  const repos = gitRepositoriesRepository(tx);
  const conn = (ctx: typeof world.ctxA, by: number) =>
    conns.insert(ctx, {
      provider: 'github',
      base_url: 'https://github.com',
      auth_kind: 'manual',
      account_login: 'acme',
      account_url: 'https://github.com/acme',
      created_by: by,
    });
  const repoRow = {
    provider_repo_id: '1',
    full_name: 'acme/web',
    html_url: 'x',
    default_branch: 'main',
    is_private: true,
    is_archived: false,
  };
  const [a] = await repos.upsertDiscovered(world.ctxA, (await conn(world.ctxA, world.alice)).id, [repoRow], at);
  const [b] = await repos.upsertDiscovered(world.ctxB, (await conn(world.ctxB, world.bob)).id, [repoRow], at);
  return { ...world, repoA: a!, repoB: b! };
}

describe('gitEntitiesRepository tenant isolation', () => {
  test('branches, commits, pull requests and checks never reach another organisation', async () => {
    await inRolledBackTx(async tx => {
      const e = gitEntitiesRepository(tx);
      const { ctxA, ctxB, repoA, repoB } = await seed(tx);
      const branch = await e.upsertBranch(ctxA, repoA.id, 'feat/api-1', 'aaa', at);
      expect(await e.findBranch(ctxB, repoA.id, 'feat/api-1')).toBeUndefined();
      expect(await e.deleteBranch(ctxB, repoA.id, 'feat/api-1', at)).toBeUndefined();
      expect(await e.branchesByIds(ctxB, [branch.id])).toEqual([]);

      const [c] = await e.upsertCommits(ctxA, repoA.id, [commit('aaa')]);
      expect(await e.commitsBySha(ctxB, repoA.id, ['aaa'])).toEqual([]);
      expect(await e.commitsByIds(ctxB, [c!.id])).toEqual([]);
      expect(await e.supersede(ctxB, repoA.id, ['aaa'], at)).toEqual([]);

      const pr = (await e.insertPullRequest(ctxA, repoA.id, pull(7)))!;
      expect(await e.findPullRequest(ctxB, repoA.id, 7)).toBeUndefined();
      expect(await e.updatePullRequest(ctxB, pr.id, { title: 'x' })).toBeUndefined();
      expect(await e.pullRequestsByIds(ctxB, [pr.id])).toEqual([]);
      expect(await e.pullRequestsByHead(ctxB, repoA.id, 'aaa')).toEqual([]);
      expect(await e.openPullRequests(ctxB, repoA.id)).toEqual([]);
      await e.setPullRequestCommits(ctxA, pr.id, [c!.id]);
      expect(await e.pullRequestCommits(ctxB, [pr.id])).toEqual([]);
      expect(await e.pullRequestCommits(ctxA, [pr.id])).toEqual([{ pull_request_id: pr.id, commit_id: c!.id }]);

      await e.upsertCheck(ctxA, repoA.id, {
        sha: 'aaa',
        external_id: '1',
        name: 'ci',
        status: 'completed',
        conclusion: 'success',
        updated_at: at,
      });
      expect(await e.checksFor(ctxB, repoA.id, 'aaa')).toEqual([]);
      expect((await e.checksFor(ctxA, repoA.id, 'aaa')).length).toBe(1);
      expect(await e.findPullRequest(ctxB, repoB.id, 7)).toBeUndefined();
    });
  });

  test('a row cannot be filed under another organisation’s repository', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, repoB } = await seed(tx);
      expect(
        await failsInSavepoint(tx, sp => gitEntitiesRepository(sp).upsertCommits(ctxA, repoB.id, [commit('b')])),
      ).toBe(true);
      expect(
        await failsInSavepoint(tx, sp => gitEntitiesRepository(sp).insertPullRequest(ctxA, repoB.id, pull(1))),
      ).toBe(true);
      expect(
        await failsInSavepoint(tx, sp => gitEntitiesRepository(sp).upsertBranch(ctxA, repoB.id, 'x', null, at)),
      ).toBe(true);
    });
  });

  test('a late check report never overwrites a newer one', async () => {
    await inRolledBackTx(async tx => {
      const e = gitEntitiesRepository(tx);
      const { ctxA, repoA } = await seed(tx);
      const later = new Date(at.getTime() + 60_000);
      await e.upsertCheck(ctxA, repoA.id, {
        sha: 's',
        external_id: '1',
        name: 'ci',
        status: 'completed',
        conclusion: 'failure',
        updated_at: later,
      });
      await e.upsertCheck(ctxA, repoA.id, {
        sha: 's',
        external_id: '1',
        name: 'ci',
        status: 'in_progress',
        conclusion: null,
        updated_at: at,
      });
      expect((await e.checksFor(ctxA, repoA.id, 's'))[0]).toMatchObject({ status: 'completed', conclusion: 'failure' });
    });
  });
});

describe('gitLinksRepository tenant isolation', () => {
  test('links and the issues they resolve stay in their organisation', async () => {
    await inRolledBackTx(async tx => {
      const links = gitLinksRepository(tx);
      const { ctxA, ctxB, issueA, issueB, projectA, projectB, repoA, alice } = await seed(tx);
      const link = (await links.insert(ctxA, {
        issue_id: issueA.id,
        repository_id: repoA.id,
        target_type: 'pull_request',
        target_id: 99,
        sources: ['pr_title'],
        intent: 'closes',
        created_by: null,
        at,
      }))!;
      expect(
        await links.insert(ctxA, {
          issue_id: issueA.id,
          repository_id: repoA.id,
          target_type: 'pull_request',
          target_id: 99,
          sources: ['manual'],
          intent: 'mention',
          created_by: null,
          at,
        }),
      ).toBeUndefined();
      expect(await links.forTarget(ctxB, { target_type: 'pull_request', target_id: 99 })).toEqual([]);
      expect(await links.forTargets(ctxB, 'pull_request', [99])).toEqual([]);
      expect(await links.findById(ctxB, link.id)).toBeUndefined();
      expect(await links.update(ctxB, link.id, { removed_at: at, updated_at: at })).toBeUndefined();
      expect(await links.liveForIssues(ctxB, [issueA.id])).toEqual([]);
      expect((await links.liveForIssues(ctxA, [issueA.id])).length).toBe(1);
      expect(await links.countLiveByIssue(ctxB, [issueA.id])).toEqual(new Map());

      expect(await links.issuesByNumbers(ctxB, [{ project_id: projectA, number: 1 }])).toEqual([]);
      expect((await links.issuesByNumbers(ctxB, [{ project_id: projectB, number: 1 }]))[0]?.id).toBe(issueB.id);
      expect(await links.issuesByIds(ctxB, [issueA.id])).toEqual([]);

      await gitRepositoriesRepository(tx).link(ctxA, projectA, repoA.id, alice, at);
      expect(await links.gitEnabledProjects(ctxA, [projectA, projectB])).toEqual(new Set([projectA]));
      expect(await links.gitEnabledProjects(ctxB, [projectA, projectB])).toEqual(new Set());

      expect(
        await failsInSavepoint(tx, sp =>
          gitLinksRepository(sp).insert(ctxB, {
            issue_id: issueA.id,
            repository_id: repoA.id,
            target_type: 'commit',
            target_id: 1,
            sources: ['commit_message'],
            intent: 'mention',
            created_by: null,
            at,
          }),
        ),
      ).toBe(true);
    });
  });
});

describe('attributing authors by identity', () => {
  test('rematch and unmatch touch only their own organisation, and only unattributed rows', async () => {
    await inRolledBackTx(async tx => {
      const e = gitEntitiesRepository(tx);
      const { ctxA, ctxB, repoA, repoB, alice, bob } = await seed(tx);
      const authored = { ...commit('c1'), author_login: 'Casey', author_email: 'casey@work.example' };
      await e.upsertCommits(ctxA, repoA.id, [authored]);
      await e.upsertCommits(ctxB, repoB.id, [authored]);
      await e.insertPullRequest(ctxA, repoA.id, { ...pull(3), author_login: 'casey' });
      const identity = { provider: 'github', base_url: 'https://github.com', login: 'casey', email: null };

      expect(await e.rematchAuthors(ctxA, alice, identity)).toBe(2);
      expect((await e.commitsBySha(ctxA, repoA.id, ['c1']))[0]!.author_user_id).toBe(alice);
      expect((await e.commitsBySha(ctxB, repoB.id, ['c1']))[0]!.author_user_id).toBeNull();
      // Another provider's login of the same name is someone else.
      expect(
        await e.rematchAuthors(ctxB, bob, { ...identity, provider: 'gitlab', base_url: 'https://gitlab.com' }),
      ).toBe(0);
      expect(await e.rematchAuthors(ctxA, bob, identity)).toBe(0);

      expect(await e.unmatchAuthors(ctxB, alice, identity)).toBe(0);
      expect(await e.unmatchAuthors(ctxA, alice, identity)).toBe(2);
      expect(await e.rematchAuthors(ctxA, bob, { ...identity, login: null, email: 'CASEY@work.example' })).toBe(1);
    });
  });
});

describe('gitIdentitiesRepository', () => {
  test("an organisation's admins see only their live members' identities", async () => {
    await inRolledBackTx(async tx => {
      const ids = gitIdentitiesRepository(tx);
      const { ctxA, ctxB, alice } = await seed(tx);
      const row = await ids.insert(sys, {
        user_id: alice,
        provider: 'github',
        base_url: 'https://github.com',
        email: 'alice@work.example',
        verified_by: 'email',
      });
      expect((await ids.listForOrg(ctxA)).map(r => r.id)).toEqual([row.id]);
      expect(await ids.listForOrg(ctxB)).toEqual([]);
      expect((await ids.findOwnEmail(sys, alice, 'ALICE@work.example'))?.id).toBe(row.id);
      expect((await ids.markVerified(sys, row.id, at))?.verified_at).toEqual(at);
      expect(await ids.markVerified(sys, row.id, at)).toBeUndefined();
      expect((await ids.findById(sys, row.id))?.user_id).toBe(alice);
    });
  });

  test('matches by provider id, login (any case) and verified email only', async () => {
    await inRolledBackTx(async tx => {
      const ids = gitIdentitiesRepository(tx);
      const { alice, bob } = await seed(tx);
      await ids.insert(sys, {
        user_id: alice,
        provider: 'github',
        base_url: 'https://github.com',
        provider_user_id: '9001',
        login: 'Alex-Lee',
        verified_by: 'provider',
      });
      await ids.insert(sys, {
        user_id: bob,
        provider: 'github',
        base_url: 'https://github.com',
        email: 'bob@work.example',
        verified_by: 'email',
      });
      expect((await ids.findByProviderUser(sys, 'github', 'https://github.com', '9001'))?.user_id).toBe(alice);
      expect((await ids.findByLogin(sys, 'github', 'https://github.com', 'alex-lee'))?.user_id).toBe(alice);
      expect(await ids.findByLogin(sys, 'gitlab', 'https://gitlab.com', 'alex-lee')).toBeUndefined();
      expect(await ids.findByEmail(sys, 'BOB@work.example')).toBeUndefined();
      expect((await ids.listForUser(sys, bob)).length).toBe(1);
      expect(await ids.removeAllForUser(sys, alice)).toBe(1);
      expect(await ids.findByProviderUser(sys, 'github', 'https://github.com', '9001')).toBeUndefined();
    });
  });
});

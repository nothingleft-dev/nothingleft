import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';
import { issuesRepository } from '../src/repositories/issues.repository.ts';
import { organizationsRepository } from '../src/repositories/organizations.repository.ts';
import { projectsRepository } from '../src/repositories/projects.repository.ts';
import { projectSchemaRepository } from '../src/repositories/project-schema.repository.ts';
import { usersRepository } from '../src/repositories/users.repository.ts';
import { schema } from '../src/index.ts';
import { inRolledBackTx, seedIssueWorld, sys } from './fixtures.ts';

describe('issuesRepository tenant isolation', () => {
  test("claimIssueNumber counts per project, without gaps, and only in the caller's organisation", async () => {
    await inRolledBackTx(async tx => {
      const projects = projectsRepository(tx);
      const { ctxA, ctxB, projectA } = await seedIssueWorld(tx);
      expect(await projects.claimIssueNumber(ctxA, projectA)).toBe(2);
      expect(await projects.claimIssueNumber(ctxA, projectA)).toBe(3);
      await expect(projects.claimIssueNumber(ctxB, projectA)).rejects.toThrow();
    });
  });

  test('findByNumber, lockById, keyNumbers and list are scoped to the organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const { ctxA, ctxB, projectA, issueA } = await seedIssueWorld(tx);
      expect((await repo.findByNumber(ctxA, projectA, 1))?.id).toBe(issueA.id);
      expect(await repo.findByNumber(ctxB, projectA, 1)).toBeUndefined();
      expect(await repo.lockById(ctxB, issueA.id)).toBeUndefined();
      expect((await repo.lockById(ctxA, issueA.id))?.id).toBe(issueA.id);
      expect(await repo.keyNumbers(ctxB, [issueA.id])).toEqual(new Map());
      expect(await repo.keyNumbers(ctxA, [issueA.id])).toEqual(new Map([[issueA.id, 1]]));
      expect((await repo.list(ctxB, { projectId: projectA, deleted: false, limit: 10, offset: 0 })).total).toBe(0);
      const listed = await repo.list(ctxA, { projectId: projectA, deleted: false, limit: 10, offset: 0 });
      expect(listed.rows.map(r => r.id)).toEqual([issueA.id]);
      expect('search_tsv' in listed.rows[0]!).toBe(false);
    });
  });

  test('findByIds answers in the order asked, skips unknown ids and never crosses organisations', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const projects = projectsRepository(tx);
      const { ctxA, ctxB, alice, projectA, issueA, issueB } = await seedIssueWorld(tx);
      const second = await repo.insert(ctxA, {
        project_id: projectA,
        key_number: await projects.claimIssueNumber(ctxA, projectA),
        title: 'Second',
        status_id: issueA.status_id,
        priority_id: issueA.priority_id,
        type_id: issueA.type_id,
        created_by: alice,
        updated_by: alice,
      });
      expect(await repo.findByIds(ctxA, [])).toEqual([]);
      const found = await repo.findByIds(ctxA, [second.id, issueB.id, issueA.id, 0]);
      expect(found.map(r => r.id)).toEqual([second.id, issueA.id]);
      expect('search_tsv' in found[0]!).toBe(false);
      expect(await repo.findByIds(ctxB, [issueA.id, second.id])).toEqual([]);
      expect((await repo.findByIds(ctxB, [issueB.id])).map(r => r.id)).toEqual([issueB.id]);
    });
  });

  test("insert files an issue under the caller's organisation, and never under another's project", async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const { ctxB, bob, projectA, issueA } = await seedIssueWorld(tx);
      const attempt = () =>
        repo.insert(ctxB, {
          project_id: projectA,
          key_number: 99,
          title: 'Filed under the wrong tenant',
          status_id: issueA.status_id,
          priority_id: issueA.priority_id,
          type_id: issueA.type_id,
          created_by: bob,
          updated_by: bob,
        });
      await expect(attempt()).rejects.toThrow();
    });
  });

  test('update cannot reach across organisations, and soft-deleted issues answer only on request', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const { ctxA, ctxB, projectA, issueA } = await seedIssueWorld(tx);
      expect(await repo.update(ctxB, issueA.id, { title: 'Hijacked' })).toBeUndefined();
      await repo.update(ctxA, issueA.id, { deleted_at: new Date() });
      expect(await repo.findByNumber(ctxA, projectA, 1)).toBeUndefined();
      expect((await repo.findByNumber(ctxA, projectA, 1, { includeDeleted: true }))?.id).toBe(issueA.id);
      expect((await repo.list(ctxA, { projectId: projectA, deleted: true, limit: 10, offset: 0 })).total).toBe(1);
    });
  });

  test('assignees are added, listed and removed within one organisation', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const { ctxA, ctxB, alice, bob, issueA } = await seedIssueWorld(tx);
      await repo.addAssignees(ctxA, issueA.id, [alice]);
      await repo.addAssignees(ctxA, issueA.id, [alice]);
      expect((await repo.listAssignees(ctxA, [issueA.id])).map(a => a.user_id)).toEqual([alice]);
      expect(await repo.listAssignees(ctxB, [issueA.id])).toEqual([]);
      await expect(repo.addAssignees(ctxB, issueA.id, [bob])).rejects.toThrow();
    });
  });

  test('removeAssignees in another organisation removes nothing', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      await repo.addAssignees(ctxA, issueA.id, [alice]);
      await repo.removeAssignees(ctxB, issueA.id, [alice]);
      expect((await repo.listAssignees(ctxA, [issueA.id])).length).toBe(1);
      await repo.removeAssignees(ctxA, issueA.id, [alice]);
      expect(await repo.listAssignees(ctxA, [issueA.id])).toEqual([]);
    });
  });

  test('findPeople resolves the username of this organisation only', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const { ctxA, ctxB, alice } = await seedIssueWorld(tx);
      const [inA] = await repo.findPeople(ctxA, [alice]);
      const [inB] = await repo.findPeople(ctxB, [alice]);
      expect(inA?.membership?.org_id).toBe(ctxA.orgId);
      expect(inB?.membership).toBeNull();
    });
  });

  test('stars, votes and watches are personal and organisation-scoped', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      await repo.star(ctxA, issueA.id, alice);
      await repo.vote(ctxA, issueA.id, alice);
      await repo.vote(ctxA, issueA.id, alice);
      await repo.watch(ctxA, issueA.id, [alice], 'auto');
      await repo.watch(ctxA, issueA.id, [alice], 'explicit');
      await repo.watch(ctxA, issueA.id, [alice], 'auto');

      expect((await repo.signalsFor(ctxA, [issueA.id], alice)).get(issueA.id)).toEqual({
        starred: true,
        voted: true,
        watching: true,
      });
      expect((await repo.signalsFor(ctxB, [issueA.id], alice)).get(issueA.id)).toEqual({
        starred: false,
        voted: false,
        watching: false,
      });
      const [row] = await tx.select().from(schema.issues).where(eq(schema.issues.id, issueA.id));
      expect(row?.vote_count).toBe(1);
      expect((await repo.listWatchers(ctxA, issueA.id)).map(w => w.source)).toEqual(['explicit']);
      expect(await repo.listWatchers(ctxB, issueA.id)).toEqual([]);
      expect(await repo.watcherCounts(ctxA, [issueA.id])).toEqual(new Map([[issueA.id, 1]]));
      expect(await repo.watcherCounts(ctxB, [issueA.id])).toEqual(new Map());
      expect((await repo.listVoters(ctxA, issueA.id)).map(v => v.user.id)).toEqual([alice]);
      expect(await repo.listVoters(ctxB, issueA.id)).toEqual([]);

      await repo.unstar(ctxB, issueA.id, alice);
      await repo.unvote(ctxB, issueA.id, alice);
      expect(await repo.unwatch(ctxB, issueA.id, alice)).toBeUndefined();
      expect((await repo.signalsFor(ctxA, [issueA.id], alice)).get(issueA.id)?.starred).toBe(true);

      await repo.unstar(ctxA, issueA.id, alice);
      await repo.unvote(ctxA, issueA.id, alice);
      await repo.unvote(ctxA, issueA.id, alice);
      expect((await repo.unwatch(ctxA, issueA.id, alice))?.user_id).toBe(alice);
      const [after] = await tx.select().from(schema.issues).where(eq(schema.issues.id, issueA.id));
      expect(after?.vote_count).toBe(0);
    });
  });

  test('mentions are replaced per source and never cross organisations', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const { ctxA, ctxB, alice, bob, issueA } = await seedIssueWorld(tx);
      const source = { type: 'issue' as const, id: issueA.id, issueId: issueA.id };
      await repo.replaceMentions(ctxA, source, [alice, alice]);
      expect(await repo.listMentionedUserIds(ctxA, source)).toEqual([alice]);
      expect(await repo.listMentionedUserIds(ctxB, source)).toEqual([]);
      await repo.replaceMentions(ctxB, source, []);
      expect(await repo.listMentionedUserIds(ctxA, source)).toEqual([alice]);
      await repo.replaceMentions(ctxA, source, [bob]);
      expect(await repo.listMentionedUserIds(ctxA, source)).toEqual([bob]);
      await expect(repo.replaceMentions(ctxB, source, [bob])).rejects.toThrow();
    });
  });

  test('the purge removes only the expired issues of the organisation it is given', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const { ctxA, ctxB, issueA, issueB } = await seedIssueWorld(tx);
      const old = new Date(Date.now() - 20 * 86_400_000);
      await repo.update(ctxA, issueA.id, { deleted_at: old });
      await repo.update(ctxB, issueB.id, { deleted_at: old });
      const cutoff = new Date(Date.now() - 14 * 86_400_000);

      expect(await repo.orgsWithDeletedBefore(sys, cutoff)).toEqual(expect.arrayContaining([ctxA.orgId, ctxB.orgId]));
      expect(await repo.idsDeletedBefore(ctxA, cutoff, 10)).toEqual([issueA.id]);
      expect(await repo.purgeDeletedBefore(ctxB, cutoff, [issueA.id])).toEqual([]);
      expect(await repo.purgeDeletedBefore(ctxA, cutoff, [issueA.id, issueB.id])).toEqual([issueA.id]);
      expect(await repo.lockById(ctxA, issueA.id)).toBeUndefined();
      expect((await repo.lockById(ctxB, issueB.id))?.id).toBe(issueB.id);
    });
  });

  test('the purge claims at most the batch, and spares a claimed issue restored since', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const { ctxA, alice, issueA } = await seedIssueWorld(tx);
      const second = await repo.insert(ctxA, {
        project_id: issueA.project_id,
        key_number: issueA.key_number + 1000,
        title: 'Second',
        status_id: issueA.status_id,
        priority_id: issueA.priority_id,
        type_id: issueA.type_id,
        created_by: alice,
        updated_by: alice,
      });
      const old = new Date(Date.now() - 20 * 86_400_000);
      await repo.update(ctxA, issueA.id, { deleted_at: old });
      await repo.update(ctxA, second.id, { deleted_at: old });
      const cutoff = new Date(Date.now() - 14 * 86_400_000);

      expect(await repo.idsDeletedBefore(ctxA, cutoff, 1)).toEqual([issueA.id]);
      const claimed = await repo.idsDeletedBefore(ctxA, cutoff, 10);
      expect(claimed).toEqual([issueA.id, second.id]);
      await repo.update(ctxA, second.id, { deleted_at: null });

      expect(await repo.purgeDeletedBefore(ctxA, cutoff, claimed)).toEqual([issueA.id]);
      expect((await repo.lockById(ctxA, second.id))?.id).toBe(second.id);
      expect(await repo.purgeDeletedBefore(ctxA, cutoff, [])).toEqual([]);
    });
  });
});

describe('projectsRepository.listAssignable', () => {
  test('project members plus org admins and the owner, live members only, one organisation', async () => {
    await inRolledBackTx(async tx => {
      const projects = projectsRepository(tx);
      const orgs = organizationsRepository(tx);
      const { ctxA, ctxB, alice, bob, projectA } = await seedIssueWorld(tx);
      const stamp = Date.now();
      const [member, admin, gone, bystander] = await Promise.all(
        ['m', 'a', 'g', 'b'].map(n => usersRepository(tx).create(sys, { email: `${n}-${stamp}@test.local`, name: n })),
      );
      await orgs.addMember(ctxA, { user_id: member!.id, username: `m-${stamp}`, role: 'member' });
      await orgs.addMember(ctxA, { user_id: admin!.id, username: `a-${stamp}`, role: 'org_admin' });
      await orgs.addMember(ctxA, { user_id: gone!.id, username: `g-${stamp}`, role: 'member' });
      await orgs.addMember(ctxA, { user_id: bystander!.id, username: `b-${stamp}`, role: 'member' });
      for (const u of [member!, gone!]) {
        await projects.addMember(ctxA, { project_id: projectA, user_id: u.id, role: 'contributor', created_by: alice });
      }
      await orgs.removeMember(ctxA, gone!.id);

      const ids = (await projects.listAssignable(ctxA, projectA)).map(r => r.user.id).sort();
      expect(ids).toEqual([alice, member!.id, admin!.id].sort());
      expect(
        (await projects.listAssignable(ctxA, projectA, { userIds: [bystander!.id, member!.id] })).map(r => r.user.id),
      ).toEqual([member!.id]);
      expect(await projects.listAssignable(ctxA, projectA, { userIds: [] })).toEqual([]);
      expect((await projects.listAssignable(ctxB, projectA)).map(r => r.user.id)).toEqual([bob]);
    });
  });
});

describe('organizationsRepository.findMembersByUsernames', () => {
  test('matches case-insensitively within the organisation only', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const { ctxA, ctxB, alice } = await seedIssueWorld(tx);
      const username = (await orgs.findMembership(ctxA, alice))!.username;
      expect((await orgs.findMembersByUsernames(ctxA, [username.toUpperCase(), 'nobody'])).map(m => m.user.id)).toEqual(
        [alice],
      );
      expect(await orgs.findMembersByUsernames(ctxB, [username])).toEqual([]);
      expect(await orgs.findMembersByUsernames(ctxA, [])).toEqual([]);
    });
  });

  test('includeRemoved finds former members, still only within the organisation', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const { ctxA, ctxB } = await seedIssueWorld(tx);
      const gone = await usersRepository(tx).create(sys, { email: `gone-${Date.now()}@test.local`, name: 'Gone' });
      const username = `gone-${Date.now()}`;
      await orgs.addMember(ctxA, { user_id: gone.id, username, role: 'member' });
      await orgs.removeMember(ctxA, gone.id);
      expect(await orgs.findMembersByUsernames(ctxA, [username])).toEqual([]);
      expect(
        (await orgs.findMembersByUsernames(ctxA, [username], { includeRemoved: true })).map(m => m.user.id),
      ).toEqual([gone.id]);
      expect(await orgs.findMembersByUsernames(ctxB, [username], { includeRemoved: true })).toEqual([]);
    });
  });
});

describe('issuesRepository removal counts', () => {
  test('assigned, open and created counts stay in one organisation and skip trashed issues', async () => {
    await inRolledBackTx(async tx => {
      const repo = issuesRepository(tx);
      const projects = projectsRepository(tx);
      const configs = projectSchemaRepository(tx);
      const { ctxA, ctxB, alice, issueA, issueB, projectA } = await seedIssueWorld(tx);
      const done = (await configs.list(ctxA, 'statuses', projectA)).find(s => s.category === 'done')!;
      const resolved = await repo.insert(ctxA, {
        project_id: projectA,
        key_number: await projects.claimIssueNumber(ctxA, projectA),
        title: 'Fixed',
        status_id: done.id,
        priority_id: issueA.priority_id,
        type_id: issueA.type_id,
        created_by: alice,
        updated_by: alice,
      });
      const trashed = await repo.insert(ctxA, {
        project_id: projectA,
        key_number: await projects.claimIssueNumber(ctxA, projectA),
        title: 'Trashed',
        status_id: issueA.status_id,
        priority_id: issueA.priority_id,
        type_id: issueA.type_id,
        created_by: alice,
        updated_by: alice,
        deleted_at: new Date(),
      });
      for (const issue of [issueA, resolved, trashed]) await repo.addAssignees(ctxA, issue.id, [alice]);

      expect(await repo.countAssignedTo(ctxA, alice)).toEqual({ open: 1, resolved: 1 });
      expect(await repo.listOpenAssignedTo(ctxA, alice)).toEqual([{ id: issueA.id, project_id: projectA }]);
      expect(await repo.countCreatedBy(ctxA, alice)).toBe(2);

      expect(await repo.countAssignedTo(ctxB, alice)).toEqual({ open: 0, resolved: 0 });
      expect(await repo.listOpenAssignedTo(ctxB, alice)).toEqual([]);
      expect(await repo.countCreatedBy(ctxB, alice)).toBe(0);
      void issueB;
    });
  });
});

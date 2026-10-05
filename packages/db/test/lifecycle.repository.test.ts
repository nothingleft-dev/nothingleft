import { describe, expect, test } from 'bun:test';
import { count, eq } from 'drizzle-orm';
import { attachmentsRepository } from '../src/repositories/attachments.repository.ts';
import { commentsRepository } from '../src/repositories/comments.repository.ts';
import { oneTimeTokensRepository } from '../src/repositories/one-time-tokens.repository.ts';
import { organizationPurgeRepository } from '../src/repositories/organization-purge.repository.ts';
import { organizationsRepository } from '../src/repositories/organizations.repository.ts';
import { orgActivityRepository } from '../src/repositories/org-activity.repository.ts';
import {
  personalAccessTokensRepository,
  type TokenProjectRef,
} from '../src/repositories/personal-access-tokens.repository.ts';
import { projectsRepository } from '../src/repositories/projects.repository.ts';
import { sessionsRepository } from '../src/repositories/sessions.repository.ts';
import { tagsRepository } from '../src/repositories/tags.repository.ts';
import { totpRecoveryCodesRepository } from '../src/repositories/totp-recovery-codes.repository.ts';
import { usersRepository } from '../src/repositories/users.repository.ts';
import * as schema from '../src/schema/index.ts';
import { inRolledBackTx, seedIssueWorld, seedTwoOrgs, sys } from './fixtures.ts';

const hash = (seed: string) => new Bun.CryptoHasher('sha256').update(seed).digest() as Buffer;
const DAY = 86_400_000;

describe('totpRecoveryCodesRepository', () => {
  test('a code is spent once, and only by its own account', async () => {
    await inRolledBackTx(async tx => {
      const codes = totpRecoveryCodesRepository(tx);
      const { alice, bob } = await seedTwoOrgs(tx);
      await codes.replace(sys, alice, [hash('one'), hash('two')]);
      await codes.replace(sys, bob, [hash('one')]);

      expect(await codes.consume(sys, bob, hash('two'))).toBeUndefined();
      expect((await codes.consume(sys, alice, hash('one')))?.user_id).toBe(alice);
      expect(await codes.consume(sys, alice, hash('one'))).toBeUndefined();
      expect(await codes.countUnused(sys, alice)).toBe(1);
      expect(await codes.countUnused(sys, bob)).toBe(1);
    });
  });

  test('replacing keeps the spent codes as a record and drops the unused ones', async () => {
    await inRolledBackTx(async tx => {
      const codes = totpRecoveryCodesRepository(tx);
      const { alice } = await seedTwoOrgs(tx);
      await codes.replace(sys, alice, [hash('a'), hash('b')]);
      await codes.consume(sys, alice, hash('a'));
      await codes.replace(sys, alice, [hash('c')]);

      const rows = await tx
        .select()
        .from(schema.totp_recovery_codes)
        .where(eq(schema.totp_recovery_codes.user_id, alice));
      expect(rows.map(r => r.used_at !== null).sort()).toEqual([false, true]);
      expect(await codes.consume(sys, alice, hash('b'))).toBeUndefined();
    });
  });
});

describe('usersRepository.claimTotpStep', () => {
  test('a step is accepted once and never after a later one', async () => {
    await inRolledBackTx(async tx => {
      const users = usersRepository(tx);
      const { alice, bob } = await seedTwoOrgs(tx);
      expect(await users.claimTotpStep(sys, alice, 100)).toBe(true);
      expect(await users.claimTotpStep(sys, alice, 100)).toBe(false);
      expect(await users.claimTotpStep(sys, alice, 99)).toBe(false);
      expect(await users.claimTotpStep(sys, bob, 100)).toBe(true);
      expect(await users.claimTotpStep(sys, alice, 101)).toBe(true);
    });
  });
});

describe('organisation deletion tenant isolation', () => {
  test('scheduling, reminding and stamping touch only the organisation named', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const { ctxA, ctxB, orgA, orgB } = await seedTwoOrgs(tx);
      const at = new Date(Date.now() - 20 * DAY);

      expect((await orgs.scheduleDeletion(ctxA, at))?.id).toBe(orgA);
      expect(await orgs.scheduleDeletion(ctxA, at)).toBeUndefined();
      expect((await orgs.findById(ctxB))?.deletion_scheduled_at).toBeNull();

      const due = (await orgs.listDeletionReminderDue(sys, new Date())).map(o => o.id);
      expect(due).toContain(orgA);
      expect(due).not.toContain(orgB);
      expect(await orgs.markDeletionReminded(ctxB, new Date())).toBe(false);
      expect(await orgs.markDeletionReminded(ctxA, new Date())).toBe(true);
      expect(await orgs.markDeletionReminded(ctxA, new Date())).toBe(false);

      const cutoff = new Date(Date.now() - 14 * DAY);
      expect((await orgs.listDeletionDue(sys, cutoff)).map(o => o.id)).toContain(orgA);
      expect(await orgs.markDeleted(ctxB, cutoff, new Date())).toBeUndefined();
      expect((await orgs.markDeleted(ctxA, cutoff, new Date()))?.id).toBe(orgA);
      expect(await orgs.findById(ctxA)).toBeUndefined();
      expect(await orgs.findById(ctxB)).toBeDefined();
      // Stamped with members left: still due, so an interrupted purge resumes.
      expect((await orgs.listDeletionDue(sys, cutoff)).map(o => o.id)).toContain(orgA);
    });
  });

  test('cancelling clears the request and its reminder, and only where one stands', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const { ctxA, ctxB } = await seedTwoOrgs(tx);
      await orgs.scheduleDeletion(ctxA, new Date());
      await orgs.markDeletionReminded(ctxA, new Date());

      expect(await orgs.cancelDeletion(ctxB)).toBeUndefined();
      const cancelled = await orgs.cancelDeletion(ctxA);
      expect(cancelled?.deletion_scheduled_at).toBeNull();
      expect(cancelled?.deletion_reminder_sent_at).toBeNull();
    });
  });

  test('purging empties one organisation and keeps its row and audit log', async () => {
    await inRolledBackTx(async tx => {
      const world = await seedIssueWorld(tx);
      const { ctxA, ctxB, alice, orgA, issueA } = world;
      await commentsRepository(tx).insert(ctxA, {
        issue_id: issueA.id,
        body_md: 'Seen on Safari',
        author_id: alice,
        created_at: new Date(),
      });
      await tagsRepository(tx).insertMissing(ctxA, [
        { name: 'Checkout', slug: 'checkout', color: 'gray-2', created_by: alice },
      ]);
      await orgActivityRepository(tx).record(ctxA, {
        actor_id: alice,
        kind: 'deletion_scheduled',
        target_type: 'organization',
        target_id: String(orgA),
      });

      const counts = await organizationPurgeRepository(tx).purgeContents(ctxA);
      expect(counts).toEqual({ projects: 1, issues: 1 });

      for (const table of Object.values(schema)) {
        if (typeof table !== 'object' || table === null || !('org_id' in table)) continue;
        if (table === schema.org_activity) continue;
        const column = (table as typeof schema.issues).org_id;
        const [left] = await tx
          .select({ n: count() })
          .from(table as typeof schema.issues)
          .where(eq(column, orgA));
        expect(left?.n).toBe(0);
      }
      const [audit] = await tx
        .select({ n: count() })
        .from(schema.org_activity)
        .where(eq(schema.org_activity.org_id, orgA));
      expect(audit?.n).toBe(1);
      expect(await tx.query.organizations.findFirst({ where: eq(schema.organizations.id, orgA) })).toBeDefined();
      expect(await projectsRepository(tx).listIds(ctxB)).toHaveLength(1);
    });
  });

  test('attachments listed for deletion are the organisation’s own', async () => {
    await inRolledBackTx(async tx => {
      const { ctxA, ctxB, alice, issueA } = await seedIssueWorld(tx);
      const repo = attachmentsRepository(tx);
      await repo.insert(ctxA, {
        public_id: crypto.randomUUID(),
        issue_id: issueA.id,
        filename: 'trace.log',
        mime_type: 'text/plain',
        size_bytes: 10,
        checksum: Buffer.alloc(32),
        storage_target: 'platform',
        bucket: 'nl-private',
        object_key: 'api/x',
        created_by: alice,
      });
      expect(await repo.listForOrg(ctxA, 10)).toHaveLength(1);
      expect(await repo.listForOrg(ctxB, 10)).toHaveLength(0);
    });
  });
});

describe('credentials a deleted organisation or a deactivated account leaves behind', () => {
  test('sessions forget only the organisation being deleted', async () => {
    await inRolledBackTx(async tx => {
      const sessions = sessionsRepository(tx);
      const { alice, bob, orgA, orgB, ctxA } = await seedTwoOrgs(tx);
      const expires_at = new Date(Date.now() + DAY);
      const a = await sessions.create(sys, {
        token_hash: hash(`a${Date.now()}`),
        user_id: alice,
        current_org_id: orgA,
        expires_at,
      });
      const b = await sessions.create(sys, {
        token_hash: hash(`b${Date.now()}`),
        user_id: bob,
        current_org_id: orgB,
        expires_at,
      });

      expect((await sessions.clearCurrentOrg(ctxA)).map(r => r.id)).toEqual([a.id]);
      expect((await sessions.findForUser(sys, bob, b.id))?.current_org_id).toBe(orgB);
    });
  });

  test('tokens confined to the deleted projects are revoked; unrestricted and other ones stay', async () => {
    await inRolledBackTx(async tx => {
      const tokens = personalAccessTokensRepository(tx);
      const { alice, bob, orgA, orgB, projectA, projectB } = await seedIssueWorld(tx);
      const make = async (user_id: number, projects: TokenProjectRef[] | null) => {
        const row = await tokens.create(sys, {
          user_id,
          name: 'CI',
          token_hash: hash(`${user_id}-${Math.random()}`),
          token_prefix: 'nl_pat_x',
          scopes: ['issues:read'],
          restricted: projects !== null,
        });
        await tokens.addProjects(sys, row.id, projects ?? []);
        return row;
      };
      const inA = { project_id: projectA, org_id: orgA };
      const inB = { project_id: projectB, org_id: orgB };
      const confined = await make(alice, [inA]);
      const mixed = await make(alice, [inA, inB]);
      const open = await make(bob, null);

      expect((await tokens.revokeConfinedTo(sys, [projectA])).map(t => t.id)).toEqual([confined.id]);
      const live = (await tokens.listForUser(sys, alice)).filter(t => !t.revoked_at).map(t => t.id);
      expect(live).toEqual([mixed.id]);
      expect((await tokens.revokeAllForUser(sys, bob)).map(t => t.id)).toEqual([open.id]);
    });
  });

  test('ownership transfers are found and dropped per organisation', async () => {
    await inRolledBackTx(async tx => {
      const tokens = oneTimeTokensRepository(tx);
      const { alice, bob, orgA, orgB, ctxA, ctxB } = await seedTwoOrgs(tx);
      const expires_at = new Date(Date.now() + DAY);
      await tokens.create(sys, {
        user_id: bob,
        purpose: 'ownership_transfer',
        token_hash: hash(`t${Math.random()}`),
        org_id: orgA,
        created_by: alice,
        expires_at,
      });
      await tokens.create(sys, {
        user_id: alice,
        purpose: 'ownership_transfer',
        token_hash: hash(`t${Math.random()}`),
        org_id: orgB,
        created_by: bob,
        expires_at,
      });

      expect((await tokens.findLiveTransfer(ctxA))?.org_id).toBe(orgA);
      expect(await tokens.deleteTransfers(ctxA)).toHaveLength(1);
      expect(await tokens.findLiveTransfer(ctxA)).toBeUndefined();
      expect((await tokens.findLiveTransfer(ctxB))?.org_id).toBe(orgB);
      // The transfer bob offered and the one addressed to nobody else go with his account.
      expect((await tokens.deleteAllInvolving(sys, bob)).map(t => t.org_id)).toEqual([orgB]);
    });
  });

  test('a deleted organisation keeps its slug taken', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const { ctxA } = await seedTwoOrgs(tx);
      const slug = (await orgs.findById(ctxA))!.slug;
      await orgs.scheduleDeletion(ctxA, new Date(Date.now() - 15 * DAY));
      await orgs.markDeleted(ctxA, new Date(), new Date());
      expect(await orgs.findBySlug(sys, slug)).toBeUndefined();
      expect(await orgs.slugTaken(sys, slug)).toBe(true);
      expect(await orgs.slugTaken(sys, `${slug}-free`)).toBe(false);
    });
  });

  test('an owner is found only for organisations not yet deleted', async () => {
    await inRolledBackTx(async tx => {
      const orgs = organizationsRepository(tx);
      const { alice, orgA, ctxA } = await seedTwoOrgs(tx);
      expect((await orgs.listOwnedBy(sys, alice)).map(o => o.id)).toEqual([orgA]);
      await orgs.scheduleDeletion(ctxA, new Date(Date.now() - 15 * DAY));
      await orgs.markDeleted(ctxA, new Date(), new Date());
      expect(await orgs.listOwnedBy(sys, alice)).toEqual([]);
    });
  });
});

import { describe, expect, test } from 'bun:test';
import { userPreferencesRepository } from '../src/repositories/user-preferences.repository.ts';
import { schema } from '../src/index.ts';
import { inRolledBackTx, seedTwoOrgs, sys } from './fixtures.ts';

describe('userPreferencesRepository', () => {
  test('a row is created per user and never read across users', async () => {
    await inRolledBackTx(async tx => {
      const repo = userPreferencesRepository(tx);
      const { alice, bob } = await seedTwoOrgs(tx);

      await repo.create(sys, alice);
      expect((await repo.findForUser(sys, alice))?.preferences.theme).toBe('system');
      expect(await repo.findForUser(sys, bob)).toBeUndefined();
    });
  });

  test('last_project_id is exposed as the project key, which is what a client routes on', async () => {
    await inRolledBackTx(async tx => {
      const repo = userPreferencesRepository(tx);
      const { alice, orgA } = await seedTwoOrgs(tx);
      await repo.create(sys, alice);

      const [project] = await tx
        .insert(schema.projects)
        .values({
          org_id: orgA,
          key: 'PP',
          name: 'Partner Portal',
          slug: 'partner-portal',
          avatar_color: 'amber',
          avatar_initials: 'PP',
          created_by: alice,
        })
        .returning();

      await repo.update(sys, alice, { last_project_id: project!.id });
      const stored = await repo.findForUser(sys, alice);
      expect(stored?.last_project_key).toBe('PP');
      expect(stored?.preferences.last_project_id).toBe(project!.id);
    });
  });

  test('update changes only the named user', async () => {
    await inRolledBackTx(async tx => {
      const repo = userPreferencesRepository(tx);
      const { alice, bob } = await seedTwoOrgs(tx);
      await repo.create(sys, alice);
      await repo.create(sys, bob);

      await repo.update(sys, alice, { theme: 'dark' });
      expect((await repo.findForUser(sys, alice))?.preferences.theme).toBe('dark');
      expect((await repo.findForUser(sys, bob))?.preferences.theme).toBe('system');
      expect(await repo.update(sys, -1, { theme: 'light' })).toBeUndefined();
    });
  });
});

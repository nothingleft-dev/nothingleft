import { createDb, type Db } from '../src/client.ts';
import { systemContext, tenantContext, type TenantContext } from '../src/tenant-context.ts';
import { organizationsRepository } from '../src/repositories/organizations.repository.ts';
import { usersRepository } from '../src/repositories/users.repository.ts';
import { projectsRepository } from '../src/repositories/projects.repository.ts';
import { projectSchemaRepository } from '../src/repositories/project-schema.repository.ts';
import { issuesRepository } from '../src/repositories/issues.repository.ts';
import { articlesRepository, type NewArticle } from '../src/repositories/articles.repository.ts';
import { organizations, users, type ArticleRow, type IssueRow } from '../src/schema/index.ts';
import { inArray } from 'drizzle-orm';
import { slugify } from '@nothingleft/format';
import type { Queryable } from '../src/client.ts';
import type { Pool } from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('db tests need DATABASE_URL — run `bun run test` so apps/api/.env is loaded');

export const sys = systemContext('test seed');

// One pool for the whole run: a fresh pool per test spends more time on the TLS
// handshake to Neon than on the queries under test.
let shared: { db: Db; pool: Pool } | undefined;

export function testDb(): { db: Db; pool: Pool } {
  shared ??= createDb(url!, { max: 4, allowExitOnIdle: true });
  return shared;
}

/**
 * Runs the body inside a transaction that is always rolled back, so a repository test
 * can seed two organisations without leaving anything behind.
 */
export async function inRolledBackTx(body: (tx: Queryable) => Promise<void>): Promise<void> {
  await testDb()
    .db.transaction(async tx => {
      await body(tx);
      tx.rollback();
    })
    .catch((err: unknown) => {
      // tx.rollback() throws TransactionRollbackError by design; anything else is real.
      if (!(err instanceof Error && err.constructor.name === 'TransactionRollbackError')) throw err;
    });
}

/** A statement expected to fail runs in a savepoint, so the surrounding test transaction survives it. */
export async function failsInSavepoint(tx: Queryable, body: (sp: Queryable) => Promise<unknown>): Promise<boolean> {
  try {
    await tx.transaction(async sp => {
      await body(sp);
    });
    return false;
  } catch {
    return true;
  }
}

export interface PgViolation {
  code: string;
  constraint: string | undefined;
}

/** The PostgreSQL error under Drizzle's wrapper: its SQLSTATE and the constraint that refused the row. */
export function pgViolation(err: unknown): PgViolation | undefined {
  for (
    let e = err as { code?: unknown; constraint?: unknown; cause?: unknown } | undefined;
    e;
    e = e.cause as typeof e
  ) {
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
      return { code: e.code, constraint: typeof e.constraint === 'string' ? e.constraint : undefined };
    }
  }
  return undefined;
}

/** As failsInSavepoint, naming what refused the statement; undefined when it succeeded. */
export async function violationInSavepoint(
  tx: Queryable,
  body: (sp: Queryable) => Promise<unknown>,
): Promise<PgViolation | undefined> {
  try {
    await tx.transaction(async sp => {
      await body(sp);
    });
    return undefined;
  } catch (err) {
    const violation = pgViolation(err);
    if (!violation) throw err;
    return violation;
  }
}

export interface TwoOrgs {
  alice: number;
  bob: number;
  orgA: number;
  orgB: number;
  ctxA: TenantContext;
  ctxB: TenantContext;
}

export async function seedTwoOrgs(tx: Queryable): Promise<TwoOrgs> {
  const users = usersRepository(tx);
  const orgs = organizationsRepository(tx);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const [alice, bob] = await Promise.all([
    users.create(sys, { email: `alice-${stamp}@test.local`, name: 'Alice' }),
    users.create(sys, { email: `bob-${stamp}@test.local`, name: 'Bob' }),
  ]);
  const [orgA, orgB] = await Promise.all([
    orgs.create(sys, { name: 'A', slug: `a-${stamp}`, owner_user_id: alice.id }),
    orgs.create(sys, { name: 'B', slug: `b-${stamp}`, owner_user_id: bob.id }),
  ]);
  const ctxA = tenantContext(orgA.id, alice.id);
  const ctxB = tenantContext(orgB.id, bob.id);
  await Promise.all([
    orgs.addMember(ctxA, { user_id: alice.id, username: `alice-${stamp}`, role: 'org_admin' }),
    orgs.addMember(ctxB, { user_id: bob.id, username: `bob-${stamp}`, role: 'org_admin' }),
  ]);

  return { alice: alice.id, bob: bob.id, orgA: orgA.id, orgB: orgB.id, ctxA, ctxB };
}

export interface IssueWorld extends TwoOrgs {
  projectA: number;
  projectB: number;
  issueA: IssueRow;
  issueB: IssueRow;
}

/** Two organisations, each with a seeded project keyed `AC` and one issue, AC-1. */
export async function seedIssueWorld(tx: Queryable): Promise<IssueWorld> {
  const orgs = await seedTwoOrgs(tx);
  const projects = projectsRepository(tx);
  const configs = projectSchemaRepository(tx);
  const issues = issuesRepository(tx);

  const issueIn = async (ctx: TenantContext, userId: number) => {
    const project = await projects.create(ctx, {
      key: 'AC',
      name: 'Acme',
      slug: 'acme',
      avatar_color: 'amber',
      avatar_initials: 'AC',
      created_by: userId,
    });
    await configs.seed(ctx, project.id);
    const [status] = await configs.list(ctx, 'statuses', project.id);
    const [priority] = await configs.list(ctx, 'priorities', project.id);
    const [type] = await configs.list(ctx, 'types', project.id);
    const issue = await issues.insert(ctx, {
      project_id: project.id,
      key_number: await projects.claimIssueNumber(ctx, project.id),
      title: 'Login redirect loops',
      status_id: status!.id,
      priority_id: priority!.id,
      type_id: type!.id,
      created_by: userId,
      updated_by: userId,
    });
    return { project: project.id, issue };
  };

  const a = await issueIn(orgs.ctxA, orgs.alice);
  const b = await issueIn(orgs.ctxB, orgs.bob);
  return { ...orgs, projectA: a.project, projectB: b.project, issueA: a.issue, issueB: b.issue };
}

/** Committed, for a test that needs two connections to see the same rows; names are unique per run. */
export async function seedCommittedIssueWorld(): Promise<IssueWorld> {
  return testDb().db.transaction(tx => seedIssueWorld(tx));
}

export async function dropCommittedIssueWorld(world: IssueWorld): Promise<void> {
  await testDb().db.transaction(async tx => {
    await tx.delete(organizations).where(inArray(organizations.id, [world.orgA, world.orgB]));
    await tx.delete(users).where(inArray(users.id, [world.alice, world.bob]));
  });
}

export async function insertArticle(
  tx: Queryable,
  ctx: TenantContext,
  over: Partial<NewArticle> & Pick<NewArticle, 'project_id' | 'created_by' | 'title'>,
): Promise<ArticleRow> {
  return articlesRepository(tx).insert(ctx, {
    parent_id: null,
    slug: slugify(over.title),
    body_md: '',
    status: 'published',
    position: 0,
    published_at: null,
    created_at: new Date(),
    ...over,
  });
}

/** A second seeded project, keyed `AD`, in the given organisation. */
export async function seedSiblingProject(tx: Queryable, ctx: TenantContext, userId: number): Promise<number> {
  const project = await projectsRepository(tx).create(ctx, {
    key: 'AD',
    name: 'Adjacent',
    slug: 'adjacent',
    avatar_color: 'amber',
    avatar_initials: 'AD',
    created_by: userId,
  });
  await projectSchemaRepository(tx).seed(ctx, project.id);
  return project.id;
}

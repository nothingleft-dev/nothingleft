import {
  createDb,
  issuesRepository,
  organizationsRepository,
  projectsRepository,
  systemContext,
  tenantContext,
  type TenantContext,
} from '@nothingleft/db';
import type { BuildOptions } from '../src/app.ts';
import type { Env } from '@config/env';
import { testApp, testEnv } from './helpers.ts';
import { mailbox, signUp, uniqueStamp, type Person } from './people.ts';

export type App = Awaited<ReturnType<typeof testApp>>;
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Response = Awaited<ReturnType<App['inject']>>;

export interface Member extends Person {
  username: string;
}

export interface IssueWorld {
  app: App;
  key: string;
  slug: string;
  admin: Member;
  /** A Project Admin of `key` and a plain member of the organisation. */
  projectAdmin: Member;
  contributor: Member;
  observer: Member;
  outsider: Member;
  call: (
    who: Person,
    method: Method,
    url: string,
    body?: object,
    headers?: Record<string, string>,
  ) => Promise<Response>;
  /** Repository access for what no route exposes: mention rows, backdating a deletion. */
  repos: { ctx: TenantContext; projectId: number; issueId: (n: number) => Promise<number> } & {
    issues: ReturnType<typeof issuesRepository>;
  };
  box: ReturnType<typeof mailbox>;
  db: ReturnType<typeof createDb>['db'];
  close: () => Promise<void>;
}

/** An organisation with project `key`, an owner, a contributor, an observer, and a stranger elsewhere. */
export async function issueWorld(key: string, opts: BuildOptions = {}, env: Env = testEnv): Promise<IssueWorld> {
  const box = mailbox();
  const app = await testApp({ mailer: box.mailer, ...opts }, env);
  const slug = `iss-${uniqueStamp()}`;
  const call: IssueWorld['call'] = (who, method, url, body, headers = {}) =>
    app.inject({ method, url, headers: { ...who.headers, ...headers }, ...(body ? { body } : {}) });

  const [admin, projectAdmin, contributor, observer, outsider] = await Promise.all([
    signUp(app, box, 'Alex'),
    signUp(app, box, 'Sam'),
    signUp(app, box, 'Casey'),
    signUp(app, box, 'Oli'),
    signUp(app, box, 'Stranger'),
  ]);
  await call(admin, 'POST', '/v1/organizations', { name: 'Acme', slug });
  await call(outsider, 'POST', '/v1/organizations', { name: 'Elsewhere', slug: `${slug}-x` });
  const link = (await call(admin, 'POST', `/v1/organizations/${slug}/invitations/links`, {})).json().data;
  const token = /\/invite\/(.+)$/.exec(link.url)![1];
  const username = async (who: Person) =>
    (await call(who, 'GET', `/v1/organizations/${slug}`)).json().data.membership.username as string;

  for (const who of [projectAdmin, contributor, observer]) await call(who, 'POST', '/v1/invitations/accept', { token });
  const created = await call(admin, 'POST', '/v1/projects', { name: 'Acme Web', key });
  if (created.statusCode !== 201) throw new Error(`project create failed: ${created.body}`);

  const members = {
    admin: { ...admin, username: await username(admin) },
    projectAdmin: { ...projectAdmin, username: await username(projectAdmin) },
    contributor: { ...contributor, username: await username(contributor) },
    observer: { ...observer, username: await username(observer) },
    outsider: { ...outsider, username: '' },
  };
  await call(admin, 'POST', `/v1/projects/${key}/members`, {
    username: members.contributor.username,
    role: 'contributor',
  });
  await call(admin, 'POST', `/v1/projects/${key}/members`, { username: members.observer.username, role: 'observer' });
  await call(admin, 'POST', `/v1/projects/${key}/members`, {
    username: members.projectAdmin.username,
    role: 'project_admin',
  });

  const { db, pool } = createDb(testEnv.DATABASE_URL, { max: 2, allowExitOnIdle: true });
  const organization = await organizationsRepository(db).findBySlug(systemContext('test lookup'), slug);
  const ctx = tenantContext(organization!.id);
  const project = await projectsRepository(db).findByKey(ctx, key);
  const issues = issuesRepository(db);

  return {
    app,
    key,
    slug,
    ...members,
    call,
    repos: {
      ctx,
      projectId: project!.id,
      issues,
      issueId: async n => (await issues.findByNumber(ctx, project!.id, n, { includeDeleted: true }))!.id,
    },
    box,
    db,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}

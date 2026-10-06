import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  attachmentsRepository,
  oneTimeTokensRepository,
  organizationsRepository,
  orgStorageLocationsRepository,
  systemContext,
} from '@nothingleft/db';
import type { Storage } from '@lib/storage';
import { queuedBehind } from './held-transaction.ts';
import { issueWorld, type IssueWorld } from './issue-world.ts';
import { memoryStorage } from './memory-storage.ts';
import { password, type Person } from './people.ts';

const DAY = 86_400_000;
const later = (days: number) => new Date(Date.now() + days * DAY);

const transferToken = (w: IssueWorld, to: string) =>
  /\/transfer\/(.+)$/.exec(
    String(w.box.sent.findLast(m => m.to === to && m.subject === 'email.ownership_offered.subject')?.params?.['url']),
  )?.[1] ?? '';

async function promote(w: IssueWorld, username: string) {
  const res = await w.call(w.admin, 'PATCH', `/v1/organizations/${w.slug}/members/${username}`, {
    org_role: 'org_admin',
  });
  if (res.statusCode !== 200) throw new Error(res.body);
}

async function patFor(w: IssueWorld, who: Person, project_keys?: string[]): Promise<string> {
  const res = await w.call(who, 'POST', '/v1/me/tokens', {
    name: 'CI',
    scopes: ['issues:read'],
    ...(project_keys ? { project_keys } : {}),
  });
  return res.json().data.token;
}

describe('organisation deletion', () => {
  let w: IssueWorld;
  const memory = memoryStorage();
  let failDeletes = 0;
  // A store whose deletes can be made to fail, so an interrupted deletion can be resumed.
  const storage: Storage = {
    ...memory.storage,
    private: {
      ...memory.storage.private!,
      async delete(key: string) {
        if (failDeletes > 0) {
          failDeletes--;
          throw new Error('storage unavailable');
        }
        await memory.storage.private!.delete(key);
      },
    },
  };
  const url = () => `/v1/organizations/${w.slug}/deletion`;

  beforeAll(async () => {
    w = await issueWorld('OD', { storage });
    await promote(w, w.projectAdmin.username);
  });

  afterAll(async () => {
    await w.close();
  });

  test('only the Owner schedules or cancels, and never through a token', async () => {
    expect((await w.call(w.projectAdmin, 'POST', url(), { current_password: password })).statusCode).toBe(403);
    expect((await w.call(w.contributor, 'POST', url(), { current_password: password })).statusCode).toBe(403);
    expect((await w.call(w.outsider, 'POST', url(), { current_password: password })).statusCode).toBe(404);
    expect((await w.call(w.projectAdmin, 'DELETE', url())).statusCode).toBe(403);
    const pat = await patFor(w, w.admin);
    const res = await w.app.inject({
      method: 'POST',
      url: url(),
      headers: { authorization: `Bearer ${pat}` },
      body: { current_password: password },
    });
    expect(res.json().error.code).toBe('auth.session_required');
    expect((await w.call(w.admin, 'POST', url(), {})).json().error.code).toBe('auth.password_required');
  });

  test('scheduling starts 14 days of grace that every member sees, and emails every Org Admin', async () => {
    const res = await w.call(w.admin, 'POST', url(), { current_password: password });
    expect(res.statusCode).toBe(200);
    const { scheduled_at, deletes_at } = res.json().data.deletion;
    expect(Date.parse(deletes_at) - Date.parse(scheduled_at)).toBe(14 * DAY);

    const seen = (await w.call(w.contributor, 'GET', `/v1/organizations/${w.slug}`)).json().data;
    expect(seen.deletion.deletes_at).toBe(deletes_at);
    const mailed = w.box.sent.filter(m => m.subject === 'email.org_deletion_scheduled.subject').map(m => m.to);
    expect(mailed.sort()).toEqual([w.admin.email, w.projectAdmin.email].sort());
    expect((await w.call(w.admin, 'POST', url(), { current_password: password })).statusCode).toBe(409);

    const log = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}/activity`)).json().data;
    expect(log[0].kind).toBe('deletion_scheduled');
    // Work goes on during the grace period.
    expect((await w.call(w.contributor, 'POST', '/v1/issues', { project: 'OD', title: 'Still open' })).statusCode).toBe(
      201,
    );
  });

  test('the Owner cancels, and the admins hear so', async () => {
    const res = await w.call(w.admin, 'DELETE', url());
    expect(res.json().data.deletion).toBeNull();
    expect(w.box.last(w.projectAdmin.email)?.subject).toBe('email.org_deletion_cancelled.subject');
    expect((await w.call(w.admin, 'DELETE', url())).statusCode).toBe(409);
  });

  test('a reminder goes out once, a day before', async () => {
    await w.call(w.admin, 'POST', url(), { current_password: password });
    expect(await w.app.jobHandlers['org.deletion_reminder'](later(12))).toBe(0);
    expect(await w.app.jobHandlers['org.deletion_reminder'](later(13.2))).toBe(1);
    expect(await w.app.jobHandlers['org.deletion_reminder'](later(13.5))).toBe(0);
    expect(w.box.last(w.admin.email)?.subject).toBe('email.org_deletion_reminder.subject');
  });

  test('org.delete removes rows and platform objects, never a customer’s own bucket, and keeps the slug', async () => {
    const repo = attachmentsRepository(w.db);
    const issueId = await w.repos.issues.findByNumber(w.repos.ctx, w.repos.projectId, 1, { includeDeleted: true });
    const common = {
      issue_id: issueId!.id,
      mime_type: 'image/png',
      size_bytes: 10,
      checksum: Buffer.alloc(32),
      created_by: 1,
    };
    const [owner] = await w.db
      .execute<{ id: number }>(`select owner_user_id as id from organizations where slug = '${w.slug}'`)
      .then(r => r.rows);
    const platformKey = `api/${w.repos.ctx.orgId}/issues/1/${crypto.randomUUID()}`;
    memory.upload(platformKey, 10);
    await repo.insert(w.repos.ctx, {
      ...common,
      created_by: Number(owner!.id),
      public_id: crypto.randomUUID(),
      filename: 'screen.png',
      storage_target: 'platform',
      bucket: memory.storage.private!.bucket,
      object_key: platformKey,
    });
    const location = await orgStorageLocationsRepository(w.db).ensure(w.repos.ctx, {
      provider: 's3',
      endpoint: 'https://s3.eu-west-1.amazonaws.com',
      region: 'eu-west-1',
      bucket: 'customer-bucket',
    });
    await repo.insert(w.repos.ctx, {
      ...common,
      created_by: Number(owner!.id),
      public_id: crypto.randomUUID(),
      filename: 'theirs.png',
      storage_target: 'byo',
      storage_location_id: location.id,
      bucket: 'customer-bucket',
      object_key: 'their/own/key.png',
    });
    const restricted = await patFor(w, w.contributor, ['OD']);
    const open = await patFor(w, w.contributor);

    expect(await w.app.jobHandlers['org.delete'](later(13.9))).toBe(0);
    failDeletes = 1;
    expect(await w.app.jobHandlers['org.delete'](later(14.1))).toBe(0);
    // Stamped before the files went: nobody reaches it while the run is retried.
    expect((await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}`)).statusCode).toBe(404);
    expect(await w.app.jobHandlers['org.delete'](later(14.2))).toBe(1);

    expect(memory.deleted).toContain(platformKey);
    expect(memory.deleted).not.toContain('their/own/key.png');
    expect(await repo.listForOrg(w.repos.ctx, 10)).toEqual([]);
    const [locations] = await w.db
      .execute<{ n: number }>(
        `select count(*)::int as n from org_storage_locations where org_id = ${w.repos.ctx.orgId}`,
      )
      .then(r => r.rows);
    expect(Number(locations!.n)).toBe(0);
    const me = (await w.call(w.contributor, 'GET', '/v1/me')).json().data;
    expect(me.current_organization_slug).toBeNull();
    const withToken = (pat: string) =>
      w.app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${pat}` } });
    expect((await withToken(restricted)).statusCode).toBe(401);
    expect((await withToken(open)).statusCode).toBe(200);
    expect(w.box.last(w.projectAdmin.email)?.subject).toBe('email.org_deleted.subject');

    const again = await w.call(w.outsider, 'POST', '/v1/organizations', { name: 'Reuse', slug: w.slug });
    expect(again.json().error.code).toBe('organization.slug_taken');
    const [audit] = await w.db
      .execute<{ n: number }>(`select count(*)::int as n from org_activity where org_id = ${w.repos.ctx.orgId}`)
      .then(r => r.rows);
    expect(Number(audit!.n)).toBeGreaterThan(0);
    // The Owner owns nothing now, so their account is theirs to deactivate.
    expect((await w.call(w.admin, 'POST', '/v1/me/deactivate', { current_password: password })).statusCode).toBe(200);
  });
});

describe('ownership transfer', () => {
  let w: IssueWorld;
  const url = () => `/v1/organizations/${w.slug}/ownership-transfer`;
  const offer = (username: string) => w.call(w.admin, 'POST', url(), { username, current_password: password });

  beforeAll(async () => {
    w = await issueWorld('OT');
  });

  afterAll(async () => {
    await w.close();
  });

  test('only the Owner offers it, to an active member other than themselves', async () => {
    await promote(w, w.projectAdmin.username);
    const asAdmin = await w.call(w.projectAdmin, 'POST', url(), {
      username: w.contributor.username,
      current_password: password,
    });
    expect(asAdmin.statusCode).toBe(403);
    expect((await w.call(w.outsider, 'GET', url())).statusCode).toBe(404);
    expect((await offer('nobody-here')).statusCode).toBe(404);
    expect((await offer(w.admin.username)).json().error.code).toBe('ownership_transfer.already_owner');
    const noPassword = await w.call(w.admin, 'POST', url(), { username: w.contributor.username });
    expect(noPassword.json().error.code).toBe('auth.password_required');
  });

  test('a second offer replaces the first; the offer is read back by the Owner', async () => {
    expect((await offer(w.observer.username)).statusCode).toBe(201);
    const first = transferToken(w, w.observer.email);
    const res = await offer(w.contributor.username);
    expect(res.statusCode).toBe(201);
    expect(res.json().data.to.username).toBe(w.contributor.username);
    expect(w.box.last(w.admin.email)?.subject).toBe('email.ownership_offer_sent.subject');

    const pending = (await w.call(w.admin, 'GET', url())).json().data;
    expect(pending.to.username).toBe(w.contributor.username);
    const stale = await w.call(w.observer, 'POST', '/v1/ownership-transfers/preview', { token: first });
    expect(stale.json().error.code).toBe('ownership_transfer.invalid');
  });

  test('only the person it was offered to can open it', async () => {
    const token = transferToken(w, w.contributor.email);
    const wrong = await w.call(w.observer, 'POST', '/v1/ownership-transfers/preview', { token });
    expect(wrong.json().error.code).toBe('ownership_transfer.wrong_account');
    const preview = (await w.call(w.contributor, 'POST', '/v1/ownership-transfers/preview', { token })).json().data;
    expect(preview).toMatchObject({ organization: { slug: w.slug }, from: { username: w.admin.username } });
    expect(preview.organization.avatar_url).toContain('/avatars/organization?seed=');
  });

  test('declining leaves the Owner in place and tells them', async () => {
    const token = transferToken(w, w.contributor.email);
    expect((await w.call(w.contributor, 'POST', '/v1/ownership-transfers/decline', { token })).statusCode).toBe(200);
    expect(w.box.last(w.admin.email)?.subject).toBe('email.ownership_offer_declined.subject');
    expect((await w.call(w.admin, 'GET', url())).json().data).toBeNull();
  });

  test('the Owner can cancel a pending offer', async () => {
    await offer(w.observer.username);
    expect((await w.call(w.admin, 'DELETE', url())).statusCode).toBe(200);
    expect(w.box.last(w.observer.email)?.subject).toBe('email.ownership_offer_cancelled.subject');
    expect((await w.call(w.admin, 'DELETE', url())).statusCode).toBe(404);
  });

  test('scheduling deletion drops a pending offer, and no offer is made while it runs', async () => {
    await offer(w.observer.username);
    await w.call(w.admin, 'POST', `/v1/organizations/${w.slug}/deletion`, { current_password: password });
    expect((await w.call(w.admin, 'GET', url())).json().data).toBeNull();
    expect((await offer(w.observer.username)).json().error.code).toBe('organization.deletion_scheduled');
    await w.call(w.admin, 'DELETE', `/v1/organizations/${w.slug}/deletion`);
  });

  test('accepting makes them the Owner; the old one stays an Org Admin; both are told and it is logged', async () => {
    await offer(w.contributor.username);
    const token = transferToken(w, w.contributor.email);
    const res = await w.call(w.contributor, 'POST', '/v1/ownership-transfers/accept', { token });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.membership).toMatchObject({ is_owner: true, org_role: 'org_admin' });
    expect(res.json().data.owner.username).toBe(w.contributor.username);

    const old = (await w.call(w.admin, 'GET', `/v1/organizations/${w.slug}`)).json().data.membership;
    expect(old).toMatchObject({ is_owner: false, org_role: 'org_admin' });
    expect(w.box.last(w.contributor.email)?.subject).toBe('email.ownership_received.subject');
    expect(w.box.last(w.admin.email)?.subject).toBe('email.ownership_handed_over.subject');
    const log = (await w.call(w.contributor, 'GET', `/v1/organizations/${w.slug}/activity`)).json().data;
    expect(log[0]).toMatchObject({ kind: 'ownership_transferred' });

    expect((await w.call(w.contributor, 'POST', '/v1/ownership-transfers/accept', { token })).statusCode).toBe(400);
    // Now the old Owner may schedule nothing, and the new one may.
    const asOld = await w.call(w.admin, 'POST', `/v1/organizations/${w.slug}/deletion`, { current_password: password });
    expect(asOld.statusCode).toBe(403);
  });
});

describe('ownership transfer under concurrency', () => {
  let w: IssueWorld;
  const url = () => `/v1/organizations/${w.slug}/ownership-transfer`;
  const offer = (username: string) => w.call(w.admin, 'POST', url(), { username, current_password: password });
  const userId = async (who: { username: string }) =>
    (await organizationsRepository(w.db).findMemberByUsername(w.repos.ctx, who.username))!.user.id;
  const owner = async () => (await organizationsRepository(w.db).findById(w.repos.ctx))!.owner_user_id;
  const liveTransfer = () => oneTimeTokensRepository(w.db).findLiveTransfer(w.repos.ctx);
  const restoreOwner = async () => organizationsRepository(w.db).setOwner(w.repos.ctx, await userId(w.admin));

  beforeAll(async () => {
    w = await issueWorld('OTR');
  });

  afterAll(async () => {
    await w.close();
  });

  test('an offer made while the organisation is held waits, then replaces the offer that held it', async () => {
    const [observer, admin] = [await userId(w.observer), await userId(w.admin)];
    const res = await queuedBehind(
      w,
      async tx => {
        await organizationsRepository(tx).lockById(w.repos.ctx);
        await oneTimeTokensRepository(tx).create(systemContext('test: a competing offer'), {
          user_id: observer,
          purpose: 'ownership_transfer',
          token_hash: Buffer.from(crypto.getRandomValues(new Uint8Array(32))),
          org_id: w.repos.ctx.orgId,
          created_by: admin,
          expires_at: later(7),
        });
      },
      () => offer(w.contributor.username),
    );

    expect(res.statusCode).toBe(201);
    expect((await liveTransfer())?.user_id).toBe(await userId(w.contributor));
  });

  test('a cancel that waited on the organisation is refused once its caller is no longer the Owner', async () => {
    await offer(w.contributor.username);
    const observer = await userId(w.observer);
    const res = await queuedBehind(
      w,
      tx => organizationsRepository(tx).lockById(w.repos.ctx),
      () => w.call(w.admin, 'DELETE', url()),
      tx => organizationsRepository(tx).setOwner(w.repos.ctx, observer),
    );

    expect(res.statusCode).toBe(403);
    expect((await liveTransfer())?.user_id).toBe(await userId(w.contributor));
    await restoreOwner();
  });

  test('an acceptance that waited on the organisation is refused once the offerer is no longer the Owner', async () => {
    await offer(w.contributor.username);
    const token = transferToken(w, w.contributor.email);
    const observer = await userId(w.observer);
    const res = await queuedBehind(
      w,
      tx => organizationsRepository(tx).lockById(w.repos.ctx),
      () => w.call(w.contributor, 'POST', '/v1/ownership-transfers/accept', { token }),
      tx => organizationsRepository(tx).setOwner(w.repos.ctx, observer),
    );

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('ownership_transfer.invalid');
    expect(await owner()).toBe(await userId(w.observer));
    await restoreOwner();
  });

  test('accepting after the Owner changed is refused and leaves the Owner alone', async () => {
    await offer(w.contributor.username);
    const token = transferToken(w, w.contributor.email);
    await organizationsRepository(w.db).setOwner(w.repos.ctx, await userId(w.observer));

    const res = await w.call(w.contributor, 'POST', '/v1/ownership-transfers/accept', { token });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('ownership_transfer.invalid');
    expect(await owner()).toBe(await userId(w.observer));
  });
});

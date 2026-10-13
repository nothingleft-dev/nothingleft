import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { Analytics } from '@nothingleft/analytics';
import { testApp } from './helpers.ts';
import { mailbox, signUp, uniqueStamp, type Person } from './people.ts';

type App = Awaited<ReturnType<typeof testApp>>;

const captured: { name: string; props: Record<string, unknown>; orgId: number | undefined }[] = [];
const analytics: Analytics = {
  capture: (name, props, actor) =>
    void captured.push({ name, props: props as Record<string, unknown>, orgId: actor?.orgId }),
  captureException: () => {},
  shutdown: async () => {},
};

const box = mailbox();
let app: App;
let person: Person;

const call = (method: 'GET' | 'POST', url: string, body?: object) =>
  app.inject({ method, url, headers: person.headers, ...(body ? { body } : {}) });
const named = (name: string) => captured.filter(c => c.name === name);

beforeAll(async () => {
  app = await testApp({ mailer: box.mailer, analytics });
});

afterAll(async () => {
  await app.close();
});

describe('activation funnel', () => {
  test('every step is captured server-side, the second-day step once per day', async () => {
    person = await signUp(app, box, 'Funnel');
    const slug = `funnel-${uniqueStamp()}`;
    await call('POST', '/v1/organizations', { name: 'Funnel', slug });
    await call('POST', '/v1/projects', { name: 'Funnel Web', key: 'FN' });
    await call('POST', '/v1/issues', { project: 'FN', title: 'First' });
    await call('GET', '/v1/me');
    await call('GET', '/v1/me');

    expect(named('account_created')).toHaveLength(1);
    expect(named('organization_created')).toHaveLength(1);
    expect(named('project_created')).toHaveLength(1);
    const issue = named('issue_created');
    expect(issue).toHaveLength(1);
    expect(issue[0]!.orgId).toBeNumber();
    const days = named('user_active_day');
    expect(days).toHaveLength(1);
    expect(days[0]!.props).toEqual({ via: 'session', days_since_signup: 0 });
  });
});

describe('api_error', () => {
  test('a failed request carries its error code and route pattern, never the URL', async () => {
    captured.length = 0;
    const missing = await call('GET', '/v1/issues/FN-9999');
    expect(missing.statusCode).toBe(404);

    const [error] = named('api_error');
    expect(error!.props).toMatchObject({
      route: '/v1/issues/:key',
      method: 'GET',
      status_code: 404,
      error_code: 'issue.not_found',
      via: 'session',
    });
    expect(JSON.stringify(error!.props)).not.toContain('FN-9999');
  });

  test('an unmatched path sends nothing', async () => {
    captured.length = 0;
    await call('GET', '/v1/no-such-route');
    expect(named('api_error')).toHaveLength(0);
  });
});

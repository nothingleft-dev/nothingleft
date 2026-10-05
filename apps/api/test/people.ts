import { SESSION_COOKIE_NAME } from '@nothingleft/types';
import type { Message } from '@lib/email';
import { testEnv, type testApp } from './helpers.ts';

type App = Awaited<ReturnType<typeof testApp>>;

export const origin = { origin: testEnv.APP_BASE_URL };
export const password = 'a-long-enough-password';

export const uniqueStamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** A signed-in account, with helpers to call the API as it. */
export interface Person {
  email: string;
  sid: string;
  headers: Record<string, string>;
}

export function mailbox() {
  const sent: Message[] = [];
  return {
    sent,
    mailer: {
      async send(message: Message) {
        sent.push(message);
      },
    },
    /** The raw token only ever exists in an email; tests read it back from there. */
    tokenFor(to: string, subject: Message['subject']): string {
      const url = sent.findLast(m => m.to === to && m.subject === subject)?.params?.['url'];
      return /(?:token=|\/invite\/)([^\s&?/]+)/.exec(String(url))?.[1] ?? '';
    },
    last(to: string): Message | undefined {
      return sent.findLast(m => m.to === to);
    },
  };
}

export async function signUp(
  app: App,
  box: ReturnType<typeof mailbox>,
  name: string,
  options: { verify?: boolean; email?: string; invitation_token?: string } = {},
): Promise<Person> {
  const email = options.email ?? `${name.toLowerCase()}-${uniqueStamp()}@test.local`;
  const res = await app.inject({
    method: 'POST',
    url: '/v1/auth/sign-up',
    headers: origin,
    body: {
      email,
      password,
      name,
      ...(options.invitation_token ? { invitation_token: options.invitation_token } : {}),
    },
  });
  if (res.statusCode !== 201) throw new Error(`sign-up failed: ${res.statusCode} ${res.body}`);
  const sid = res.cookies.find(c => c.name === SESSION_COOKIE_NAME)!.value;
  if (options.verify ?? true) await verify(app, box, email);
  return { email, sid, headers: { ...origin, cookie: `${SESSION_COOKIE_NAME}=${sid}` } };
}

export async function verify(app: App, box: ReturnType<typeof mailbox>, email: string): Promise<void> {
  const token = box.tokenFor(email, 'email.verify.subject');
  const res = await app.inject({ method: 'POST', url: '/v1/auth/verify-email', headers: origin, body: { token } });
  if (res.statusCode !== 200) throw new Error(`verify failed: ${res.statusCode} ${res.body}`);
}

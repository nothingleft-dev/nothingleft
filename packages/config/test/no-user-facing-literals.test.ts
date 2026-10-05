import { expect, test } from 'bun:test';
import rule, { looksLikeProse } from '../eslint-rules/no-user-facing-literals.mjs';
import { ruleTester } from './rule-tester.ts';

test('looksLikeProse separates sentences from codes, scopes and log lines', () => {
  expect(looksLikeProse('You do not have permission to do that.')).toBe(true);
  expect(looksLikeProse('Project not found')).toBe(true);
  expect(looksLikeProse('that link has expired, request a new one.')).toBe(true);
  expect(looksLikeProse('auth.invalid_token')).toBe(false);
  expect(looksLikeProse('openid email profile')).toBe(false);
  expect(looksLikeProse('read:user user:email')).toBe(false);
  expect(looksLikeProse('unhandled error')).toBe(false);
  expect(looksLikeProse('Bearer')).toBe(false);
  expect(looksLikeProse('application/json')).toBe(false);
});

ruleTester.run('no-user-facing-literals', rule, {
  valid: [
    "throw new AppError('member.not_found', 404, { username }, 'username');",
    "const message = t('error.internal');",
    "request.log.error({ err }, 'Response failed schema validation.');",
    "app.log.info('Server Listening on port');",
    "throw new Error('Invalid environment: DATABASE_URL is missing.');",
    'throw new TypeError(`Expected a Date, got ${value}`);',
    "const ctx = systemContext('A user reads their own sessions.');",
    "const headers = { authorization: `Bearer ${token}`, 'user-agent': 'nothingleft' };",
    "const scope = 'openid email profile';",
    "type Reason = 'Not a sentence at all';",
    "const copy = { 'Some Heading Key': 1 };",
    "import x from 'Some Module Name';",
    { code: "const ctx = reasoned('Because I said so.');", options: [{ allowCallees: ['reasoned'] }] },
  ],
  invalid: [
    { code: "reply.status(404).send({ message: 'Project not found' });", errors: [{ messageId: 'literal' }] },
    { code: "throw new AppError('Project not found.', 404);", errors: [{ messageId: 'literal' }] },
    { code: 'const subject = `Welcome to ${org}, glad you are here.`;', errors: [{ messageId: 'literal' }] },
    { code: "const body = cond ? 'You are in.' : 'You are out.';", errors: 2 },
    { code: "mailer.send({ to, subject: 'Verify your email' });", errors: [{ messageId: 'literal' }] },
    { code: "const ctx = systemContext('Reason here.');", options: [{ allowCallees: [] }], errors: 1 },
  ],
});

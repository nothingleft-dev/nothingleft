import rule from '../eslint-rules/no-http-client.mjs';
import { ruleTester } from './rule-tester.ts';

ruleTester.run('no-http-client', rule, {
  valid: [
    'const { data } = await getProject(key);',
    'const fetch = makeFetcher(); fetch(url);',
    'function load(fetch: typeof globalThis.Request) { return fetch; }',
    'query.fetch();',
    "import { api } from '@lib/api/client';",
  ],
  invalid: [
    { code: 'await fetch("/v1/me");', errors: [{ messageId: 'global', data: { name: 'fetch' } }] },
    {
      code: 'await fetch("/v1/me");',
      languageOptions: { globals: { fetch: 'readonly' } },
      errors: [{ messageId: 'global' }],
    },
    { code: 'await window.fetch(url);', errors: [{ messageId: 'global', data: { name: 'window.fetch' } }] },
    { code: 'await globalThis.fetch(url);', errors: [{ messageId: 'global' }] },
    { code: 'const x = new XMLHttpRequest();', errors: [{ messageId: 'global' }] },
    { code: 'const s = new EventSource(url);', errors: [{ messageId: 'global' }] },
    { code: 'const f = fetch;', errors: [{ messageId: 'global' }] },
    { code: "import axios from 'axios';", errors: [{ messageId: 'library' }] },
    { code: "import ky from 'ky';", errors: [{ messageId: 'library' }] },
    { code: "import { request } from 'undici';", errors: [{ messageId: 'library' }] },
  ],
});

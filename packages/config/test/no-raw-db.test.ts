import rule from '../eslint-rules/no-raw-db.mjs';
import { ruleTester } from './rule-tester.ts';

ruleTester.run('no-raw-db', rule, {
  valid: [
    'await users.findByEmail(ctx, email);',
    'await db.transaction(tx => body(tenantRepos(tx)));',
    'const q = queue.select();',
    "import type { Db } from 'drizzle-orm/node-postgres';",
    "import { usersRepository } from '@nothingleft/db';",
    { code: 'conn.select().from(users);', options: [{ objects: ['db'] }] },
  ],
  invalid: [
    { code: 'await db.select().from(users);', errors: [{ messageId: 'query' }] },
    { code: 'await tx.insert(users).values(row);', errors: [{ messageId: 'query' }] },
    { code: 'await db.execute(sql`select 1`);', errors: [{ messageId: 'query' }] },
    { code: 'await db.query.users.findFirst();', errors: [{ messageId: 'query' }] },
    { code: 'await trx.delete(sessions);', errors: [{ messageId: 'query' }] },
    { code: 'await conn.update(users);', options: [{ objects: ['conn'] }], errors: [{ messageId: 'query' }] },
    { code: "import { sql } from 'drizzle-orm';", errors: [{ messageId: 'driver' }] },
    { code: "import { Pool } from 'pg';", errors: [{ messageId: 'driver' }] },
    { code: "import { drizzle } from 'drizzle-orm/node-postgres';", errors: [{ messageId: 'driver' }] },
  ],
});

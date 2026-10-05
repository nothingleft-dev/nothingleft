// The platform operator's deactivate and reactivate (user-lifecycle.md § Account deactivation):
// `bun run account deactivate someone@example.com`. There is deliberately no route for either.
import { loadEnv } from '@config/env';
import { buildApp } from '../src/app.ts';

const [action, email] = process.argv.slice(2);
if ((action !== 'deactivate' && action !== 'reactivate') || !email) {
  console.error('usage: bun run account deactivate|reactivate <email>');
  process.exit(1);
}

const app = await buildApp(loadEnv(), { jobs: false });
try {
  const user =
    action === 'deactivate'
      ? await app.accountLifecycle.deactivateByEmail(email)
      : await app.accountLifecycle.reactivateByEmail(email);
  console.log(`${action}d account ${user.id}: deactivated_at=${user.deactivated_at?.toISOString() ?? 'null'}`);
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await app.close();
}

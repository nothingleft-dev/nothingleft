import { expect, test } from 'bun:test';
import { dependencyPolicyViolations } from '../ci/dependency-policy.ts';

test('caret ranges, workspace links and typescript ~5 pass', () => {
  const manifest = {
    dependencies: { zod: '^4.6.5', '@nothingleft/types': 'workspace:*', next: '^16.0.0-canary.3' },
    devDependencies: { typescript: '~5' },
  };
  expect(dependencyPolicyViolations('package.json', manifest)).toEqual([]);
});

test('exact pins, tilde, wildcards, tags and urls fail', () => {
  const manifest = {
    dependencies: { a: '4.6.5', b: '~4.6.5', c: '*', d: 'latest', e: 'github:x/y', f: '>=1.0.0' },
  };
  expect(dependencyPolicyViolations('apps/api/package.json', manifest)).toHaveLength(6);
});

test('typescript must be exactly ~5, in any section', () => {
  const v = dependencyPolicyViolations('p', {
    devDependencies: { typescript: '^5.9.3' },
    peerDependencies: { typescript: '~6' },
  });
  expect(v).toEqual([
    'p devDependencies.typescript: "^5.9.3" must be "~5"',
    'p peerDependencies.typescript: "~6" must be "~5"',
  ]);
});

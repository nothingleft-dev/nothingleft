import type { Route } from 'next';
import { slugify } from '@nothingleft/format';
import type { Issue } from '@nothingleft/types';

/** The slug is derived from the title and ignored on lookup — frontend-guide.md § Routes. */
export const issuePath = (issue: Pick<Issue, 'key' | 'title'>) =>
  `/issue/${issue.key}/${slugify(issue.title)}` as Route;

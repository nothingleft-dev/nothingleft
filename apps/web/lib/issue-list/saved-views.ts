import type { SavedView } from '@nothingleft/types';

/** How a query names a saved view: always the braced form, which holds any name. */
export const viewReference = (name: string) => `#{${name}}`;

const NEEDS_BRACES = /[\s,:{}"#()]/;

/** A view's sort as the `sort=` parameter reads it: `{due date} asc`, never the bare two words. */
export const viewSortText = (view: Pick<SavedView, 'sort'>) =>
  view.sort.map(s => `${NEEDS_BRACES.test(s.attribute) ? `{${s.attribute}}` : s.attribute} ${s.direction}`).join(', ');

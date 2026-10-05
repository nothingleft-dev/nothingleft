import { type AttributeDefinition, type Registry, buildRegistry } from './registry.ts';

const ARTICLE_ATTRIBUTES: readonly AttributeDefinition[] = [
  {
    name: 'tag',
    type: 'enum',
    description: { key: 'query.attribute.tag' },
    group: { key: 'query.group.tag' },
    shorthand: true,
  },
  {
    name: 'status',
    type: 'enum',
    description: { key: 'query.attribute.status' },
    group: { key: 'query.group.status' },
    shorthand: true,
  },
  {
    name: 'created by',
    type: 'user',
    description: { key: 'query.attribute.created_by' },
    group: { key: 'query.group.user' },
  },
  {
    name: 'updated by',
    type: 'user',
    description: { key: 'query.attribute.updated_by' },
    group: { key: 'query.group.user' },
  },
  { name: 'created', type: 'instant', description: { key: 'query.attribute.created' }, sortable: true },
  { name: 'updated', type: 'instant', description: { key: 'query.attribute.updated' }, sortable: true },
  {
    name: 'parent',
    type: 'enum',
    description: { key: 'query.attribute.parent' },
    group: { key: 'query.group.parent' },
    empty: 'No parent',
  },
  { name: 'has', type: 'has', description: { key: 'query.attribute.has' } },
  { name: 'sort by', type: 'sort', description: { key: 'query.attribute.sort_by' } },
];

/** The reduced vocabulary from knowledge-base.md § Knowledge base search. */
export function articleRegistry(): Registry {
  return buildRegistry({ attributes: ARTICLE_ATTRIBUTES });
}

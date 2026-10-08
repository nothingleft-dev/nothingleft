export const REACTIONS_ENDPOINT = '/api/reactions';

export const REACTIONS = [
  { id: 'helpful', label: 'Helpful' },
  { id: 'clear', label: 'Clear' },
  { id: 'loved', label: 'Loved it' },
  { id: 'not-helpful', label: 'Not helpful' },
] as const;

export type ReactionId = (typeof REACTIONS)[number]['id'];
export type ReactionCounts = Record<ReactionId, number>;

/** One visitor's change: the reaction they leave (`from`) and the one they choose (`to`). */
export interface ReactionChange {
  article: string;
  from: ReactionId | null;
  to: ReactionId | null;
}

export const isReaction = (value: unknown): value is ReactionId =>
  typeof value === 'string' && REACTIONS.some(reaction => reaction.id === value);

export const emptyCounts = (): ReactionCounts =>
  Object.fromEntries(REACTIONS.map(reaction => [reaction.id, 0])) as ReactionCounts;

export const storageKey = (article: string) => `nl:docs:reaction:${article}`;

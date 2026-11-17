/** `10,000`: thousands grouped the way the docs write them, whatever the browser's locale. */
export const formatCount = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** `1 issue` · `1,284 issues`: the count grouped, the noun agreeing with it. */
export const plural = (n: number, one: string, many = `${one}s`) => `${formatCount(n)} ${n === 1 ? one : many}`;

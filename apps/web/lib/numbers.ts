/** `10,000`: thousands grouped the way the docs write them, whatever the browser's locale. */
export const formatCount = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

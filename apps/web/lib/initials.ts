export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map(word => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();

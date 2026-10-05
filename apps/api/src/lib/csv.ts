export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  // A number cannot run as a formula, so a negative one keeps its sign.
  if (typeof value === 'number') return String(value);
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const csvLine = (cells: unknown[]) => `${cells.map(csvCell).join(',')}\r\n`;

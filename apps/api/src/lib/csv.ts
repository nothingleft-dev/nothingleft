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

/** The delimiter of the header line: a comma unless semicolons outnumber commas outside quotes. */
function delimiterOf(text: string): ',' | ';' {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch === ',') commas++;
    else if (!quoted && ch === ';') semicolons++;
  }
  return semicolons > commas ? ';' : ',';
}

// The inverse of csvCell's guard, so a file this application exported imports as it was.
const unguard = (cell: string) => (/^'[=+\-@\t\r]/.test(cell) ? cell.slice(1) : cell);

/**
 * RFC 4180 rows: quoted cells may hold delimiters, quotes (doubled) and line breaks. A byte-order
 * mark is dropped and blank lines are skipped. `limit` stops after that many rows.
 */
export function parseCsv(input: string, limit = Infinity): { rows: string[][]; truncated: boolean } {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = delimiterOf(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let wasQuoted = false;
  const endCell = () => {
    row.push(wasQuoted ? cell : unguard(cell));
    cell = '';
    wasQuoted = false;
  };
  const endRow = () => {
    endCell();
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
      wasQuoted = true;
    } else if (ch === delimiter) endCell();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      if (rows.length > limit) return { rows: rows.slice(0, limit), truncated: true };
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) endRow();
  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}

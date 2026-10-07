export type Support = 'yes' | 'limited' | 'planned' | 'no';
export type MatrixGroup = 'planning' | 'delivery' | 'agents' | 'hosting';

export interface MatrixSource {
  label: string;
  href: string;
}

export interface MatrixCell {
  support: Support;
  note: string;
  source?: MatrixSource;
}

export interface MatrixRow {
  group: MatrixGroup;
  capability: string;
  ours: MatrixCell;
  theirs: MatrixCell;
}

export interface Comparison {
  competitor: string;
  /** ISO date (YYYY-MM-DD) the competitor column was last checked against its own pages. */
  lastVerified: string;
  rows: MatrixRow[];
}

export const SUPPORT_LABEL: Record<Support, string> = {
  yes: 'Yes',
  limited: 'Limited',
  planned: 'Planned',
  no: 'No',
};

export const SUPPORT_MEANING: Record<Support, string> = {
  yes: 'Built in and documented.',
  limited: 'Present, with a narrower scope than the row suggests; the note says how.',
  planned: 'Not available today; on the public roadmap or announced.',
  no: 'Not available.',
};

export const GROUP_LABEL: Record<MatrixGroup, string> = {
  planning: 'Planning',
  delivery: 'Delivery',
  agents: 'Agents',
  hosting: 'Hosting and pricing',
};

export const GROUP_ORDER: MatrixGroup[] = ['planning', 'delivery', 'agents', 'hosting'];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function displayDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1]} ${year}`;
}

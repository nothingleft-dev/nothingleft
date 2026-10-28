import type { CompareCard, DocCard, HeadlineCard, OgCard, SampleCard, SolutionCard } from '@data/og-cards';
import { ISSUES, assigneesOf, isResolvedAt, statusOf, type Status } from '@data/sample';
import { SITE_URL } from '@lib/site';
import { mark, markSvg, wordmark } from './lockup';
import { box, col, el, row, svgImage, text, type OgNode, type Style } from './node';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

// The cards are always dark, whatever the site theme, so the palette lives here rather than in tokens.
const C = {
  bg: '#141517',
  surface: '#1c1d20',
  surface2: '#2e3035',
  border: '#2c2e33',
  hairline: '#26282c',
  fg: '#f2f3f4',
  fg2: '#9fa1a7',
  fg3: '#7c7e85',
  amber: '#f9bc2c',
  amberInk: '#151618',
  green: '#4fb562',
  red: '#e55353',
  selected: '#2b261b',
};

const INTER = 'Inter';
const MONO = 'JetBrains Mono';
const HOST = SITE_URL.replace(/^https?:\/\//, '');

const mono = (size: number, extra: Style = {}): Style => ({ fontFamily: MONO, fontSize: size, ...extra });

const frame = (style: Style, ...children: OgNode[]) =>
  col(
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      position: 'relative',
      backgroundColor: C.bg,
      color: C.fg,
      fontFamily: INTER,
      ...style,
    },
    ...children,
  );

// The sentence's last mark is the brand's amber full stop.
const title = (content: string, end: string, style: Style) =>
  el(
    'div',
    { display: 'block', fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.02, ...style },
    content,
    el('span', { color: C.amber }, end),
  );

const lockup = (size = 40) => row({ gap: 14 }, mark(size, C.fg, C.amber), wordmark(size * 0.75, C.fg, C.amber));

const url = (path: string, style: Style = {}) =>
  text(mono(20, { color: C.fg3, flexShrink: 0, whiteSpace: 'nowrap', ...style }), HOST + (path === '/' ? '' : path));

function headline(path: string, card: HeadlineCard) {
  // A title past one line takes the smaller sizes so the lede still clears the lockup.
  const wraps = card.title.length > 26;
  return frame(
    {},
    box({ position: 'absolute', left: 72, top: 72 }, lockup()),
    // Anchored to the bottom edge so a two-line title lifts the eyebrow instead of pushing the URL out.
    col(
      {
        position: 'absolute',
        left: 72,
        top: 112,
        width: 980,
        height: OG_HEIGHT - 112 - 72,
        justifyContent: 'flex-end',
      },
      text({ fontSize: 24, fontWeight: 500, color: C.fg2, letterSpacing: '-0.01em' }, card.eyebrow),
      title(card.title, card.end ?? '.', { fontSize: wraps ? 72 : 80, marginTop: 28 }),
      text(
        { fontSize: wraps ? 26 : 28, lineHeight: 1.35, color: C.fg2, maxWidth: wraps ? 980 : 860, marginTop: 28 },
        card.lede,
      ),
      url(path, { marginTop: 56 }),
    ),
  );
}

// The rows are the query's own result, so the card never contradicts its filter line.
const PRIORITY_ORDER = ['Critical', 'Major', 'Normal', 'Minor'];
const sampleQuery = () => ISSUES.filter(item => item.type === 'Bug' && !isResolvedAt(item.key));
const sampleRows = () =>
  sampleQuery()
    .sort(
      (a, b) =>
        PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
        Number(b.key.slice(5)) - Number(a.key.slice(5)),
    )
    .slice(0, 3);
const DOT: Record<Status, string> = { Open: '#6b6e75', 'In Progress': C.amber, Reopened: C.amber, Fixed: C.green };

const avatar = (name: string, size: number) =>
  text(
    {
      width: size,
      height: size,
      borderRadius: size,
      backgroundColor: C.surface2,
      fontSize: size * 0.42,
      fontWeight: 600,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name
      .split(' ')
      .map(part => part[0])
      .join(''),
  );

const dim = (content: string, style: Style = {}) => text({ color: '#9a9ca3', ...style }, content);

// The same fictional Acme issue list every marketing sample view draws from.
function sampleApp() {
  const rows = sampleRows().map(({ key, title: issueTitle }, index) => {
    const status = statusOf(key);
    const assignee = assigneesOf(key)[0];
    const who = assignee?.name ?? 'Unassigned';
    return row(
      {
        height: 66,
        padding: '0 24px',
        gap: 24,
        borderBottom: `1px solid #222428`,
        backgroundColor: index === 0 ? C.selected : 'transparent',
      },
      dim(key, mono(18, { width: 120 })),
      text({ flex: 1, fontWeight: 500 }, issueTitle),
      row(
        { width: 170, gap: 10, color: assignee ? '#c9cbd0' : '#9a9ca3', fontSize: 19 },
        assignee ? avatar(who, 24) : box({ width: 24, height: 24, borderRadius: 24, border: '1.5px dashed #5a5d64' }),
        who,
      ),
      row(
        { width: 190, gap: 10, color: '#c9cbd0', fontSize: 19 },
        box({ width: 10, height: 10, borderRadius: 10, backgroundColor: DOT[status] }),
        status,
      ),
    );
  });
  return col(
    {
      position: 'absolute',
      left: 72,
      top: 372,
      width: OG_WIDTH - 72 + 20,
      height: 400,
      backgroundColor: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      fontSize: 22,
      overflow: 'hidden',
    },
    row(
      {
        height: 56,
        padding: '0 24px',
        gap: 14,
        borderBottom: `1px solid ${C.hairline}`,
        fontSize: 20,
        color: '#9a9ca3',
      },
      text({ color: C.fg, fontWeight: 500 }, 'Acme'),
      text({}, '/'),
      text(mono(17), 'ACME'),
      text({}, '/'),
      text({}, 'Issues'),
      box({ marginLeft: 'auto' }, avatar('Alex Lee', 32)),
    ),
    row(
      { height: 60, padding: '0 24px', gap: 10, borderBottom: `1px solid ${C.hairline}`, ...mono(19) },
      dim('type:'),
      text({}, 'Bug'),
      dim('#Unresolved'),
      dim(`${sampleQuery().length} issues`, { marginLeft: 'auto', fontFamily: INTER, fontSize: 18 }),
    ),
    ...rows,
  );
}

function sample(path: string, card: SampleCard) {
  return frame(
    { padding: '64px 72px 0' },
    row({ gap: 14, width: OG_WIDTH - 144 }, lockup(), url(path, { marginLeft: 'auto' })),
    title(card.title, '.', { fontSize: 64, maxWidth: 1000, marginTop: 18 }),
    sampleApp(),
  );
}

const crosshair = (x: number, y: number) =>
  text(
    mono(14, {
      position: 'absolute',
      left: x,
      top: y,
      width: 14,
      height: 14,
      justifyContent: 'center',
      color: C.amber,
      fontWeight: 300,
    }),
    '+',
  );

function solution(path: string, card: SolutionCard) {
  const stats = card.stats.map(stat =>
    col(
      { width: 220 },
      row(
        mono(20, { fontWeight: 600, color: C.fg }),
        text({}, stat.value.trimEnd()),
        stat.unit ? text({ color: C.amber, marginLeft: stat.value.endsWith(' ') ? 7 : 0 }, stat.unit) : null,
      ),
      text(mono(11, { color: '#6d7482', letterSpacing: 0.5, marginTop: 6 }), stat.label.toUpperCase()),
    ),
  );
  return frame(
    {},
    box({
      position: 'absolute',
      left: 28,
      top: 28,
      width: OG_WIDTH - 56,
      height: OG_HEIGHT - 56,
      border: '1px solid rgba(255,255,255,0.1)',
    }),
    crosshair(21, 21),
    crosshair(OG_WIDTH - 35, 21),
    crosshair(21, OG_HEIGHT - 35),
    crosshair(OG_WIDTH - 35, OG_HEIGHT - 35),
    row(
      { position: 'absolute', left: 72, top: 62, width: OG_WIDTH - 144, height: 32 },
      row(
        { gap: 12 },
        mark(32, C.fg, C.amber),
        text(mono(14, { fontWeight: 600, letterSpacing: 0.7, color: '#dce0e8' }), 'NOTHING LEFT'),
      ),
      text(
        mono(13, {
          marginLeft: 'auto',
          padding: '0 20px',
          height: 32,
          alignItems: 'center',
          color: '#8c93a0',
          backgroundColor: '#111317',
          border: '1px solid #252830',
          borderRadius: 4,
        }),
        `// SOLUTIONS / ${card.category.toUpperCase()}`,
      ),
    ),
    box({ position: 'absolute', left: 864, top: 210, opacity: 0.12 }, svgImage(markSvg('#ffffff', C.amber), 280, 280)),
    col(
      { position: 'absolute', left: 72, top: 166, width: OG_WIDTH - 144 },
      title(card.title, '.', {
        fontSize: 52,
        fontWeight: 700,
        letterSpacing: '-0.027em',
        lineHeight: 1.12,
        maxWidth: 960,
        textWrap: 'balance',
      }),
      col(
        { marginTop: 26, fontSize: 22, lineHeight: 1.45, color: '#9299a6', whiteSpace: 'nowrap' },
        text({}, card.lede[0]),
        text({}, card.lede[1]),
      ),
    ),
    box({ position: 'absolute', left: 72, top: 472, width: OG_WIDTH - 144, borderTop: '1px dashed #3a3d46' }),
    row(
      { position: 'absolute', left: 72, top: 496, width: OG_WIDTH - 144, alignItems: 'flex-start' },
      ...stats,
      url(path, { marginLeft: 'auto', fontSize: 13, color: '#88909f', marginTop: 8 }),
    ),
  );
}

// Neither font carries a check mark, so the two marks are drawn.
const CROSS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="${C.red}" stroke-width="2" stroke-linecap="round"/></svg>`;
const CHECK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path d="M1.5 6.5l3 3 6-7" fill="none" stroke="${C.amber}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const bullet = (glyph: string, content: string, color: string) =>
  row({ gap: 10, height: 38, fontSize: 14 }, svgImage(glyph, 11, 11), text({ color }, content));

function compare(path: string, card: CompareCard) {
  const panel = (left: number, width: number, border: string, heading: OgNode, bullets: OgNode[]) =>
    col(
      {
        position: 'absolute',
        left,
        top: 292,
        width: width - 50,
        height: 184 - 28,
        padding: '26px 24px 0',
        backgroundColor: C.surface,
        border,
        borderRadius: 8,
      },
      heading,
      col({ marginTop: 10 }, ...bullets),
    );
  return frame(
    {},
    row(
      { position: 'absolute', left: 72, top: 62, width: OG_WIDTH - 144, height: 32 },
      row(
        { gap: 12 },
        mark(32, C.fg, C.amber),
        text(
          mono(13, { fontWeight: 500, letterSpacing: 0.5, color: '#a4abb8' }),
          `NOTHING LEFT vs ${card.competitor.toUpperCase()}`,
        ),
      ),
      text(
        mono(11, {
          marginLeft: 'auto',
          padding: '0 24px',
          height: 28,
          alignItems: 'center',
          color: '#788190',
          backgroundColor: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
        }),
        '// HONEST TOOL COMPARISON',
      ),
    ),
    col(
      { position: 'absolute', left: 72, top: 136, width: OG_WIDTH - 144 },
      title(card.title, '.', {
        fontSize: 38,
        fontWeight: 700,
        letterSpacing: '-0.02em',
        lineHeight: 1.12,
        textWrap: 'balance',
      }),
      text({ marginTop: 10, fontSize: 18, color: '#8c93a1' }, card.lede),
    ),
    panel(
      72,
      484,
      `1px solid ${C.border}`,
      text({ fontSize: 18, fontWeight: 600, color: '#a4abb8' }, card.competitorHeading),
      card.competitorPoints.map(point => bullet(CROSS, point, '#858d9d')),
    ),
    text(
      mono(14, {
        position: 'absolute',
        left: 556,
        top: 292,
        width: 82,
        height: 184,
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        color: '#555c6b',
      }),
      'VS',
    ),
    panel(
      638,
      490,
      `1.2px solid ${C.amber}`,
      text({ fontSize: 18, fontWeight: 600, color: C.amber }, 'Nothing Left'),
      card.nothingLeftPoints.map(point => bullet(CHECK, point, '#dbe0ea')),
    ),
    text(
      mono(10, {
        position: 'absolute',
        left: 984,
        top: 280,
        height: 22,
        padding: '0 14px',
        alignItems: 'center',
        borderRadius: 11,
        backgroundColor: C.amber,
        color: C.amberInk,
        fontWeight: 700,
        letterSpacing: 0.5,
      }),
      'THE MODERN STACK',
    ),
    box({ position: 'absolute', left: 72, top: 544, width: OG_WIDTH - 144, borderTop: '1px solid #1e2129' }),
    row(
      { position: 'absolute', left: 72, top: 566, width: OG_WIDTH - 144 },
      text(mono(12, { color: '#555c6b' }), 'COMPARE WORKFLOWS, AGENT INTEGRATION & PRICING'),
      url(path, { marginLeft: 'auto', fontSize: 13, color: '#a0a6b5' }),
    ),
  );
}

function doc(card: DocCard) {
  const long = card.title.length > 24;
  return frame(
    { backgroundColor: '#191b20', color: '#fafafa' },
    row(
      { position: 'absolute', left: 56, top: 48, width: OG_WIDTH - 112 },
      lockup(44),
      text(
        mono(15, { marginLeft: 'auto', marginTop: 16, fontWeight: 600, letterSpacing: 2, color: '#b9bbc1' }),
        'DOCUMENTATION',
      ),
    ),
    box({ position: 'absolute', left: OG_WIDTH - 540 + 35, top: 35 }, svgImage(markSvg('#30333a', C.amber), 540, 540)),
    box({
      position: 'absolute',
      left: 24,
      top: 145,
      width: 3,
      height: OG_HEIGHT - 145 - 126,
      backgroundColor: C.amber,
    }),
    box(
      { position: 'absolute', left: 56, top: 198, width: 825 },
      title(
        card.title,
        '.',
        long
          ? { fontSize: 65, letterSpacing: '-3px', lineHeight: 1.04 }
          : { fontSize: 78, letterSpacing: '-4.2px', lineHeight: 1.04 },
      ),
    ),
    text(
      {
        position: 'absolute',
        left: 60,
        top: long ? 427 : 415,
        width: 700,
        fontSize: 23,
        lineHeight: 1.5,
        color: '#b9bbc1',
      },
      card.lede,
    ),
    row(
      {
        position: 'absolute',
        left: 56,
        top: OG_HEIGHT - 40 - 24,
        width: OG_WIDTH - 112,
        fontSize: 17,
        color: '#e1e2e5',
      },
      text({}, HOST),
      text({ marginLeft: 'auto', fontSize: 15, color: '#969aa4' }, 'Open-source project tracking'),
    ),
  );
}

export function ogCardTree(path: string, card: OgCard): OgNode {
  switch (card.template) {
    case 'headline':
      return headline(path, card);
    case 'sample':
      return sample(path, card);
    case 'solution':
      return solution(path, card);
    case 'compare':
      return compare(path, card);
    case 'doc':
      return doc(card);
  }
}

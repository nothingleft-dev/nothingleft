import { AMBER } from '@nothingleft/brand';
import { box, col, mark, OG_HEIGHT, OG_WIDTH, row, text, wordmark, type OgNode } from '@nothingleft/brand/og';
import type { AuthCard } from '@lib/auth-metadata';

// Auth pages are always light, so the card is too; the window is the one product glimpse it shows.
const INK = '#17181b';
const MUTED = '#63656b';
const BG = '#f4f4f5';
const HOST = 'work.nothingleft.dev';

const amber = AMBER.light;

function window_(card: AuthCard['scene']): OgNode {
  const steps = card.steps.map((step, index) =>
    row(
      {
        height: 77,
        padding: '0 24px',
        gap: 14,
        borderBottom: '1px solid #ededee',
        backgroundColor: index === card.steps.length - 1 ? '#fffae8' : 'transparent',
        fontSize: 19,
      },
      text({ fontSize: 14, color: '#93959b', width: 22 }, String(index + 1).padStart(2, '0')),
      text({}, step),
    ),
  );
  return col(
    {
      position: 'absolute',
      left: 683,
      top: 156,
      width: 570,
      height: 392,
      backgroundColor: '#ffffff',
      border: '1px solid #d3d4d7',
      borderRadius: 10,
      boxShadow: '0 22px 50px rgba(20, 22, 33, 0.07)',
      transform: 'rotate(-3deg)',
      color: INK,
      overflow: 'hidden',
    },
    row(
      { height: 64, padding: '0 24px', gap: 10, borderBottom: '1px solid #e7e7e9', fontSize: 18, fontWeight: 600 },
      box({ width: 10, height: 10, borderRadius: 10, backgroundColor: amber, marginRight: 6 }),
      text({}, card.heading),
    ),
    ...steps,
    row(
      { padding: '21px 24px', gap: 14, fontSize: 15, color: '#72757b' },
      box({ width: 20, height: 4, borderRadius: 4, backgroundColor: amber }),
      text({}, card.footer),
    ),
  );
}

export function authCard(card: AuthCard): OgNode {
  const [first, last] = card.title;
  return col(
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      position: 'relative',
      backgroundColor: BG,
      color: INK,
      fontFamily: 'Inter',
      overflow: 'hidden',
    },
    row({ position: 'absolute', left: 56, top: 48, gap: 15 }, mark(44, INK, amber), wordmark(42, INK, amber)),
    text(
      { position: 'absolute', right: 56, top: 64, fontSize: 14, fontWeight: 600, letterSpacing: 2 },
      card.category.toUpperCase(),
    ),
    col(
      { position: 'absolute', left: 56, top: 190, width: 575, fontSize: 69, lineHeight: 1.07, letterSpacing: -3.8 },
      text({ fontWeight: 600 }, first),
      row({ fontWeight: 600 }, text({}, last), text({ color: amber }, '.')),
    ),
    text(
      { position: 'absolute', left: 58, top: 429, width: 500, fontSize: 22, lineHeight: 1.5, color: MUTED },
      card.lede,
    ),
    window_(card.scene),
    row(
      { position: 'absolute', left: 56, top: OG_HEIGHT - 40 - 22, width: OG_WIDTH - 112, fontSize: 17 },
      text({}, HOST),
      text({ marginLeft: 'auto', fontSize: 15, color: '#686a70' }, 'Open-source project tracking'),
    ),
  );
}

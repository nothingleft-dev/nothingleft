import { ArtFrame, CARD, TextBar } from '@components/auth/art/frame';

const COLUMNS = [
  {
    label: 30,
    cards: [
      { h: 56, tag: 30, accent: false },
      { h: 44, tag: 22, accent: false },
    ],
  },
  {
    label: 46,
    cards: [
      { h: 62, tag: 26, accent: true },
      { h: 50, tag: 34, accent: false },
      { h: 40, tag: 0, accent: false },
    ],
  },
  { label: 26, cards: [{ h: 48, tag: 24, accent: false }] },
];

/**
 * The new-account panel: an empty-ish board filling up, because that is the first thing
 * a new organisation does. Deliberately lighter than the sign-in art — fewer rows, more
 * air — so the two screens do not read as the same picture.
 */
export function BoardArt() {
  return (
    <ArtFrame label="A board with three columns of issues, one card marked as high priority">
      <g transform="translate(34 30)">
        <rect width="452" height="34" rx="8" {...CARD} />
        <rect x={12} y={10} width={14} height={14} rx={4} fill="var(--panel-accent)" />
        <TextBar x={36} y={14} w={86} tone="strong" />
        <TextBar x={134} y={14} w={48} />
        <rect x={398} y={9} width={42} height={16} rx={8} fill="var(--panel-pill)" />
      </g>

      {COLUMNS.map((column, ci) => {
        const x = 34 + ci * 156;
        return (
          <g key={ci} transform={`translate(${x} 86)`}>
            <rect width="140" height="244" rx="10" fill="var(--panel-head)" stroke="var(--panel-line)" />
            <TextBar x={14} y={16} w={column.label} tone="faint" h={5} />
            <circle cx={124} cy={19} r={7} fill="var(--panel-line)" />

            {
              column.cards.reduce<{ y: number; nodes: React.ReactNode[] }>(
                (acc, card, i) => {
                  const y = acc.y;
                  acc.nodes.push(
                    <g key={i}>
                      <rect x={12} y={y} width={116} height={card.h} rx={7} {...CARD} />
                      <rect
                        x={22}
                        y={y + 12}
                        width={30}
                        height={9}
                        rx={2.5}
                        fill={card.accent ? 'var(--panel-accent)' : 'var(--panel-ink-faint)'}
                      />
                      <TextBar x={22} y={y + 28} w={94} tone={card.accent ? 'strong' : 'muted'} h={5} />
                      {card.h > 46 ? <TextBar x={22} y={y + 39} w={62} tone="faint" h={5} /> : null}
                      {card.tag > 0 ? (
                        <rect
                          x={22}
                          y={y + card.h - 15}
                          width={card.tag}
                          height={9}
                          rx={4.5}
                          fill="var(--panel-pill)"
                        />
                      ) : null}
                      <circle cx={116} cy={y + card.h - 11} r={6} fill="var(--panel-ink-faint)" />
                    </g>,
                  );
                  acc.y = y + card.h + 12;
                  return acc;
                },
                { y: 34, nodes: [] },
              ).nodes
            }
          </g>
        );
      })}
    </ArtFrame>
  );
}

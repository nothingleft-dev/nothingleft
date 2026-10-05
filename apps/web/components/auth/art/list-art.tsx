import { ArtFrame, CARD, TextBar } from '@components/auth/art/frame';

const ROWS = [
  { key: 44, title: 186, state: 54, accent: false },
  { key: 40, title: 152, state: 46, accent: true },
  { key: 46, title: 204, state: 62, accent: false },
  { key: 38, title: 168, state: 50, accent: false },
  { key: 44, title: 140, state: 58, accent: false },
];

/**
 * The returning-user panel: a query bar over an issue list, with one row carrying the
 * single accent mark. It is the product's own rule in miniature — colour means deviation.
 */
export function ListArt() {
  return (
    <ArtFrame label="An issue list filtered by a saved query, with one high-priority row marked">
      <g transform="translate(40 34)">
        <rect width="440" height="30" rx="7" {...CARD} />
        <TextBar x={14} y={12} w={54} tone="strong" />
        <TextBar x={76} y={12} w={38} />
        <TextBar x={122} y={12} w={70} tone="strong" />
        <TextBar x={200} y={12} w={44} />
        <rect x={410} y={9} width={16} height={12} rx={3} fill="var(--panel-ink-faint)" />
      </g>

      <g transform="translate(40 84)">
        <rect width="440" height="238" rx="10" {...CARD} />
        <rect x={0} y={0} width={440} height={34} rx={10} fill="var(--panel-head)" />
        <TextBar x={16} y={15} w={28} tone="faint" h={5} />
        <TextBar x={64} y={15} w={44} tone="faint" h={5} />
        <TextBar x={300} y={15} w={36} tone="faint" h={5} />
        <TextBar x={376} y={15} w={40} tone="faint" h={5} />

        {ROWS.map((row, i) => {
          const y = 34 + i * 41;
          return (
            <g key={i}>
              {i > 0 ? <line x1={0} y1={y} x2={440} y2={y} stroke="var(--panel-line)" /> : null}
              <rect
                x={16}
                y={y + 15}
                width={row.key}
                height={11}
                rx={3}
                fill={row.accent ? 'var(--panel-accent)' : 'var(--panel-ink-faint)'}
              />
              <TextBar x={16 + row.key + 12} y={y + 17} w={row.title} tone={i === 1 ? 'strong' : 'muted'} />
              <rect x={300} y={y + 14} width={row.state} height={13} rx={6.5} fill="var(--panel-pill)" />
              <circle cx={404} cy={y + 20} r={9} fill="var(--panel-ink-faint)" />
            </g>
          );
        })}
      </g>
    </ArtFrame>
  );
}

import { AgentArt, InsightsArt, IssueArt } from '@components/auth/art/panel-art';

export type PanelVariant = 'default' | 'signup' | 'reset';

interface Stat {
  value: string;
  word: string;
  caption: string;
}

const PANELS: Record<PanelVariant, { headline: string; body: string; stats: [Stat, Stat] }> = {
  default: {
    headline: 'Everything still open, in one place.',
    body: 'Issues, boards, time and reports - and the same API behind all of it, so an agent on MCP can do anything a person can.',
    stats: [
      { value: '9', word: 'Reports', caption: 'Burndown, Gantt & time' },
      { value: '∞', word: 'Views', caption: 'Saved, shared & personal' },
    ],
  },
  signup: {
    headline: 'Your agent works the tracker too.',
    body: 'Create an organisation and bring your agent on day one. Every call goes through the same API and permissions as the app, and your first twenty people are free.',
    stats: [
      { value: '244', word: 'API', caption: 'Documented operations' },
      { value: '87', word: 'Tools', caption: 'MCP, same permissions' },
    ],
  },
  reset: {
    headline: 'Every word stays yours.',
    body: 'Issues, comments and docs are plain Markdown, and every change is logged with who made it and when. Nothing here is locked away.',
    stats: [
      { value: '100%', word: 'Markdown', caption: 'Never stored as HTML' },
      { value: '0', word: 'Silent edits', caption: 'Every change is logged' },
    ],
  },
};

const ART = { default: InsightsArt, signup: AgentArt, reset: IssueArt } as const;

/**
 * The right half of the auth split. Hidden below `lg`, where the form should own the
 * whole viewport rather than compete with decoration.
 */
export function AuthPanel({ variant = 'default' }: { variant?: PanelVariant }) {
  const { headline, body, stats } = PANELS[variant];
  const Art = ART[variant];

  return (
    <aside className="ap-panel relative hidden flex-col justify-between overflow-hidden rounded-lg bg-panel p-10 lg:flex">
      <div className="flex flex-1 items-center justify-center py-6">
        <Art />
      </div>
      <div className="ap-stats">
        {stats.map(stat => (
          <div key={stat.word} className="ap-stat">
            <b>
              {stat.value}
              <em>{stat.word}</em>
            </b>
            <span>{stat.caption}</span>
          </div>
        ))}
      </div>
      <div className="flex max-w-[560px] flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-panel-ink">{headline}</h2>
        <p className="text-panel-ink-muted">{body}</p>
      </div>
    </aside>
  );
}

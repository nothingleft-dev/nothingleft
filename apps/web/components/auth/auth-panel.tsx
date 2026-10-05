import { BoardArt } from '@components/auth/art/board-art';
import { ListArt } from '@components/auth/art/list-art';

export type PanelVariant = 'signup' | 'default';

const COPY: Record<PanelVariant, { headline: string; body: string }> = {
  signup: {
    headline: 'Twenty people. Free forever.',
    body: 'Create an organisation, add a project, and start tracking today. No card, no trial clock, and your first twenty seats stay free when billing does arrive.',
  },
  default: {
    headline: 'Everything still open, in one place.',
    body: 'Issues, boards, time and reports — and the same API behind all of it, so an agent on MCP can do anything a person can.',
  },
};

/**
 * The right half of the auth split. Hidden below `lg`, where the form should own the
 * whole viewport rather than compete with decoration.
 */
export function AuthPanel({ variant = 'default' }: { variant?: PanelVariant }) {
  const copy = COPY[variant];

  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden rounded-lg bg-panel p-10 lg:flex">
      <div className="flex flex-1 items-center justify-center py-6">
        {variant === 'signup' ? <BoardArt /> : <ListArt />}
      </div>
      <div className="flex max-w-[460px] flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight text-panel-ink">{copy.headline}</h2>
        <p className="text-panel-ink-muted">{copy.body}</p>
      </div>
    </aside>
  );
}

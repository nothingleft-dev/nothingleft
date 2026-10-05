import { STATUS_CATEGORIES, type BoardValueCount, type StatusCategory } from '@nothingleft/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { cn } from '@lib/utils';

const CATEGORY_LABEL: Record<StatusCategory, string> = {
  backlog: 'Backlog',
  unstarted: 'Open',
  started: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

// DESIGN-SYSTEM § 3.4: gray for backlog (faded), unstarted (solid) and cancelled (hatched);
// colour only where work is moving or finished.
const CATEGORY_CLASS: Record<StatusCategory, string> = {
  backlog: 'c-gray opacity-40',
  unstarted: 'c-gray',
  started: 'c-amber',
  done: 'c-green',
  cancelled: 'c-gray [background:repeating-linear-gradient(135deg,var(--c-solid)_0_2px,var(--c-bg)_2px_4px)]',
};

interface StatusStripProps {
  counts: Partial<Record<StatusCategory, number>>;
  /** The legend keeps identity off colour alone; leave it out only where the numbers sit right beside. */
  legend?: boolean;
  className?: string;
}

export function StatusStrip({ counts, legend = true, className }: StatusStripProps) {
  const entries = STATUS_CATEGORIES.map(c => [c, counts[c] ?? 0] as const).filter(([, n]) => n > 0);
  const total = entries.reduce((sum, [, n]) => sum + n, 0);

  if (total === 0) {
    return <p className={cn('text-xs text-text-muted', className)}>No issues yet.</p>;
  }

  return (
    <div className={className}>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-[3px]" aria-hidden>
        {entries.map(([category, n]) => (
          <Tooltip key={category}>
            <TooltipTrigger asChild>
              <i className={cn('block h-full bg-c-solid', CATEGORY_CLASS[category])} style={{ flex: n }} />
            </TooltipTrigger>
            <TooltipContent>
              {n} {n === 1 ? 'issue' : 'issues'} {CATEGORY_LABEL[category].toLowerCase()}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {legend ? (
        <ul className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-2xs text-text-secondary">
          {entries.map(([category, n]) => (
            <li key={category} className="inline-flex items-center gap-1.5">
              <i className={cn('inline-block size-1.5 rounded-full bg-c-solid', CATEGORY_CLASS[category])} />
              {CATEGORY_LABEL[category]} <b className="font-medium tabular text-text">{n}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

interface StatusDistributionProps {
  /** Statuses, or a board's priorities or types; only statuses carry a category's texture. */
  statuses: readonly BoardValueCount[];
  /** What is counted: `cards` on a board, `issues` elsewhere. */
  noun?: 'cards' | 'issues';
  /** How a segment's hover reads: `in status Open`, `with priority Critical`, `of type Bug`. */
  field?: 'status' | 'priority' | 'type';
  legend?: boolean;
  className?: string;
}

/** One segment per status, in the status's label colour, with the category's texture. */
export function StatusDistribution({
  statuses,
  noun = 'issues',
  field = 'status',
  legend = true,
  className,
}: StatusDistributionProps) {
  const entries = statuses.filter(s => s.count > 0);
  if (entries.length === 0) {
    return <p className={cn('text-xs text-text-muted', className)}>No {noun} yet.</p>;
  }
  const one = noun === 'cards' ? 'card' : 'issue';
  const phrase = field === 'status' ? 'in status' : field === 'priority' ? 'with priority' : 'of type';
  return (
    <div className={className}>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-[3px]">
        {entries.map(s => (
          <Tooltip key={s.name}>
            <TooltipTrigger asChild>
              <i
                aria-label={`${s.count} ${s.count === 1 ? one : noun} ${phrase} ${s.name}`}
                className={cn('block h-full', `l-${s.color}`, STATUS_TEXTURE[s.category ?? 'started'])}
                style={{ flex: s.count }}
              />
            </TooltipTrigger>
            <TooltipContent>
              {s.count} {s.count === 1 ? one : noun} {phrase} {s.name}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {legend ? (
        <ul className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-2xs text-text-secondary">
          {entries.map(s => (
            <li key={s.name} className="inline-flex items-center gap-1.5">
              <i
                className={cn(
                  'inline-block size-1.5 rounded-full',
                  `l-${s.color}`,
                  STATUS_TEXTURE[s.category ?? 'started'],
                )}
              />
              {s.name} <b className="font-medium tabular text-text">{s.count}</b>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const STATUS_TEXTURE: Record<StatusCategory, string> = {
  backlog: 'bg-c-solid opacity-40',
  unstarted: 'bg-c-solid',
  started: 'bg-c-solid',
  done: 'bg-c-solid',
  cancelled: '[background:repeating-linear-gradient(135deg,var(--c-solid)_0_2px,var(--c-bg)_2px_4px)]',
};

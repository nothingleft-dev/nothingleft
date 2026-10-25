import type { ReactNode } from 'react';
import {
  Check,
  CircleX,
  GitBranch,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  MessageSquareWarning,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import type { GitDevelopmentRollup, GitDevelopmentSummary, GitPullRequestState } from '@nothingleft/types';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { PR_STATE, ROLLUP, count, type Hue } from '@lib/git/words';
import { cn } from '@lib/utils';

/** A dot in a palette hue; gray is hollow, the resting state. */
export function HueDot({ hue, className }: { hue: Hue; className?: string }) {
  return (
    <i
      aria-hidden
      className={cn(
        `c-${hue} inline-block size-2 flex-none rounded-full`,
        hue === 'gray' ? 'shadow-[inset_0_0_0_1.5px_var(--c-solid)]' : 'bg-c-solid',
        className,
      )}
    />
  );
}

/** A tinted 20px chip: the one place git state wears its colour in full. */
export function HueChip({
  hue,
  icon: Icon,
  children,
  className,
}: {
  hue: Hue;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 flex-none items-center gap-1 rounded-sm px-1.5 text-2xs font-medium whitespace-nowrap',
        hue === 'gray' ? 'border text-text-secondary' : `c-${hue} bg-c-bg text-c-fg`,
        className,
      )}
    >
      {Icon ? <Icon className="size-3" aria-hidden /> : null}
      {children}
    </span>
  );
}

const ROLLUP_ICON: Record<GitDevelopmentRollup, LucideIcon> = {
  merged: GitMerge,
  ci_failing: CircleX,
  changes_requested: MessageSquareWarning,
  approved: Check,
  in_review: GitPullRequest,
  draft: GitPullRequestDraft,
  branch_active: GitBranch,
  reverted: Undo2,
  none: GitBranch,
};

export function DevelopmentBadge({ rollup, className }: { rollup: GitDevelopmentRollup; className?: string }) {
  const { label, hue } = ROLLUP[rollup];
  return (
    <HueChip hue={hue} icon={ROLLUP_ICON[rollup]} className={className}>
      {label}
    </HueChip>
  );
}

/** `2 pull requests · 7 commits · 3 repositories`, only the non-zero ones. */
export function summaryCounts(summary: GitDevelopmentSummary, short = false): string {
  const parts = short
    ? [summary.pull_requests ? `${summary.pull_requests} PR` : null, summary.commits ? `${summary.commits} c` : null]
    : [
        summary.pull_requests ? count(summary.pull_requests, 'pull request') : null,
        summary.branches ? count(summary.branches, 'branch', 'branches') : null,
        summary.commits ? count(summary.commits, 'commit') : null,
        summary.repositories > 1 ? count(summary.repositories, 'repository', 'repositories') : null,
      ];
  return parts.filter(Boolean).join(' · ');
}

/** The board card's mark: the badge's icon in its hue, the word in the tooltip. */
export function DevelopmentIcon({ rollup, className }: { rollup: GitDevelopmentRollup; className?: string }) {
  if (rollup === 'none') return null;
  const { label, hue } = ROLLUP[rollup];
  const Icon = ROLLUP_ICON[rollup];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={`Development: ${label}`}
          className={cn(
            'inline-flex size-5 flex-none items-center justify-center rounded-xs',
            hue === 'gray' ? 'text-text-muted' : `c-${hue} text-c-fg`,
            className,
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const PR_ICON: Record<GitPullRequestState, LucideIcon> = {
  open: GitPullRequest,
  draft: GitPullRequestDraft,
  merged: GitMerge,
  closed: GitPullRequestClosed,
};

export function PullRequestStateChip({ state }: { state: GitPullRequestState }) {
  const { label, hue } = PR_STATE[state];
  return (
    <HueChip hue={hue} icon={PR_ICON[state]}>
      {label}
    </HueChip>
  );
}

export function PullRequestIcon({ state, className }: { state: GitPullRequestState; className?: string }) {
  const Icon = PR_ICON[state];
  const { hue } = PR_STATE[state];
  return (
    <Icon
      aria-hidden
      className={cn('size-icon-sm flex-none', hue === 'gray' ? 'text-text-muted' : `c-${hue} text-c-solid`, className)}
    />
  );
}

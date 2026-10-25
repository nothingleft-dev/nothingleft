'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import {
  ChevronRight,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  Link2,
  MoreHorizontal,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  GitBranch as GitBranchDto,
  GitCommit,
  GitLinkInfo,
  GitProviderKind,
  GitPullRequest,
  IssueDevelopment,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { ConfirmDialog } from '@components/confirm-dialog';
import { EmptyState } from '@components/empty-state';
import { RelativeTime } from '@components/relative-time';
import { GitAuthorAvatar, GitAuthorLine } from '@components/git/git-author';
import { HueChip, HueDot, PullRequestIcon, PullRequestStateChip } from '@components/git/git-marks';
import { ProviderGlyph } from '@components/git/provider-glyph';
import { ThisIsMe } from '@components/git/this-is-me';
import { useIssueDevelopment, usePullRequest, useUnlinkDevelopment } from '@hooks/use-git';
import { formatCount } from '@lib/numbers';
import {
  CI_STATE,
  LINK_SOURCE,
  REVIEWER_STATE,
  capitalize,
  checkTone,
  count,
  elapsed,
  prWord,
  providerLabel,
} from '@lib/git/words';
import { cn } from '@lib/utils';

const FAILED = ['failure', 'timed_out', 'cancelled', 'action_required'];

interface DevelopmentPanelProps {
  issueKey: string;
  projectKey: string;
  canLink: boolean;
  canAdminProject: boolean;
  onLink: () => void;
  timeZone?: string;
}

export function DevelopmentPanel({
  issueKey,
  projectKey,
  canLink,
  canAdminProject,
  onLink,
  timeZone,
}: DevelopmentPanelProps) {
  const development = useIssueDevelopment(issueKey);

  if (development.isPending) return <DevelopmentSkeleton />;
  if (development.isError && !development.data) {
    return (
      <EmptyState
        className="mt-3"
        title="The development panel could not be loaded."
        description={development.error.message}
        action={
          <Button variant="outline" size="sm" onClick={() => void development.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const data = development.data;
  if (!data.git_enabled) {
    return (
      <EmptyState
        className="mt-3"
        title="No repository is linked to this project."
        description={
          canAdminProject
            ? 'Link a GitHub or GitLab repository in project settings, and branches, commits and pull requests that name an issue will show here.'
            : 'A Project Admin can link a GitHub or GitLab repository in project settings; ask yours.'
        }
        action={
          canAdminProject ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${projectKey}/settings?tab=repositories` as Route}>Open repository settings</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  if (data.repositories.length === 0) return <NothingYet issueKey={issueKey} canLink={canLink} onLink={onLink} />;

  return (
    <div className="flex flex-col gap-5 pt-3">
      {data.repositories.map(group => (
        <RepositoryGroup
          key={`${group.repository.provider}:${group.repository.html_url}`}
          group={group}
          issueKey={issueKey}
          canLink={canLink}
          timeZone={timeZone}
        />
      ))}
      {canLink ? (
        <div>
          <Button variant="ghost" size="sm" className="text-text-secondary" onClick={onLink}>
            <Link2 /> Link a pull request
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function NothingYet({ issueKey, canLink, onLink }: { issueKey: string; canLink: boolean; onLink: () => void }) {
  const lower = issueKey.toLowerCase();
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-dashed px-4 py-5">
      <p className="font-medium">No branches, commits or pull requests reference {issueKey} yet.</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-text-secondary">A branch name</dt>
        <dd className="font-mono text-text">feat/{lower}-login-redirect</dd>
        <dt className="text-text-secondary">A commit message</dt>
        <dd className="font-mono text-text">{issueKey}: keep the return path</dd>
        <dt className="text-text-secondary">A pull request</dt>
        <dd className="font-mono text-text">Fixes {issueKey}</dd>
      </dl>
      {canLink ? (
        <div>
          <Button variant="outline" size="sm" onClick={onLink}>
            <Link2 /> Link a pull request
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type Group = IssueDevelopment['repositories'][number];

function RepositoryGroup({
  group,
  issueKey,
  canLink,
  timeZone,
}: {
  group: Group;
  issueKey: string;
  canLink: boolean;
  timeZone?: string;
}) {
  const { repository } = group;
  const provider = repository.provider;
  return (
    <section aria-label={repository.full_name} className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
        <ProviderGlyph provider={provider} className="text-text-muted" />
        <ExternalText href={repository.html_url} className="font-mono text-text">
          {repository.full_name}
        </ExternalText>
      </h3>
      {group.pull_requests.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {group.pull_requests.map(pr => (
            <PullRequestCard key={pr.ref} pr={pr} issueKey={issueKey} canLink={canLink} timeZone={timeZone} />
          ))}
        </ul>
      ) : null}
      {group.branches.length > 0 || group.commits.length > 0 ? (
        <ul className="divide-y divide-border-subtle rounded-md border">
          {group.branches.map(branch => (
            <BranchRow
              key={branch.name}
              branch={branch}
              repositoryUrl={repository.html_url}
              provider={provider}
              issueKey={issueKey}
              canLink={canLink}
            />
          ))}
          {group.commits.map(commit => (
            <CommitRow
              key={commit.sha}
              commit={commit}
              provider={provider}
              issueKey={issueKey}
              canLink={canLink}
              timeZone={timeZone}
              standalone
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// Provider URLs arrive filtered to the connection's host; a null one renders as text.
function ExternalText({ href, className, children }: { href: string | null; className?: string; children: ReactNode }) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={cn('hover:underline', className)}>
      {children}
    </a>
  );
}

function PullRequestCard({
  pr,
  issueKey,
  canLink,
  timeZone,
}: {
  pr: GitPullRequest;
  issueKey: string;
  canLink: boolean;
  timeZone?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = pr.state === 'open' || pr.state === 'draft';
  const provider = pr.repository.provider;
  const word = prWord(provider);
  const commits = pr.commits.filter(c => !c.superseded);
  const when = pr.merged_at ?? pr.closed_at ?? pr.updated_at;
  const verb = pr.merged_at ? 'merged' : pr.closed_at ? 'closed' : 'updated';

  return (
    <li className="rounded-md border">
      <div className="flex items-start gap-2.5 px-3 pt-2.5">
        <PullRequestIcon state={pr.state} className="mt-0.5" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <ExternalText href={pr.html_url} className="font-mono text-xs text-text-secondary">
              {pr.ref}
            </ExternalText>
            <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{pr.title}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <PullRequestStateChip state={pr.state} />
            {pr.link?.intent === 'closes' ? <HueChip hue="gray">Closes {issueKey}</HueChip> : null}
            {pr.is_revert ? <HueChip hue="orange">Revert</HueChip> : null}
            {pr.reverted ? <HueChip hue="orange">Reverted</HueChip> : null}
            {open ? <CiChip pr={pr} /> : null}
            {open && pr.review_state === 'approved' ? <HueChip hue="green">Approved</HueChip> : null}
            {open && pr.review_state === 'changes_requested' ? <HueChip hue="red">Changes requested</HueChip> : null}
          </div>
        </div>
        <CardMenu
          url={pr.html_url}
          provider={provider}
          what={word}
          link={pr.link}
          issueKey={issueKey}
          canLink={canLink}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2 pb-2.5 pl-[38px] text-xs text-text-secondary">
        <span className="inline-flex min-w-0 items-center gap-1 font-mono text-2xs">
          <GitBranch className="size-3 text-text-muted" aria-hidden />
          <span className="truncate">{pr.head_label}</span>
          <span className="text-text-muted">→</span>
          <span>{pr.base_ref}</span>
        </span>
        <GitAuthorLine author={pr.author} provider={provider} />
        <ThisIsMe author={pr.author} provider={provider} repositoryUrl={pr.repository.html_url} />
        {pr.reviewers.length > 0 ? <Reviewers pr={pr} /> : null}
        {pr.additions !== null && pr.deletions !== null ? (
          <span className="font-mono text-2xs tabular">
            <span className="text-success-fg">+{formatCount(pr.additions)}</span>{' '}
            <span className="text-danger-fg">−{formatCount(pr.deletions)}</span>
          </span>
        ) : null}
        <span>
          {verb} <RelativeTime value={when} timeZone={timeZone} />
        </span>
      </div>

      {commits.length > 0 ? (
        <div className="border-t">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded(o => !o)}
            className="flex h-8 w-full items-center gap-1.5 px-3 text-xs text-text-secondary hover:bg-hover hover:text-text"
          >
            <ChevronRight aria-hidden className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
            {count(commits.length, 'commit')}
            {pr.commits_total !== null && pr.commits_total > pr.commits_scanned ? (
              <span className="text-text-muted">
                · {formatCount(pr.commits_scanned)} of {formatCount(pr.commits_total)} commits scanned
              </span>
            ) : null}
          </button>
          {expanded ? (
            <ul className="divide-y divide-border-subtle border-t">
              {commits.map(commit => (
                <CommitRow
                  key={commit.sha}
                  commit={commit}
                  provider={provider}
                  issueKey={issueKey}
                  canLink={canLink}
                  timeZone={timeZone}
                />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Reviewers({ pr }: { pr: GitPullRequest }) {
  const provider = pr.repository.provider;
  return (
    <span className="inline-flex items-center gap-1">
      {pr.reviewers.map((reviewer, i) => {
        const { label, hue } = REVIEWER_STATE[reviewer.state];
        const name = reviewer.author.member?.name ?? (reviewer.author.login ? `@${reviewer.author.login}` : 'Someone');
        return (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <span role="img" className="relative inline-flex cursor-help" aria-label={`${name} ${label}`}>
                <GitAuthorAvatar author={reviewer.author} provider={provider} className="size-5" />
                <HueDot hue={hue} className="absolute -right-0.5 -bottom-0.5 size-2 ring-[1.5px] ring-surface" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {name} {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}

function CiChip({ pr }: { pr: GitPullRequest }) {
  const [open, setOpen] = useState(false);
  const detail = usePullRequest(pr.repository.full_name, pr.number, open);
  const { label, hue } = CI_STATE[pr.ci_state];
  if (pr.ci_state === 'none') return null;
  const failing = FAILED.reduce((n, key) => n + (pr.ci_summary[key] ?? 0), 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="rounded-sm hover:opacity-80" aria-label={`${label}: show checks`}>
          <HueChip hue={hue}>
            {label}
            {pr.ci_state === 'failing' && failing > 0 ? ` · ${failing}` : null}
          </HueChip>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] max-w-[calc(100vw-32px)] p-0">
        <div className="border-b px-3 py-2 text-xs font-medium">Checks on {pr.ref}</div>
        {detail.isPending ? (
          <div className="flex flex-col gap-2 p-3" aria-label="Loading checks">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-3 w-full" />
            ))}
          </div>
        ) : detail.isError ? (
          <p className="px-3 py-3 text-xs text-danger-fg">{detail.error.message}</p>
        ) : detail.data.checks.length === 0 ? (
          <p className="px-3 py-3 text-xs text-text-secondary">No checks have reported on the latest commit.</p>
        ) : (
          <ul className="max-h-72 divide-y divide-border-subtle overflow-y-auto">
            {detail.data.checks.map((check, i) => {
              const tone = checkTone(check.status, check.conclusion);
              const took = elapsed(check.started_at, check.completed_at);
              return (
                <li key={`${check.name}-${i}`} className="flex h-8 items-center gap-2 px-3 text-xs">
                  <HueDot hue={tone.hue} />
                  <span className="min-w-0 flex-1 truncate">{check.name}</span>
                  <span className={cn('text-text-secondary', tone.hue === 'red' && 'text-danger-fg')}>
                    {tone.label}
                  </span>
                  {took ? (
                    <span className="w-14 text-right font-mono text-2xs text-text-muted tabular">{took}</span>
                  ) : null}
                  {check.details_url ? (
                    <a
                      href={check.details_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`Open ${check.name}`}
                      className="text-text-muted hover:text-text"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function BranchRow({
  branch,
  repositoryUrl,
  provider,
  issueKey,
  canLink,
}: {
  branch: GitBranchDto;
  repositoryUrl: string;
  provider: GitProviderKind;
  issueKey: string;
  canLink: boolean;
}) {
  const path = branch.name.split('/').map(encodeURIComponent).join('/');
  // GitLab serves trees under /-/; the bare form is GitHub's.
  const url = repositoryUrl ? `${repositoryUrl}${provider === 'gitlab' ? '/-/tree/' : '/tree/'}${path}` : null;
  return (
    <li className="flex h-9 items-center gap-2.5 px-3 text-xs">
      <GitBranch aria-hidden className="size-icon-sm flex-none text-text-muted" />
      <ExternalText href={branch.deleted ? null : url} className="min-w-0 truncate font-mono text-text">
        {branch.name}
      </ExternalText>
      {branch.deleted ? <span className="text-text-muted">deleted</span> : null}
      {branch.head_sha ? (
        <span className="font-mono text-2xs text-text-muted">{branch.head_sha.slice(0, 7)}</span>
      ) : null}
      <span className="ml-auto flex-none">
        <CardMenu
          url={branch.deleted ? null : url}
          provider={provider}
          what="branch"
          link={branch.link}
          issueKey={issueKey}
          canLink={canLink}
        />
      </span>
    </li>
  );
}

function CommitRow({
  commit,
  provider,
  issueKey,
  canLink,
  timeZone,
  standalone = false,
}: {
  commit: GitCommit;
  provider: GitProviderKind;
  issueKey: string;
  canLink: boolean;
  timeZone?: string;
  standalone?: boolean;
}) {
  return (
    <li className={cn('flex min-h-9 items-center gap-2.5 px-3 py-1.5 text-xs', !standalone && 'pl-[38px]')}>
      {standalone ? <GitCommitHorizontal aria-hidden className="size-icon-sm flex-none text-text-muted" /> : null}
      <ExternalText href={commit.html_url} className="flex-none font-mono text-2xs text-text-secondary">
        {commit.short_sha}
      </ExternalText>
      <span className="min-w-0 flex-1 truncate text-text" title={commit.subject}>
        {commit.subject}
      </span>
      <GitAuthorLine
        author={commit.author}
        provider={provider}
        className="flex-none text-text-secondary max-sm:hidden"
      />
      <RelativeTime value={commit.committed_at} timeZone={timeZone} className="flex-none" />
      {standalone ? (
        <CardMenu
          url={commit.html_url}
          provider={provider}
          what="commit"
          link={commit.link}
          issueKey={issueKey}
          canLink={canLink}
        />
      ) : null}
    </li>
  );
}

function CardMenu({
  url,
  provider,
  what,
  link,
  issueKey,
  canLink,
}: {
  url: string | null;
  provider: GitProviderKind;
  what: string;
  link: GitLinkInfo | null;
  issueKey: string;
  canLink: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const unlink = useUnlinkDevelopment(issueKey);
  const canUnlink = canLink && link !== null;
  if (!url && !canUnlink) return null;
  const manual = link?.sources.length === 1 && link.sources[0] === 'manual';
  const from = link ? link.sources.map(s => LINK_SOURCE[s]).join(', ') : null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`${capitalize(what)} actions`} className="text-text-muted">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {url ? (
            <DropdownMenuItem asChild>
              <a href={url} target="_blank" rel="noreferrer noopener">
                <ExternalLink /> Open on {providerLabel(provider)}
              </a>
            </DropdownMenuItem>
          ) : null}
          {url && canUnlink ? <DropdownMenuSeparator /> : null}
          {canUnlink ? (
            <DropdownMenuItem onSelect={() => setConfirming(true)}>
              <Unlink /> Unlink from {issueKey}
            </DropdownMenuItem>
          ) : null}
          {from ? <p className="px-2 pt-1.5 pb-1 text-2xs text-text-muted">Linked from {from}</p> : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {link ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`Unlink this ${what} from ${issueKey}?`}
          confirmLabel="Unlink"
          destructive={false}
          pending={unlink.isPending}
          onConfirm={() =>
            unlink
              .mutateAsync(link.link_id)
              .then(
                () => toast.success(`Unlinked from ${issueKey}.`),
                (error: Error) => toast.error(error.message),
              )
              .finally(() => setConfirming(false))
          }
        >
          <p>It leaves the Development tab and the badge for everyone, and the history records who unlinked it.</p>
          <p>
            {manual
              ? 'It was linked by hand, so it stays unlinked.'
              : 'The same reference will not bring it back. A new reference — a later commit naming it — will link it again.'}
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function DevelopmentSkeleton() {
  return (
    <div className="flex flex-col gap-2 pt-3" role="status" aria-label="Loading development">
      <Skeleton className="h-3 w-40" />
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border px-3 py-3">
          <div className="flex items-center gap-2">
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="flex gap-2 pl-6">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

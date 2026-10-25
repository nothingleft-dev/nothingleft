'use client';

import { useState } from 'react';
import { ChevronRight, ExternalLink, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { GitConnection, GitEventStatus, GitWebhookEvent } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Checkbox } from '@components/ui/checkbox';
import { Label } from '@components/ui/label';
import { Skeleton } from '@components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@components/ui/sheet';
import { EmptyState } from '@components/empty-state';
import { FormAlert } from '@components/auth/form-alert';
import { JobStatus, type JobTone } from '@components/job-status';
import { RelativeTime } from '@components/relative-time';
import { Segmented } from '@components/segmented';
import { GIT_PAGE, useGitEvent, useGitEvents, useReplayGitEvent } from '@hooks/use-git';
import { EVENT_STATUS, eventReason, providerLabel } from '@lib/git/words';
import { formatCount } from '@lib/numbers';
import { cn } from '@lib/utils';

const TONE: Record<GitEventStatus, JobTone> = { pending: 'waiting', done: 'done', ignored: 'idle', failed: 'failed' };

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'done', label: 'Done' },
  { value: 'pending', label: 'Pending' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

interface DeliveryLogProps {
  slug: string;
  connection: GitConnection | null;
  repository?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeliveryLog({ slug, connection, repository, open, onOpenChange }: DeliveryLogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-2xl">
        {connection && open ? <Log slug={slug} connection={connection} repository={repository ?? null} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function Log({ slug, connection, repository }: { slug: string; connection: GitConnection; repository: string | null }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [offset, setOffset] = useState(0);
  const events = useGitEvents(slug, {
    connection: connection.name,
    ...(repository ? { repository } : {}),
    ...(filter === 'all' ? {} : { status: filter }),
    offset,
  });
  const rows = events.data?.data ?? [];
  const total = events.data?.meta.pagination?.total ?? rows.length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle>Delivery log</SheetTitle>
        <SheetDescription>
          Every webhook {connection.account.login} on {providerLabel(connection.provider)} delivered
          {repository ? ` for ${repository}` : ''} in the last 7 days, and what was done with it.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-wrap items-center gap-3 border-b px-5 py-2.5">
        <Segmented
          ariaLabel="Delivery status"
          value={filter}
          options={FILTERS}
          onChange={next => {
            setFilter(next);
            setOffset(0);
          }}
        />
        {connection.redelivery_url ? (
          <a
            href={connection.redelivery_url}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text hover:underline"
          >
            Not here? Redeliver from {providerLabel(connection.provider)} <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {events.isPending ? (
          <LogSkeleton />
        ) : events.isError && !events.data ? (
          <div className="p-5">
            <FormAlert title="The delivery log could not be loaded.">
              <button type="button" onClick={() => void events.refetch()}>
                Try again
              </button>
            </FormAlert>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={
                filter === 'all' ? 'No deliveries in the last 7 days.' : `No ${filter} deliveries in the last 7 days.`
              }
              description={
                filter === 'all'
                  ? 'A push, a pull request or a check on a linked repository arrives here within seconds.'
                  : 'Show all to see every delivery.'
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rows.map(event => (
              <EventRow key={event.id} slug={slug} event={event} />
            ))}
          </ul>
        )}
      </div>
      {total > GIT_PAGE ? (
        <div className="flex items-center gap-2 border-t px-5 py-2.5 text-xs text-text-secondary">
          {formatCount(offset + 1)}–{formatCount(Math.min(offset + GIT_PAGE, total))} of {formatCount(total)}
          <Button
            variant="outline"
            size="xs"
            className="ml-auto"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - GIT_PAGE))}
          >
            Newer
          </Button>
          <Button
            variant="outline"
            size="xs"
            disabled={offset + GIT_PAGE >= total}
            onClick={() => setOffset(offset + GIT_PAGE)}
          >
            Older
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function EventRow({ slug, event }: { slug: string; event: GitWebhookEvent }) {
  const [open, setOpen] = useState(false);
  const reason = eventReason(event.error);
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="grid w-full grid-cols-[14px_92px_minmax(0,1fr)_auto] items-center gap-x-3 px-5 py-2 text-left hover:bg-hover"
      >
        <ChevronRight
          aria-hidden
          className={cn('size-3.5 text-text-muted transition-transform', open && 'rotate-90')}
        />
        <JobStatus tone={TONE[event.status]} label={EVENT_STATUS[event.status]} className="text-xs" />
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <span className="font-mono text-xs">{event.event}</span>
            {event.repository ? <span className="truncate text-text-secondary">{event.repository}</span> : null}
          </span>
          {reason ? (
            <span
              className={cn('truncate text-xs', event.status === 'failed' ? 'text-danger-fg' : 'text-text-secondary')}
            >
              {reason}
            </span>
          ) : null}
        </span>
        <RelativeTime value={event.received_at} className="text-xs whitespace-nowrap" />
      </button>
      {open ? <EventDetail slug={slug} event={event} /> : null}
    </li>
  );
}

function EventDetail({ slug, event }: { slug: string; event: GitWebhookEvent }) {
  const detail = useGitEvent(slug, event.id);
  const replay = useReplayGitEvent(slug);
  const [runAutomations, setRunAutomations] = useState(false);

  return (
    <div className="flex flex-col gap-3 bg-app px-5 py-3 pl-12">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        <dt className="text-text-muted">Delivery</dt>
        <dd className="font-mono text-text-secondary [overflow-wrap:anywhere]">{event.delivery_id}</dd>
        <dt className="text-text-muted">Attempts</dt>
        <dd className="text-text-secondary tabular">{event.attempts}</dd>
        {event.processed_at ? (
          <>
            <dt className="text-text-muted">Finished</dt>
            <dd>
              <RelativeTime value={event.processed_at} className="text-text-secondary" />
            </dd>
          </>
        ) : null}
        {event.run_automations ? (
          <>
            <dt className="text-text-muted">Automations</dt>
            <dd className="text-text-secondary">ran on this delivery</dd>
          </>
        ) : null}
      </dl>

      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-xs font-medium text-text-secondary">
          Payload
          {event.truncated ? <span className="font-normal text-warning-fg">kept in part: it was over 1 MB</span> : null}
        </span>
        {detail.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : detail.isError ? (
          <p className="text-xs text-danger-fg">{detail.error.message}</p>
        ) : (
          // The provider's text is untrusted: shown as data, never parsed into markup.
          <pre className="max-h-72 overflow-auto rounded-md border bg-surface p-3 font-mono text-2xs leading-4 whitespace-pre text-text-secondary">
            {JSON.stringify(detail.data.payload, null, 2)}
          </pre>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={replay.isPending}
          onClick={() =>
            replay.mutate(
              { id: event.id, runAutomations },
              {
                onSuccess: () => toast.success('Redelivered. It is processed again in a few seconds.'),
                onError: error => toast.error(error.message),
              },
            )
          }
        >
          <RotateCcw /> {replay.isPending ? 'Redelivering…' : 'Redeliver'}
        </Button>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`replay-automations-${event.id}`}
            checked={runAutomations}
            onCheckedChange={value => setRunAutomations(value === true)}
          />
          <Label htmlFor={`replay-automations-${event.id}`} className="text-xs font-normal text-text-secondary">
            Also run automations
          </Label>
        </div>
        {runAutomations ? (
          <p className="w-full text-xs text-warning-fg">
            Rules may change issue statuses again. Only what this delivery changes counts: a pull request already
            recorded as merged does not count as merged twice. Needs Project Admin in every project it touches.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function LogSkeleton() {
  return (
    <div className="divide-y divide-border-subtle" role="status" aria-label="Loading deliveries">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-4 px-5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="ml-auto h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

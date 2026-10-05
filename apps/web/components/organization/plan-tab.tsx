'use client';

import { PLAN_PRESETS, type Organization } from '@nothingleft/types';
import { SettingsSection } from '@components/settings/section';
import { cn } from '@lib/utils';

const PLAN_LABELS: Record<keyof typeof PLAN_PRESETS, string> = {
  free: 'Free',
  pro: 'Pro',
  pro_lite: 'Pro Lite',
  unlimited: 'Unlimited',
};

const gb = (bytes: number) => `${Math.round(bytes / 1024 / 1024 / 1024)}GB`;

export function PlanTab({ organization }: { organization: Organization }) {
  const preset = PLAN_PRESETS[organization.plan];
  const { seats } = organization;
  const share = seats.free === null ? 0 : Math.min(1, seats.used / seats.free);

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection
        title={`You are on ${PLAN_LABELS[organization.plan]}`}
        description="Read-only. There is no billing code in this product and no way to pay for anything yet."
      >
        <div className="flex flex-col gap-3 rounded-md border bg-surface p-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-xs text-text-secondary">Members</span>
            <span className="font-mono tabular text-xs text-text-muted">
              {seats.used} of {seats.free === null ? 'unlimited' : seats.free} free
            </span>
          </div>

          {seats.free === null ? null : (
            <div className="h-1 w-full overflow-hidden rounded-full bg-inset">
              <div
                className={cn('h-full rounded-full', seats.over > 0 ? 'bg-warning-fg' : 'bg-ink')}
                style={{ width: `${Math.max(share * 100, 2)}%` }}
              />
            </div>
          )}

          <p className="text-xs leading-5 text-text-muted">
            {seats.free === null
              ? 'This plan has no seat limit.'
              : seats.over > 0
                ? `${seats.over} beyond the free allowance. Nothing is blocked and nothing is degraded — no read-only mode, no countdown, no feature withheld.`
                : `${seats.free} members are free permanently. Going past that is allowed; you would simply see a notice.`}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection
        title="What this plan includes"
        description="Limits are environment configuration, so a self-hosted install sets its own."
      >
        <dl className="grid gap-x-8 gap-y-2 text-xs sm:grid-cols-2">
          <Row term="Free members" value={preset.seats === null ? 'Unlimited' : String(preset.seats)} />
          <Row term="File storage" value={gb(preset.storage_bytes)} />
          <Row term="Projects" value="Unlimited" />
          <Row term="Issues, boards, reports" value="All of them" />
          <Row term="MCP and the API" value="No separate tier" />
          <Row term="Cost" value="Nothing, and no card on file" />
        </dl>
      </SettingsSection>

      <SettingsSection title="When billing arrives" description="Stated in the product, so it has to be honoured.">
        <p className="max-w-prose text-xs leading-5 text-text-secondary">
          Seats past the first twenty will cost around $5 per user per month once billing launches, and we will give
          plenty of notice first. Organisations that exist before then keep their first twenty seats free.
        </p>
      </SettingsSection>
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle py-1.5">
      <dt className="text-text-secondary">{term}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}

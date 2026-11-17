'use client';

import { PLAN_PRESETS, type Organization } from '@nothingleft/types';
import { formatBytes } from '@nothingleft/format';
import { SettingsSection } from '@components/settings/section';

export const PLAN_LABELS: Record<keyof typeof PLAN_PRESETS, string> = {
  free: 'Free',
  pro: 'Pro',
  pro_lite: 'Pro Lite',
  unlimited: 'Unlimited',
};

const limit = (value: number | null) => (value === null ? 'Unlimited' : String(value));

export function PlanTab({ organization }: { organization: Organization }) {
  const preset = PLAN_PRESETS[organization.plan];
  const { seats } = organization;

  return (
    <div className="flex flex-col gap-5">
      <SettingsSection title="Your plan">
        <div className="flex flex-col gap-0.5">
          <p className="text-xl font-semibold tracking-tight">{PLAN_LABELS[organization.plan]}</p>
          <p className="text-sm text-text-secondary">Nothing to pay and no card on file.</p>
        </div>

        <div className="flex max-w-xl flex-col gap-2 pt-2">
          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="font-medium text-text-secondary">Members</span>
            <span className="tabular text-text">
              {seats.free === null ? `${seats.used} · no limit` : `${seats.used} of ${seats.free} free seats in use`}
            </span>
          </div>
          {seats.free === null ? null : <SeatMeter used={seats.used} free={seats.free} />}
          <p className="text-sm text-pretty text-text-secondary">
            {seats.free === null
              ? 'This plan has no seat limit.'
              : seats.over > 0
                ? `${seats.over} past the free ${seats.free}. Nothing is blocked or degraded: no read-only mode, no countdown, no feature withheld.`
                : `The first ${seats.free} members are free. Adding more is never blocked.`}
          </p>
        </div>
      </SettingsSection>

      <SettingsSection title="What this plan includes">
        <dl className="grid max-w-4xl gap-x-10 text-sm sm:grid-cols-2">
          <Row term="Free members" value={limit(seats.free)} />
          <Row term="File storage" value={formatBytes(organization.storage.limit_bytes)} />
          <Row term="Git connections" value={limit(preset.git_connections)} />
          <Row term="Repositories per project" value={limit(preset.git_repositories_per_project)} />
          <Row term="Automations per project" value={limit(preset.automations_per_project)} />
          <Row term="Projects" value="Unlimited" />
          <Row term="Issues, boards, reports" value="Included" />
          <Row term="MCP and the API" value="Included" />
        </dl>
      </SettingsSection>

      <SettingsSection title="When billing arrives">
        <p className="max-w-[72ch] text-sm text-pretty text-text-secondary">
          Seats past the first twenty will cost around $5 per user per month once billing launches, and we will give
          plenty of notice first. Organisations that exist before then keep their first twenty seats free.
        </p>
      </SettingsSection>
    </div>
  );
}

/** Free seats in ink; seats past them continue the bar in amber, so the overage has its own length. */
function SeatMeter({ used, free }: { used: number; free: number }) {
  const total = Math.max(used, free);
  const within = Math.min(used, free);
  const over = Math.max(0, used - free);
  return (
    <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-border" aria-hidden>
      <div className="h-full bg-ink" style={{ width: `${Math.max((within / total) * 100, 2)}%` }} />
      {over > 0 ? <div className="h-full flex-1 bg-warning-fg" /> : null}
    </div>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex h-9 items-center justify-between gap-4 border-b border-border-subtle">
      <dt className="text-text-secondary">{term}</dt>
      <dd className="text-text tabular">{value}</dd>
    </div>
  );
}

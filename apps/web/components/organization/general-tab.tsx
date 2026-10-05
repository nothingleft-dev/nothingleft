'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Organization } from '@nothingleft/types';
import { parseDuration } from '@nothingleft/format';
import { Button } from '@components/ui/button';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { SettingsSection } from '@components/settings/section';
import { ChoiceSelect, type ChoiceOption } from '@components/choice-select';
import { useApiError } from '@hooks/use-api-error';
import { useUpdateOrganization } from '@hooks/use-organizations';
import { formatDate } from '@lib/datetime';
import { PersonName } from '@components/former-member-chip';

type WeekStart = '0' | '1' | '2' | '3' | '4' | '5' | '6';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function hoursAndMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours}h` : '', remainder ? `${remainder}m` : ''].filter(Boolean).join(' ') || '0m';
}

const WEEK_START_OPTIONS: ChoiceOption<WeekStart>[] = DAYS.map((label, index) => ({
  value: String(index) as WeekStart,
  label,
  hint: index === 1 ? 'ISO-8601, and what most of the world reports on.' : `Weeks and sprints start on ${label}.`,
}));

export function GeneralTab({ organization, isAdmin }: { organization: Organization; isAdmin: boolean }) {
  const [name, setName] = useState(organization.name);
  const [slug, setSlug] = useState(organization.slug);
  const [workday, setWorkday] = useState(hoursAndMinutes(organization.workday_minutes));
  const [workweek, setWorkweek] = useState(String(organization.workweek_days));
  const [weekStart, setWeekStart] = useState<WeekStart>(String(organization.week_starts_on) as WeekStart);

  const update = useUpdateOrganization(organization.slug);
  const error = useApiError(update.error);

  const workdayMinutes = parseDuration(workday);
  const workweekDays = Number(workweek);
  const workdayBad = workdayMinutes === null || workdayMinutes < 1;
  const workweekBad = !Number.isInteger(workweekDays) || workweekDays < 1 || workweekDays > 7;

  const dirty =
    name !== organization.name ||
    slug !== organization.slug ||
    workdayMinutes !== organization.workday_minutes ||
    workweekDays !== organization.workweek_days ||
    Number(weekStart) !== organization.week_starts_on;

  return (
    <div className="flex flex-col gap-5">
      {error.summary ? <FormAlert title={error.summary} /> : null}

      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={event => {
          event.preventDefault();
          if (workdayBad || workweekBad) return;
          update.mutate(
            {
              name,
              slug,
              workday_minutes: workdayMinutes,
              workweek_days: workweekDays,
              week_starts_on: Number(weekStart),
            },
            { onSuccess: () => toast.success('Organisation saved.') },
          );
        }}
      >
        <SettingsSection title="Identity" description="Your workspace name and unique organisation ID.">
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              value={name}
              disabled={!isAdmin}
              error={error.fields['name']}
              onChange={e => setName(e.target.value)}
            />
            <Field
              label="Organisation ID"
              className="font-mono"
              value={slug}
              disabled={!isAdmin}
              error={error.fields['slug']}
              hint="Used to identify this workspace. Changing it breaks existing links and integrations that use the old ID."
              onChange={e => setSlug(e.target.value)}
            />
          </div>
        </SettingsSection>

        <SettingsSection title="Working time" description="Set how days and weeks translate into time estimates.">
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <Field
              label="Hours in a workday"
              className="font-mono tabular"
              value={workday}
              disabled={!isAdmin}
              error={workdayBad ? 'Write it as a duration: 8h, or 7h 30m.' : error.fields['workday_minutes']}
              hint={workdayBad ? undefined : `1d = ${hoursAndMinutes(workdayMinutes)}.`}
              onChange={e => setWorkday(e.target.value)}
            />
            <Field
              label="Days in a working week"
              className="font-mono tabular"
              inputMode="numeric"
              value={workweek}
              disabled={!isAdmin}
              error={workweekBad ? 'A number from 1 to 7.' : error.fields['workweek_days']}
              hint={
                workweekBad || workdayBad
                  ? undefined
                  : `1w = ${workweekDays} ${workweekDays === 1 ? 'day' : 'days'} (${hoursAndMinutes(workdayMinutes * workweekDays)}).`
              }
              onChange={e => setWorkweek(e.target.value)}
            />
          </div>
          <div className="max-w-[260px]">
            <ChoiceSelect
              label="Week starts on"
              value={weekStart}
              options={WEEK_START_OPTIONS}
              onChange={setWeekStart}
              disabled={!isAdmin}
            />
          </div>
        </SettingsSection>

        {isAdmin ? (
          <Button type="submit" disabled={!dirty || update.isPending} className="self-start">
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        ) : (
          <p className="text-xs text-text-muted">Only an Org Admin can change these.</p>
        )}
      </form>

      <SettingsSection title="Owner" description="The one role that cannot be changed from this screen.">
        <p className="text-xs text-text-secondary">
          <PersonName person={organization.owner} className="font-medium text-text" />{' '}
          <span className="font-mono text-text-muted">@{organization.owner.username}</span> · created{' '}
          {formatDate(organization.created_at)}
        </p>
      </SettingsSection>
    </div>
  );
}

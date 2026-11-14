'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { UpdateOrganizationSchema, type Organization } from '@nothingleft/types';
import { parseDuration } from '@nothingleft/format';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { SettingsSection } from '@components/settings/section';
import { ChoiceSelect, type ChoiceOption } from '@components/choice-select';
import { useApiError } from '@hooks/use-api-error';
import { useUpdateOrganization } from '@hooks/use-organizations';
import { formatDate } from '@lib/datetime';
import { PersonName } from '@components/former-member-chip';
import { PendingButton } from '@components/pending-button';
import { plural } from '@lib/numbers';
import { useFieldProblems } from '@hooks/use-field-problems';

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
  const error = useApiError(update.error, ['name', 'slug', 'workday_minutes', 'workweek_days']);
  const local = useFieldProblems(UpdateOrganizationSchema, { name: 'Name', slug: 'Organisation ID' });

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

  if (!isAdmin) return <ReadOnlyGeneral organization={organization} />;

  return (
    <div className="flex flex-col gap-5">
      <OwnerSection organization={organization} />
      {error.summary ? <FormAlert title="The organisation was not saved.">{error.summary}</FormAlert> : null}

      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={event => {
          event.preventDefault();
          if (!local.check({ name, slug }) || workdayBad || workweekBad) return;
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
              error={local.problems['name'] ?? error.fields['name']}
              onChange={e => {
                setName(e.target.value);
                local.clear('name');
              }}
            />
            <Field
              label="Organisation ID"
              className="font-mono"
              value={slug}
              error={local.problems['slug'] ?? error.fields['slug']}
              hint="Used to identify this workspace. Changing it breaks existing links and integrations that use the old ID."
              onChange={e => {
                setSlug(e.target.value);
                local.clear('slug');
              }}
            />
          </div>
        </SettingsSection>

        <SettingsSection title="Working time" description="Set how days and weeks translate into time estimates.">
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <Field
              label="Hours in a workday"
              className="font-mono tabular"
              value={workday}
              error={workdayBad ? 'Write it as a duration: 8h, or 7h 30m.' : error.fields['workday_minutes']}
              hint={workdayBad ? undefined : `1d = ${hoursAndMinutes(workdayMinutes)}.`}
              onChange={e => setWorkday(e.target.value)}
            />
            <Field
              label="Days in a working week"
              className="font-mono tabular"
              inputMode="numeric"
              value={workweek}
              error={workweekBad ? 'A number from 1 to 7.' : error.fields['workweek_days']}
              hint={
                workweekBad || workdayBad
                  ? undefined
                  : `1w = ${plural(workweekDays, 'day')} (${hoursAndMinutes(workdayMinutes * workweekDays)}).`
              }
              onChange={e => setWorkweek(e.target.value)}
            />
            <ChoiceSelect
              label="Week starts on"
              value={weekStart}
              options={WEEK_START_OPTIONS}
              onChange={setWeekStart}
            />
          </div>
        </SettingsSection>

        <PendingButton
          type="submit"
          disabled={!dirty}
          className="self-start"
          pending={update.isPending}
          pendingLabel="Saving…"
        >
          Save changes
        </PendingButton>
      </form>
    </div>
  );
}

function OwnerSection({ organization }: { organization: Organization }) {
  return (
    <SettingsSection title="Owner" description="The one role that cannot be changed from this screen.">
      <p className="text-sm text-text-secondary">
        <PersonName person={organization.owner} className="font-medium text-text" />{' '}
        <span className="font-mono text-xs">@{organization.owner.username}</span> · created{' '}
        {formatDate(organization.created_at)}
      </p>
    </SettingsSection>
  );
}

function ReadOnlyGeneral({ organization }: { organization: Organization }) {
  const day = organization.workday_minutes;
  const week = organization.workweek_days;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-text-secondary">Only an Org Admin can change these settings.</p>
      <SettingsSection title="Identity">
        <Facts
          rows={[
            ['Name', organization.name],
            [
              'Organisation ID',
              <span key="slug" className="font-mono text-xs">
                {organization.slug}
              </span>,
            ],
            [
              'Owner',
              <Fragment key="owner">
                <PersonName person={organization.owner} />{' '}
                <span className="font-mono text-xs text-text-secondary">@{organization.owner.username}</span>
              </Fragment>,
            ],
            ['Created', formatDate(organization.created_at)],
          ]}
        />
      </SettingsSection>
      <SettingsSection title="Working time">
        <Facts
          rows={[
            ['Hours in a workday', hoursAndMinutes(day)],
            ['Days in a working week', `${plural(week, 'day')} (${hoursAndMinutes(day * week)})`],
            ['Week starts on', DAYS[organization.week_starts_on] ?? ''],
          ]}
        />
      </SettingsSection>
    </div>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid max-w-xl grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <dt className="font-medium text-text-secondary">{label}</dt>
          <dd className="min-w-0 break-words text-text">{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

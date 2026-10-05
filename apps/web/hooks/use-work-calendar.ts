'use client';

import { DEFAULT_WORK_CALENDAR, type WorkCalendar, type WorkWeek } from '@nothingleft/format';
import { DEFAULT_WEEK_STARTS_ON } from '@nothingleft/types';
import { useOrganization } from '@hooks/use-organizations';
import { useSession } from '@hooks/use-session';

function useCurrentOrganization() {
  const session = useSession();
  const slug = session.status === 'signed-in' ? session.user.current_organization_slug : null;
  return useOrganization(slug);
}

/** The current organisation's workday and workweek, which is what `1d` and `1w` mean. */
export function useWorkCalendar(): WorkCalendar {
  const organization = useCurrentOrganization();
  if (!organization.data) return DEFAULT_WORK_CALENDAR;
  return { workdayMinutes: organization.data.workday_minutes, workweekDays: organization.data.workweek_days };
}

/** Which days a date range logs time on. */
export function useWorkWeek(): WorkWeek {
  const organization = useCurrentOrganization();
  return {
    workweekDays: organization.data?.workweek_days ?? DEFAULT_WORK_CALENDAR.workweekDays,
    weekStartsOn: organization.data?.week_starts_on ?? DEFAULT_WEEK_STARTS_ON,
  };
}

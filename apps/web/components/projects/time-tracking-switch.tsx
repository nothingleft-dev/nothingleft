'use client';

import { useId } from 'react';
import { toast } from 'sonner';
import type { Project } from '@nothingleft/types';
import { Switch } from '@components/ui/switch';
import { useUpdateProject } from '@hooks/use-projects';
import { toastError } from '@components/toast-error';
import { RowChip } from '@components/projects/value-row';

export function TimeTrackingSwitch({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const id = useId();
  const update = useUpdateProject(project.key);
  const enabled =
    update.isPending && update.variables
      ? Boolean(update.variables.time_tracking_enabled)
      : project.time_tracking_enabled;

  return (
    <section className="flex flex-col gap-2 border-b pb-5">
      {canEdit ? (
        <div className="flex items-center gap-3">
          <Switch
            id={id}
            checked={enabled}
            disabled={update.isPending}
            aria-describedby={`${id}-hint`}
            onCheckedChange={checked =>
              update.mutate(
                { time_tracking_enabled: checked },
                {
                  onSuccess: () => toast.success(checked ? 'Time tracking turned on' : 'Time tracking turned off'),
                  onError: error =>
                    toastError(checked ? 'Could not turn time tracking on' : 'Could not turn time tracking off', error),
                },
              )
            }
          />
          <label htmlFor={id} className="font-semibold">
            Time tracking
          </label>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Time tracking</h2>
          <RowChip>{enabled ? 'On' : 'Off'}</RowChip>
        </div>
      )}
      <p id={`${id}-hint`} className="text-sm text-text-secondary">
        {enabled
          ? 'People log spent time on this project’s issues, and each issue shows its estimate against the time spent.'
          : `Estimation, Spent time and logging are hidden on this project’s issues. Time already logged is kept, and comes back when ${canEdit ? 'you turn this on' : 'it is turned on'}.`}
      </p>
    </section>
  );
}

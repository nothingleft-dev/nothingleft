'use client';

import { useId } from 'react';
import { toast } from 'sonner';
import type { Project } from '@nothingleft/types';
import { Switch } from '@components/ui/switch';
import { useUpdateProject } from '@hooks/use-projects';

export function TimeTrackingSwitch({ project, canEdit }: { project: Project; canEdit: boolean }) {
  const id = useId();
  const update = useUpdateProject(project.key);
  const enabled =
    update.isPending && update.variables
      ? Boolean(update.variables.time_tracking_enabled)
      : project.time_tracking_enabled;

  return (
    <section className="flex flex-col gap-2 border-b pb-5">
      <div className="flex items-center gap-3">
        <Switch
          id={id}
          checked={enabled}
          disabled={!canEdit || update.isPending}
          aria-describedby={`${id}-hint`}
          onCheckedChange={checked =>
            update.mutate(
              { time_tracking_enabled: checked },
              {
                onSuccess: () => toast.success(checked ? 'Time tracking turned on' : 'Time tracking turned off'),
                onError: error => toast.error(error.message),
              },
            )
          }
        />
        <label htmlFor={id} className="font-medium">
          Time tracking
        </label>
      </div>
      <p id={`${id}-hint`} className="text-sm text-text-secondary">
        {enabled
          ? 'People log spent time on this project’s issues, and each issue shows its estimate against the time spent.'
          : 'Estimation, Spent time and logging are hidden on this project’s issues. Time already logged is kept, and comes back when you turn this on.'}
      </p>
      {!canEdit ? (
        <p className="text-xs text-text-muted">
          {project.is_archived ? 'The project is archived.' : 'Only a Project Admin can change this.'}
        </p>
      ) : null}
    </section>
  );
}

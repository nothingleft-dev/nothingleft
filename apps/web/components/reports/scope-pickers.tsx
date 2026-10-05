'use client';

import { ReportMultiPicker, ReportPicker } from '@components/reports/report-picker';
import { useProjects } from '@hooks/use-projects';
import { useSavedViews } from '@hooks/use-saved-views';

const splitList = (value: string) => (value ? value.split(',').filter(Boolean) : []);

export function ProjectsPicker({ value, onChange }: { value: string; onChange: (value: string | null) => void }) {
  const projects = useProjects();
  const options = (projects.data ?? []).map(p => ({ value: p.key, label: p.name }));
  return (
    <ReportMultiPicker
      label="Projects"
      values={splitList(value)}
      options={options}
      loading={projects.isPending}
      searchable={options.length > 8}
      onChange={keys => onChange(keys.length ? keys.join(',') : null)}
      none="All projects"
      many={n => `${n} projects`}
      clearLabel="All projects"
    />
  );
}

export function ProjectPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const projects = useProjects();
  return (
    <ReportPicker
      label="Project"
      value={value}
      fallback={value || 'Choose one'}
      options={(projects.data ?? []).map(p => ({ value: p.key, label: p.name }))}
      loading={projects.isPending}
      searchable={(projects.data?.length ?? 0) > 8}
      onChange={onChange}
    />
  );
}

const VISIBILITY_GROUP = { private: 'Only you', project: 'Project', org: 'Organisation' } as const;

export function ViewPicker({
  value,
  project,
  onChange,
}: {
  value: string;
  project?: string;
  onChange: (value: string | null) => void;
}) {
  const views = useSavedViews();
  const options = [
    { value: '', label: 'None' },
    ...(views.data ?? [])
      .filter(v => !project || v.project === null || v.project.key === project)
      .map(v => ({ value: v.name, label: v.name, group: VISIBILITY_GROUP[v.visibility] })),
  ];
  return (
    <ReportPicker
      label="View"
      value={value}
      fallback={value || 'None'}
      options={options}
      loading={views.isPending}
      searchable={options.length > 8}
      onChange={v => onChange(v || null)}
    />
  );
}

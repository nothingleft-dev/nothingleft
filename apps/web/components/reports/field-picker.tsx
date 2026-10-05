'use client';

import { ReportPicker, type ReportOption } from '@components/reports/report-picker';
import { useScopeGroupFields, useScopeProjects } from '@hooks/use-report-scope';
import { GROUP_CHOICES, GROUP_LABELS } from '@lib/issue-list/groups';

const splitList = (value: string) => (value ? value.split(',').filter(Boolean) : []);

/** The fields the issue list groups by, plus the groupable custom fields of the projects in scope. */
export function FieldPicker({
  label,
  value,
  projects,
  withNone = false,
  onChange,
}: {
  label: string;
  value: string;
  /** The report's `projects` parameter: whose custom fields to offer. */
  projects: string;
  withNone?: boolean;
  onChange: (value: string) => void;
}) {
  const scope = useScopeProjects(splitList(projects));
  const custom = useScopeGroupFields(scope.keys);
  const options: ReportOption[] = [
    ...GROUP_CHOICES.filter(c => withNone || c !== 'none').map(c => ({ value: c, label: GROUP_LABELS[c] })),
    ...custom.fields.map(f => ({ value: `custom:${f.slug}`, label: f.name, group: 'Custom fields' })),
  ];
  return (
    <ReportPicker
      label={label}
      value={value}
      fallback={value.startsWith('custom:') ? value.slice('custom:'.length) : value}
      options={options}
      searchable={options.length > 12}
      onChange={onChange}
    />
  );
}

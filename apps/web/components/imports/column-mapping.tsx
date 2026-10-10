'use client';

import { IMPORT_FIELDS, type CustomField } from '@nothingleft/types';
import { ReportPicker, type ReportOption } from '@components/reports/report-picker';
import { FIELD_LABELS, fieldLabel } from '@components/imports/import-results';

const SKIP = '';
const SAMPLES_SHOWN = 3;

interface ColumnMappingProps {
  headers: string[];
  sample: string[][];
  /** Issue field (or `custom:<slug>`) → header, the API's direction. */
  mapping: Record<string, string>;
  customFields: CustomField[];
  fieldsLoading: boolean;
  onChange: (mapping: Record<string, string>) => void;
  disabled?: boolean;
}

/** One row per column of the file; a field can take one column, so choosing it again moves it. */
export function ColumnMapping({
  headers,
  sample,
  mapping,
  customFields,
  fieldsLoading,
  onChange,
  disabled,
}: ColumnMappingProps) {
  const fieldOf = new Map(Object.entries(mapping).map(([field, header]) => [header, field]));
  const options: ReportOption[] = [
    { value: SKIP, label: 'Don’t import' },
    ...IMPORT_FIELDS.map(f => ({
      value: f,
      label: f === 'title' ? `${FIELD_LABELS[f]} (required)` : FIELD_LABELS[f],
      group: 'Issue fields',
    })),
    ...customFields
      .filter(f => !f.is_archived)
      .map(f => ({ value: `custom:${f.slug}`, label: f.name, group: 'Custom fields' })),
  ];

  const choose = (header: string, field: string) => {
    const next = Object.fromEntries(Object.entries(mapping).filter(([f, h]) => h !== header && f !== field));
    if (field !== SKIP) next[field] = header;
    onChange(next);
  };

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-[720px] table-fixed text-sm">
        <thead className="bg-app text-left text-2xs text-text-secondary">
          <tr>
            <th className="h-7 w-[28%] px-3 font-medium">Column in the file</th>
            <th className="px-3 font-medium">First rows</th>
            <th className="w-64 px-3 font-medium">Imports as</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {headers.map((header, index) => {
            const field = fieldOf.get(header) ?? SKIP;
            const values = sample
              .map(row => row[index]?.trim() ?? '')
              .filter(Boolean)
              .slice(0, SAMPLES_SHOWN);
            return (
              <tr key={`${header}:${index}`} className="h-row">
                <td className="truncate px-3 font-medium" title={header}>
                  {header || <span className="text-text-muted">Untitled column {index + 1}</span>}
                </td>
                <td className="truncate px-3 text-text-secondary" title={values.join(' · ')}>
                  {values.length > 0 ? (
                    values.join(' · ')
                  ) : (
                    <span className="text-text-muted">Empty in the first rows</span>
                  )}
                </td>
                <td className="px-3">
                  <ReportPicker
                    label=""
                    value={field}
                    fallback={fieldLabel(field)}
                    options={options}
                    onChange={next => choose(header, next)}
                    loading={fieldsLoading}
                    searchable
                    width="w-64"
                    disabled={disabled}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const hasTitle = (mapping: Record<string, string>) => typeof mapping.title === 'string';

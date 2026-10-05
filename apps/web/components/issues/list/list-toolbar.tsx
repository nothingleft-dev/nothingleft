'use client';

import { ChevronDown, Download } from 'lucide-react';
import { Button } from '@components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import type { ColumnDef, ColumnId, CustomColumn } from '@lib/issue-list/columns';
import type { GroupChoice } from '@lib/issue-list/url-state';
import { GROUP_CHOICES, GROUP_LABELS, type BuiltinGroup } from '@lib/issue-list/groups';

interface ListToolbarProps {
  total: number | null;
  group: GroupChoice;
  onGroup: (group: GroupChoice) => void;
  columns: readonly ColumnId[];
  onColumns: (columns: readonly ColumnId[]) => void;
  /** Every column this list can draw, custom fields included. */
  columnDefs: readonly ColumnDef[];
  /** Custom fields a list can group by: select, multi-select, user, multi-user and checkbox. */
  groupFields: readonly CustomColumn[];
  /** The active saved view dictates the columns; the menu explains rather than edits. */
  columnsFromView: boolean;
  onExport: () => void;
  exporting: boolean;
  leading?: React.ReactNode;
}

export function ListToolbar({
  total,
  group,
  onGroup,
  columns,
  onColumns,
  columnsFromView,
  columnDefs,
  groupFields,
  onExport,
  exporting,
  leading,
}: ListToolbarProps) {
  const groupLabel = group.startsWith('custom:')
    ? (groupFields.find(f => `custom:${f.slug}` === group)?.name ?? group.slice('custom:'.length))
    : GROUP_LABELS[group as BuiltinGroup];
  const builtinColumns = columnDefs.filter(c => !c.fieldType);
  const customColumns = columnDefs.filter(c => c.fieldType);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {leading}
      {total !== null ? (
        <span className="text-xs tabular text-text-muted">
          {total} {total === 1 ? 'issue' : 'issues'}
        </span>
      ) : null}
      <span className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="xs" className="gap-1.5 font-normal text-text-secondary">
            Group by <span className="max-w-40 truncate font-medium text-text">{groupLabel}</span>
            <ChevronDown className="size-3 text-text-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[70vh] w-52 overflow-y-auto">
          <DropdownMenuRadioGroup value={group} onValueChange={value => onGroup(value as GroupChoice)}>
            {GROUP_CHOICES.map(choice => (
              <DropdownMenuRadioItem key={choice} value={choice}>
                {GROUP_LABELS[choice]}
              </DropdownMenuRadioItem>
            ))}
            {groupFields.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-2xs font-normal text-text-muted">Custom fields</DropdownMenuLabel>
                {groupFields.map(field => (
                  <DropdownMenuRadioItem key={field.slug} value={`custom:${field.slug}`}>
                    <span className="truncate">{field.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </>
            ) : null}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="xs" className="gap-1.5 font-normal text-text-secondary max-md:hidden">
            Columns
            <ChevronDown className="size-3 text-text-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-[70vh] w-56 overflow-y-auto">
          {columnsFromView ? (
            <>
              <DropdownMenuLabel className="text-2xs font-normal text-text-muted">
                Set by the active view. Edit the view to change them.
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          ) : null}
          {[builtinColumns, customColumns].map((list, section) =>
            list.length === 0 ? null : (
              <div key={section}>
                {section === 1 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-2xs font-normal text-text-muted">
                      Custom fields
                    </DropdownMenuLabel>
                  </>
                ) : null}
                {list.map(column => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={columns.includes(column.id)}
                    disabled={columnsFromView}
                    onSelect={event => event.preventDefault()}
                    onCheckedChange={checked =>
                      onColumns(checked ? [...columns, column.id] : columns.filter(c => c !== column.id))
                    }
                  >
                    <span className="truncate">{column.label}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </div>
            ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon-xs" aria-label="Export CSV" onClick={onExport} disabled={exporting}>
            <Download className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{exporting ? 'Preparing the file…' : 'Export this list as CSV'}</TooltipContent>
      </Tooltip>
    </div>
  );
}

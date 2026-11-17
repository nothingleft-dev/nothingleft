'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { ChevronDown, Download, Upload } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Skeleton } from '@components/ui/skeleton';
import { PendingButton } from '@components/pending-button';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/tooltip';
import type { ColumnDef, ColumnId, CustomColumn } from '@lib/issue-list/columns';
import type { GroupChoice } from '@lib/issue-list/url-state';
import { GROUP_CHOICES, GROUP_LABELS, type BuiltinGroup } from '@lib/issue-list/groups';
import { plural } from '@lib/numbers';
import { cn } from '@lib/utils';

interface ListToolbarProps {
  total: number | null;
  /** The first page is on its way: the count holds its place. */
  loading?: boolean;
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
  /** Only for a Project Admin on a project's own list. */
  importHref?: string | undefined;
  /** Saved-view tabs, between the count and the controls, so their late arrival moves nothing below. */
  tabs?: React.ReactNode;
  /** Off when there is nothing to list: the controls stay in place, disabled, so the page below never moves. */
  controls?: boolean;
}

export function ListToolbar({
  total,
  loading = false,
  group,
  onGroup,
  columns,
  onColumns,
  columnsFromView,
  columnDefs,
  groupFields,
  onExport,
  exporting,
  importHref,
  tabs,
  controls = true,
}: ListToolbarProps) {
  const groupLabel = group.startsWith('custom:')
    ? (groupFields.find(f => `custom:${f.slug}` === group)?.name ?? group.slice('custom:'.length))
    : GROUP_LABELS[group as BuiltinGroup];
  const builtinColumns = columnDefs.filter(c => !c.fieldType);
  const customColumns = columnDefs.filter(c => c.fieldType);
  return (
    // As tall as the tab strip, so tabs arriving after the list move nothing.
    <div className="flex flex-wrap items-center gap-2 md:min-h-[30px]">
      {total !== null ? (
        <span className="text-xs tabular text-text-muted">{plural(total, 'issue')}</span>
      ) : loading ? (
        <Skeleton className="h-3 w-16" />
      ) : null}
      {tabs ? (
        <>
          {total !== null || loading ? <span aria-hidden className="mx-1 h-4 w-px bg-border max-md:hidden" /> : null}
          <div className="min-w-0 flex-1 max-md:order-last max-md:basis-full md:mr-2">{tabs}</div>
        </>
      ) : (
        <span className="flex-1" />
      )}
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="xs"
              disabled={!controls}
              className="gap-1.5 font-normal text-text-secondary max-md:ml-auto"
            >
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
            <Button
              variant="outline"
              size="xs"
              disabled={!controls}
              className="gap-1.5 font-normal text-text-secondary max-md:hidden"
            >
              Columns
              <ChevronDown className="size-3 text-text-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[70vh] w-56 overflow-y-auto">
            <DropdownMenuLabel className="text-2xs font-normal text-text-secondary">
              {columnsFromView
                ? 'Set by the active view. Edit the view to change them.'
                : 'Always shown: priority, type, key, title.'}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
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
                      <span className="truncate">{column.name ?? column.label}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {importHref ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="outline" size="xs" className="gap-1.5 font-normal text-text-secondary">
                <Link href={importHref as Route} aria-label="Import issues from CSV">
                  <Upload className="size-3.5" />
                  <span className="max-md:hidden">Import</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Import issues from CSV</TooltipContent>
          </Tooltip>
        ) : null}

        <Tooltip>
          <TooltipTrigger asChild>
            <PendingButton
              variant="outline"
              size="xs"
              aria-label="Export CSV"
              onClick={onExport}
              pending={exporting}
              disabled={!controls}
              pendingLabel={
                <>
                  <Download className="size-3.5" />
                  <span className="max-md:hidden">Exporting…</span>
                </>
              }
              className={cn('font-normal text-text-secondary', exporting && 'disabled:opacity-100')}
            >
              <Download className="size-3.5" />
              <span className="max-md:hidden">Export</span>
            </PendingButton>
          </TooltipTrigger>
          <TooltipContent side="bottom">{exporting ? 'Preparing the file…' : 'Export this list as CSV'}</TooltipContent>
        </Tooltip>
      </>
    </div>
  );
}

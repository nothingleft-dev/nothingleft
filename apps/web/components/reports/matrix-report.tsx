'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from 'recharts';
import type { MatrixReport as Matrix, ReportGroup } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { FieldPicker } from '@components/reports/field-picker';
import { ReportFrame } from '@components/reports/report-frame';
import { DrillLink, plural, scopeText, ToggleGroup } from '@components/reports/report-bits';
import { useReportState } from '@components/reports/report-state';
import {
  AXIS_TICK,
  CategoryTick,
  ChartLegend,
  ChartTooltipBody,
  HatchDefs,
  Swatch,
  svgFill,
  svgOpacity,
} from '@components/reports/chart/chart-parts';
import { useReport } from '@hooks/use-reports';
import { groupFieldLabel } from '@lib/issue-list/groups';
import { listHref } from '@lib/issue-list/links';
import { markPaint } from '@lib/reports/colors';
import { cn } from '@lib/utils';

const HEAT_STEPS = 5;
const heatStep = (count: number, max: number) =>
  count === 0 || max === 0 ? 0 : Math.min(HEAT_STEPS, Math.ceil((count / max) * HEAT_STEPS));

/** How a cell shows its size: a grey shade, or a hairline bar whose length follows the count. */
type CellStyle = 'shade' | 'length';

type CellMap = Map<string, { count: number; query: string | null }>;
const cellKey = (row: number, column: number) => `${row}:${column}`;

export function MatrixReport() {
  const state = useReportState('matrix');
  const result = useReport('matrix', state.query);
  const chart = state.params.get('chart') === 'stacked' ? 'stacked' : 'table';
  const cellStyle: CellStyle = state.params.get('cells') === 'length' ? 'length' : 'shade';
  const rowField = state.get('row_field');
  const columnField = state.get('column_field');
  const projects = state.get('projects');

  return (
    <ReportFrame
      state={state}
      result={result}
      scope={{ query: true, projects: true }}
      controls={
        <>
          <FieldPicker label="Rows" value={rowField} projects={projects} onChange={v => state.set({ row_field: v })} />
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Swap rows and columns"
            onClick={() => state.set({ row_field: columnField, column_field: rowField })}
          >
            <ArrowLeftRight className="size-3.5" />
          </Button>
          <FieldPicker
            label="Columns"
            value={columnField}
            projects={projects}
            onChange={v => state.set({ column_field: v })}
          />
        </>
      }
      display={
        <>
          {chart === 'table' ? (
            <ToggleGroup
              label="Cells"
              value={cellStyle}
              options={[
                { value: 'shade', label: 'Shade' },
                { value: 'length', label: 'Length' },
              ]}
              onChange={v => state.set({ cells: v === 'length' ? 'length' : null })}
            />
          ) : null}
          <ToggleGroup
            label="Chart"
            value={chart}
            options={[
              { value: 'table', label: 'Table' },
              { value: 'stacked', label: 'Stacked' },
            ]}
            onChange={v => state.set({ chart: v === 'stacked' ? 'stacked' : null })}
          />
        </>
      }
      skeleton="grid"
      summary={d =>
        `${plural(d.total_issues, 'issue')} ${scopeText(d.scope)}.${
          d.multi_valued
            ? ' An issue with more than one value counts in each of its cells, so the cells can add up to more than the totals.'
            : ''
        }`
      }
    >
      {d => (chart === 'stacked' ? <MatrixStacked data={d} /> : <MatrixTable data={d} cellStyle={cellStyle} />)}
    </ReportFrame>
  );
}

function useCells(data: Matrix): CellMap {
  return useMemo(() => new Map(data.cells.map(c => [cellKey(c.row, c.column), c])), [data.cells]);
}

function AxisLabel({ group, palette }: { group: ReportGroup; palette: Matrix['rows']['palette'] }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Swatch paint={markPaint(group, palette)} />
      <DrillLink query={group.query} className="truncate">
        {group.label}
      </DrillLink>
    </span>
  );
}

interface Hover {
  row: number;
  column: number;
  x: number;
  y: number;
}

function MatrixTable({ data, cellStyle }: { data: Matrix; cellStyle: CellStyle }) {
  const cells = useCells(data);
  const [hover, setHover] = useState<Hover | null>(null);
  const hovered = hover ? cells.get(cellKey(hover.row, hover.column)) : undefined;

  return (
    <div className="relative">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-separate border-spacing-0 text-sm tabular">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 h-9 min-w-44 border-b bg-surface px-3 text-left text-xs font-normal text-text-muted">
                {groupFieldLabel(data.rows.field)} ↓ · {groupFieldLabel(data.columns.field)} →
              </th>
              {data.columns.groups.map((g, j) => (
                <th
                  key={j}
                  className="h-9 max-w-40 min-w-22 border-b px-2 text-center text-xs font-medium whitespace-nowrap text-text-secondary"
                >
                  <span className="inline-flex max-w-36 items-center">
                    <AxisLabel group={g} palette={data.columns.palette} />
                  </span>
                </th>
              ))}
              <th className="h-9 min-w-18 border-b border-l px-3 text-right text-xs font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.groups.map((row, i) => (
              <tr key={i}>
                <th className="sticky left-0 z-10 h-9 max-w-64 border-b border-border-subtle bg-surface px-3 text-left font-normal">
                  <AxisLabel group={row} palette={data.rows.palette} />
                </th>
                {data.columns.groups.map((_, j) => {
                  const cell = cells.get(cellKey(i, j));
                  const count = cell?.count ?? 0;
                  const step = heatStep(count, data.max_cell);
                  const body = (
                    <span
                      className={cn(
                        'flex h-[34px] flex-col items-center justify-center gap-[3px] rounded-xs',
                        cellStyle === 'shade' && step > 0 && `heat-${step}`,
                        cell?.query && 'hover:outline-[1.5px] hover:outline-text hover:-outline-offset-[1.5px]',
                      )}
                    >
                      {count > 0 ? count : ''}
                      {cellStyle === 'length' && count > 0 ? (
                        <i
                          aria-hidden
                          className="block h-[3px] rounded-full bg-text-muted"
                          style={{ width: Math.max(3, Math.round((count / data.max_cell) * 56)) }}
                        />
                      ) : null}
                    </span>
                  );
                  return (
                    <td
                      key={j}
                      className="h-9 border-b border-border-subtle p-px"
                      onPointerEnter={event => {
                        if (count === 0) return setHover(null);
                        const box = event.currentTarget.getBoundingClientRect();
                        const frame = event.currentTarget.closest('.relative')!.getBoundingClientRect();
                        setHover({
                          row: i,
                          column: j,
                          x: box.left - frame.left + box.width / 2,
                          y: box.top - frame.top,
                        });
                      }}
                      onPointerLeave={() => setHover(null)}
                    >
                      {cell?.query ? (
                        <Link
                          href={listHref(cell.query)}
                          aria-label={`${row.label} × ${data.columns.groups[j]!.label}: ${plural(count, 'issue')}`}
                        >
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </td>
                  );
                })}
                <td className="h-9 border-b border-l border-border-subtle px-3 text-right font-semibold">
                  <DrillLink query={row.query}>{row.count}</DrillLink>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="sticky left-0 z-10 h-9 bg-surface px-3 text-left font-semibold">Total</th>
              {data.columns.groups.map((g, j) => (
                <td key={j} className="h-9 px-2 text-center font-semibold">
                  <DrillLink query={g.query}>{g.count}</DrillLink>
                </td>
              ))}
              <td className="h-9 border-l px-3 text-right font-semibold">{data.total_issues}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {hover && hovered ? (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full pb-1.5"
          style={{ left: hover.x, top: hover.y }}
        >
          <ChartTooltipBody
            title={`${data.rows.groups[hover.row]!.label} × ${data.columns.groups[hover.column]!.label}`}
            rows={[]}
            note={`${plural(hovered.count, 'issue')}${hovered.query ? ' · click to open them' : ''}`}
          />
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-1.5 text-xs text-text-secondary" aria-hidden>
        {cellStyle === 'shade' ? (
          <>
            Fewer
            {Array.from({ length: HEAT_STEPS }, (_, k) => (
              <i key={k} className={cn('inline-block h-3 w-5 rounded-[2px]', `heat-${k + 1}`)} />
            ))}
            More
          </>
        ) : (
          <>The bar under each count is its share of the largest cell, {data.max_cell}.</>
        )}
        {data.rows.truncated || data.columns.truncated ? (
          <span className="ml-3">Beyond 50 values a side, the rest are added up as Other.</span>
        ) : null}
      </div>
    </div>
  );
}

function MatrixStacked({ data }: { data: Matrix }) {
  const router = useRouter();
  const cells = useCells(data);
  const rows = data.rows.groups.map((g, i) => ({
    label: g.label,
    ...Object.fromEntries(data.columns.groups.map((_, j) => [`c${j}`, cells.get(cellKey(i, j))?.count ?? 0])),
  }));
  const paints = data.columns.groups.map(g => markPaint(g, data.columns.palette));

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend items={data.columns.groups.map((g, j) => ({ key: `c${j}`, label: g.label, paint: paints[j]! }))} />
      <BarChart
        layout="vertical"
        data={rows}
        responsive
        style={{ width: '100%', height: rows.length * 32 + 36 }}
        margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
        barCategoryGap={8}
        accessibilityLayer
      >
        <HatchDefs />
        <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
        <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={176}
          tick={<CategoryTick />}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: 'var(--bg-hover)' }}
          isAnimationActive={false}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <ChartTooltipBody
                title={String(label)}
                rows={payload
                  .filter(p => Number(p.value) > 0)
                  .map(p => {
                    const j = Number(String(p.dataKey).slice(1));
                    return {
                      key: String(p.dataKey),
                      paint: paints[j]!,
                      value: String(p.value),
                      label: data.columns.groups[j]!.label,
                    };
                  })}
              />
            ) : null
          }
        />
        {data.columns.groups.map((_, j) => (
          <Bar
            key={j}
            dataKey={`c${j}`}
            stackId="matrix"
            maxBarSize={20}
            fill={svgFill(paints[j]!)}
            fillOpacity={svgOpacity(paints[j]!)}
            stroke="var(--bg-surface)"
            strokeWidth={1}
            isAnimationActive={false}
          >
            {data.rows.groups.map((_, i) => {
              const query = cells.get(cellKey(i, j))?.query ?? null;
              return (
                <Cell
                  key={i}
                  cursor={query ? 'pointer' : 'default'}
                  onClick={() => query && router.push(listHref(query))}
                />
              );
            })}
          </Bar>
        ))}
      </BarChart>
    </div>
  );
}

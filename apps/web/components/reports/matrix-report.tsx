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
import {
  DrillLink,
  HueNote,
  isPeopleField,
  PersonMark,
  personOf,
  plural,
  scopeText,
  ToggleGroup,
} from '@components/reports/report-bits';
import { useReportState } from '@components/reports/report-state';
import {
  AXIS_TICK,
  CategoryTick,
  peopleByLabel,
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
import { HEAT_FILLS, markPaint } from '@lib/reports/colors';
import { cn } from '@lib/utils';
import { ProjectMarkByKey } from '@components/projects/project-mark';
import { EDGE_END, EDGE_START, useScrollEdges } from '@components/reports/scroll-edges';

const HEAT_STEPS = HEAT_FILLS.length;
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
        `${plural(d.total_issues, 'issue')} ${scopeText(d.scope, Boolean(state.get('projects')))}.${
          d.multi_valued
            ? ' An issue with more than one value counts in each of its cells, so the cells can add up to more than the totals.'
            : ''
        }`
      }
    >
      {d => (
        <>
          {chart === 'stacked' ? <MatrixStacked data={d} /> : <MatrixTable data={d} cellStyle={cellStyle} />}
          <HueNote groups={[...d.rows.groups, ...d.columns.groups]} />
        </>
      )}
    </ReportFrame>
  );
}

function useCells(data: Matrix): CellMap {
  return useMemo(() => new Map(data.cells.map(c => [cellKey(c.row, c.column), c])), [data.cells]);
}

function AxisLabel({
  group,
  palette,
  people,
  wrap = false,
}: {
  group: ReportGroup;
  palette: Matrix['rows']['palette'];
  people: boolean;
  /** A column heading: the mark above the name, which takes two lines before it is shortened. */
  wrap?: boolean;
}) {
  const person = personOf(group, people);
  // A person's column reads `Casey M.`, so every heading takes one line; the picture and tooltip say who.
  const label = wrap && person && !person.nobody ? shortName(group.label) : group.label;
  return (
    <span
      className={cn('inline-flex min-w-0 items-center', wrap ? 'flex-col gap-1 text-center' : 'gap-1.5')}
      title={group.label}
    >
      {/* A series swatch keys nothing in a table; status, category and project colours are the meaning. */}
      {palette === 'series' ? null : <Swatch paint={markPaint(group, palette)} />}
      {palette === 'project' && group.value ? <ProjectMarkByKey projectKey={group.value} /> : null}
      {person ? <PersonMark name={group.label} {...person} small={!wrap} /> : null}
      <DrillLink query={group.query} className={wrap ? 'line-clamp-2 max-w-full' : 'truncate'}>
        {label}
      </DrillLink>
    </span>
  );
}

const shortName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? name : `${parts[0]} ${parts.at(-1)!.charAt(0)}.`;
};

interface Hover {
  row: number;
  column: number;
  x: number;
  y: number;
}

// One width for every value column, so equal counts sit in equal cells and a shade compares by value alone.
const LABEL_PX = 176;
const VALUE_PX = 96;
const TOTAL_PX = 80;

function MatrixTable({ data, cellStyle }: { data: Matrix; cellStyle: CellStyle }) {
  const cells = useCells(data);
  const [hover, setHover] = useState<Hover | null>(null);
  const hovered = hover ? cells.get(cellKey(hover.row, hover.column)) : undefined;
  const { ref: scroller, edges, measure } = useScrollEdges();
  const startEdge = cn('sticky left-0 z-10 border-r bg-surface', edges.start && EDGE_START);
  const endEdge = cn('sticky right-0 z-10 border-l bg-surface', edges.end && EDGE_END);
  const columnPeople = isPeopleField(data.columns.field, data.columns.groups);
  const rowPeople = isPeopleField(data.rows.field, data.rows.groups);

  return (
    <div className="relative">
      <div ref={scroller} onScroll={measure} className="overflow-x-auto overscroll-x-contain rounded-md border">
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-sm [&_td]:tabular"
          style={{ minWidth: LABEL_PX + data.columns.groups.length * VALUE_PX + TOTAL_PX }}
        >
          <colgroup>
            <col className="w-44 max-sm:w-32" />
            {data.columns.groups.map((_, j) => (
              <col key={j} />
            ))}
            <col style={{ width: TOTAL_PX }} />
          </colgroup>
          <thead>
            <tr>
              <th
                className={cn(
                  startEdge,
                  'h-11 border-b px-3 pt-2 text-left align-top text-xs font-normal text-text-muted',
                )}
              >
                {groupFieldLabel(data.rows.field)} ↓ · {groupFieldLabel(data.columns.field)} →
              </th>
              {data.columns.groups.map((g, j) => (
                <th
                  key={j}
                  className="h-11 border-b px-2 pt-2 pb-2 text-center align-top text-xs font-medium text-text-secondary"
                >
                  <span className="inline-flex max-w-full items-center justify-center">
                    <AxisLabel group={g} palette={data.columns.palette} people={columnPeople} wrap />
                  </span>
                </th>
              ))}
              <th className={cn(endEdge, 'h-11 border-b px-3 pt-2 text-right align-top text-xs font-semibold')}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.groups.map((row, i) => (
              <tr key={i}>
                <th className={cn(startEdge, 'h-9 border-b border-b-border-subtle px-3 text-left font-normal')}>
                  <AxisLabel group={row} palette={data.rows.palette} people={rowPeople} />
                </th>
                {data.columns.groups.map((_, j) => {
                  const cell = cells.get(cellKey(i, j));
                  const count = cell?.count ?? 0;
                  const step = heatStep(count, data.max_cell);
                  const body = (
                    <span
                      className={cn(
                        'flex h-[34px] flex-col items-center justify-center gap-[3px] rounded-xs',
                        cell?.query && 'hover:outline-[1.5px] hover:outline-text hover:-outline-offset-[1.5px]',
                      )}
                      style={cellStyle === 'shade' && step > 0 ? { background: HEAT_FILLS[step - 1] } : undefined}
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
                <td className={cn(endEdge, 'h-9 border-b border-b-border-subtle px-3 text-right font-semibold')}>
                  <DrillLink query={row.query}>{row.count}</DrillLink>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className={cn(startEdge, 'h-9 px-3 text-left font-semibold')}>Total</th>
              {data.columns.groups.map((g, j) => (
                <td key={j} className="h-9 px-2 text-center font-semibold">
                  <DrillLink query={g.query}>{g.count}</DrillLink>
                </td>
              ))}
              <td className={cn(endEdge, 'h-9 px-3 text-right font-semibold')}>{data.total_issues}</td>
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
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
        {cellStyle === 'shade' ? (
          <span className="inline-flex items-center gap-1.5" aria-hidden>
            Issues per cell
            <span className="ml-1 tabular">1</span>
            {HEAT_FILLS.map(fill => (
              <i
                key={fill}
                className="inline-block h-3 w-5 rounded-[2px] border border-border-strong"
                style={{ background: fill }}
              />
            ))}
            <span className="tabular">{data.max_cell}</span>
          </span>
        ) : (
          <span>The bar under each count is its share of the largest cell, {data.max_cell}.</span>
        )}
        {data.rows.field === data.columns.field && !data.multi_valued ? (
          <span>Rows and columns are the same field, so only the diagonal can hold issues.</span>
        ) : null}
        {data.rows.truncated || data.columns.truncated ? (
          <span>Beyond 50 values a side, the rest are added up as Other.</span>
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
  const columnPeople = isPeopleField(data.columns.field, data.columns.groups);
  const rowPeople = isPeopleField(data.rows.field, data.rows.groups);
  const rowPerson = new Map(data.rows.groups.map(g => [g.label, personOf(g, rowPeople)]));

  return (
    <div className="flex flex-col gap-3">
      <ChartLegend
        items={data.columns.groups.map((g, j) => ({
          key: `c${j}`,
          label: g.label,
          paint: paints[j]!,
          person: personOf(g, columnPeople),
        }))}
      />
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
          tick={
            <CategoryTick
              people={peopleByLabel(data.rows.groups, rowPeople)}
              links={
                new Map(
                  data.rows.groups.map(g => [
                    g.label,
                    { paint: data.rows.palette === 'series' ? null : markPaint(g, data.rows.palette), query: g.query },
                  ]),
                )
              }
            />
          }
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
                titlePerson={rowPerson.get(String(label))}
                rows={payload
                  .filter(p => Number(p.value) > 0)
                  .map(p => {
                    const j = Number(String(p.dataKey).slice(1));
                    return {
                      key: String(p.dataKey),
                      paint: paints[j]!,
                      value: String(p.value),
                      label: data.columns.groups[j]!.label,
                      person: personOf(data.columns.groups[j]!, columnPeople),
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

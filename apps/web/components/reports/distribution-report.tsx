'use client';

import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { DistributionReport as Distribution, ReportGroup } from '@nothingleft/types';
import { FieldPicker } from '@components/reports/field-picker';
import { ReportFrame } from '@components/reports/report-frame';
import { DrillLink, plural, scopeText, SwitchParam, ToggleGroup, formatCount } from '@components/reports/report-bits';
import { useReportState } from '@components/reports/report-state';
import {
  AXIS_TICK,
  CategoryTick,
  ChartTooltipBody,
  HatchDefs,
  Swatch,
  svgFill,
  svgOpacity,
} from '@components/reports/chart/chart-parts';
import { useReport } from '@hooks/use-reports';
import { listHref } from '@lib/issue-list/links';
import { markPaint, type MarkPaint } from '@lib/reports/colors';

type DistributionName = Distribution['report'];

interface Row {
  key: string;
  label: string;
  count: number;
  share: number;
  query: string | null;
  paint: MarkPaint;
  other: boolean;
}

const rowsOf = (data: Distribution): Row[] =>
  data.groups.map((g: ReportGroup, i) => ({
    key: `${g.value ?? g.label}-${i}`,
    label: g.other && data.other ? `${g.label} · ${plural(data.other.groups, 'value')}` : g.label,
    count: g.count,
    share: g.share,
    query: g.query,
    paint: markPaint(g, data.palette),
    other: g.other,
  }));

const NOUN: Record<string, string> = { assignee: 'assignee', tag: 'tag' };

/** The arithmetic of a multi-valued field, stated so the bars do not look wrong. */
function countingNote(data: Distribution) {
  if (data.total_counted === data.total_issues) return null;
  const noun = NOUN[data.field] ?? 'value';
  const n = data.multi_valued_issues;
  return `${formatCount(n)} ${n === 1 ? 'has' : 'have'} more than one ${noun}, so the bars add up to ${formatCount(data.total_counted)}.`;
}

export function DistributionReport({ name }: { name: DistributionName }) {
  const state = useReportState(name);
  const result = useReport(name, state.query);
  const chart = state.params.get('chart') === 'pie' ? 'pie' : 'bar';
  const field = state.get('field');
  const byCategory = state.get('by_category') === 'true';
  const data = result.data;

  const controls = (
    <>
      {name === 'issues-per-field' ? (
        <FieldPicker
          label="Field"
          value={field}
          projects={state.get('projects')}
          onChange={value => state.set({ field: value, by_category: null })}
        />
      ) : null}
      {name === 'issues-per-field' && field === 'status' && (byCategory || data?.by_category_available) ? (
        <ToggleGroup
          label="Group statuses"
          value={byCategory ? 'true' : 'false'}
          options={[
            { value: 'false', label: 'Statuses' },
            { value: 'true', label: 'Categories' },
          ]}
          onChange={v => state.set({ by_category: v })}
        />
      ) : null}
      {name === 'issues-per-assignee' ? (
        <SwitchParam
          label="Include unassigned"
          checked={state.get('include_unassigned') === 'true'}
          onChange={checked => state.set({ include_unassigned: String(checked) })}
        />
      ) : null}
    </>
  );

  return (
    <ReportFrame
      state={state}
      result={result}
      scope={{ query: true, projects: true }}
      controls={controls}
      display={
        <ToggleGroup
          label="Chart"
          value={chart}
          options={[
            { value: 'bar', label: 'Bar' },
            { value: 'pie', label: 'Pie' },
          ]}
          onChange={v => state.set({ chart: v === 'pie' ? 'pie' : null })}
        />
      }
      skeleton="bars"
      summary={d => (
        <>
          {plural(d.total_issues, 'issue')} {scopeText(d.scope)}.{countingNote(d) ? ` ${countingNote(d)}` : null}
        </>
      )}
    >
      {d => {
        const rows = rowsOf(d);
        return (
          <>
            {chart === 'pie' ? (
              <div className="grid items-start gap-8 md:grid-cols-[288px_minmax(0,1fr)]">
                <DistributionPie rows={rows} total={d.total_counted} />
                <DistributionTable rows={rows} total={d.total_counted} truncated={d.truncated} />
              </div>
            ) : (
              <>
                <DistributionBars rows={rows} />
                <DistributionTable rows={rows} total={d.total_counted} truncated={d.truncated} />
              </>
            )}
          </>
        );
      }}
    </ReportFrame>
  );
}

function RowTooltip({ row }: { row: Row }) {
  return (
    <ChartTooltipBody
      rows={[{ key: row.key, paint: row.paint, value: formatCount(row.count), label: row.label }]}
      note={`${row.share}% of the total${row.query ? ' · click to open the issues' : ''}`}
    />
  );
}

export function DistributionBars({ rows }: { rows: readonly Row[] }) {
  const router = useRouter();
  const open = (row: Row) => row.query && router.push(listHref(row.query));
  return (
    <BarChart
      layout="vertical"
      data={rows as Row[]}
      responsive
      style={{ width: '100%', height: rows.length * 32 + 36 }}
      margin={{ top: 4, right: 48, bottom: 4, left: 8 }}
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
        content={({ active, payload }) =>
          active && payload?.[0] ? <RowTooltip row={payload[0].payload as Row} /> : null
        }
      />
      <Bar dataKey="count" maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
        {rows.map(row => (
          <Cell
            key={row.key}
            fill={svgFill(row.paint)}
            fillOpacity={svgOpacity(row.paint)}
            cursor={row.query ? 'pointer' : 'default'}
            onClick={() => open(row)}
          />
        ))}
        <LabelList dataKey="count" position="right" fill="var(--text-secondary)" fontSize={12} />
      </Bar>
    </BarChart>
  );
}

function DistributionPie({ rows, total }: { rows: readonly Row[]; total: number }) {
  const router = useRouter();
  return (
    <div className="relative mx-auto size-[288px]">
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-2xl font-semibold tracking-tight">{formatCount(total)}</p>
          <p className="text-xs text-text-secondary">counted</p>
        </div>
      </div>
      <PieChart responsive style={{ width: 288, height: 288 }} accessibilityLayer>
        <HatchDefs />
        <Pie
          data={rows as Row[]}
          dataKey="count"
          nameKey="label"
          innerRadius={84}
          outerRadius={136}
          startAngle={90}
          endAngle={-270}
          stroke="var(--bg-surface)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {rows.map(row => (
            <Cell
              key={row.key}
              fill={svgFill(row.paint)}
              fillOpacity={svgOpacity(row.paint)}
              cursor={row.query ? 'pointer' : 'default'}
              onClick={() => row.query && router.push(listHref(row.query))}
            />
          ))}
        </Pie>
        <Tooltip
          isAnimationActive={false}
          content={({ active, payload }) =>
            active && payload?.[0] ? <RowTooltip row={payload[0].payload as Row} /> : null
          }
        />
      </PieChart>
    </div>
  );
}

export function DistributionTable({
  rows,
  total,
  truncated,
  valueLabel = 'Issues',
}: {
  rows: readonly Row[];
  total: number;
  truncated: boolean;
  valueLabel?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular">
        <thead>
          <tr className="h-8 border-b text-left text-xs text-text-secondary">
            <th className="font-medium">Value</th>
            <th className="w-28 text-right font-medium">{valueLabel}</th>
            <th className="w-28 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="h-row border-b border-border-subtle">
              <td className="max-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  <Swatch paint={row.paint} />
                  <DrillLink query={row.query} className="truncate">
                    {row.label}
                  </DrillLink>
                </span>
              </td>
              <td className="text-right">
                <DrillLink query={row.query}>{formatCount(row.count)}</DrillLink>
              </td>
              <td className="text-right text-text-secondary">{row.share}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="h-row font-medium">
            <td>Total</td>
            <td className="text-right">{formatCount(total)}</td>
            <td className="text-right text-text-secondary">100%</td>
          </tr>
        </tfoot>
      </table>
      {truncated ? (
        <p className="mt-2 text-xs text-text-secondary">
          Only the first 500 groups are listed; the total counts them all.
        </p>
      ) : null}
    </div>
  );
}

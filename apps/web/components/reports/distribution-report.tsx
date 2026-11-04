'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { Cell, Pie, PieChart, Tooltip } from 'recharts';
import type { DistributionReport as Distribution, ReportGroup } from '@nothingleft/types';
import { StatRow, type Stat } from '@components/dashboard/stat-row';
import { ProjectMarkByKey } from '@components/projects/project-mark';
import { BarTable } from '@components/reports/bar-table';
import { FieldPicker } from '@components/reports/field-picker';
import { ReportFrame } from '@components/reports/report-frame';
import {
  DrillLink,
  HueNote,
  PersonMark,
  plural,
  scopeText,
  SwitchParam,
  ToggleGroup,
  formatCount,
} from '@components/reports/report-bits';
import { useReportState } from '@components/reports/report-state';
import { ChartTooltipBody, HatchDefs, Swatch, svgFill, svgOpacity } from '@components/reports/chart/chart-parts';
import { useReport } from '@hooks/use-reports';
import { listHref } from '@lib/issue-list/links';
import { markPaint, OTHER_FILL, type MarkPaint } from '@lib/reports/colors';

type DistributionName = Distribution['report'];

interface Row {
  key: string;
  label: string;
  amount: number;
  share: number;
  query: string | null;
  paint: MarkPaint;
  /** Without a series of its own: one slice of the pie's Other. */
  folded: boolean;
  person?: { avatarUrl: string | null; nobody: boolean };
  projectKey?: string;
}

type Sort = 'count' | 'name';

/** Person-valued groups carry a picture; their empty group is the person nobody. */
const isPeople = (data: Distribution) => data.field === 'assignee' || data.groups.some(g => g.avatar_url !== null);

function rowsOf(data: Distribution, sort: Sort): Row[] {
  const people = isPeople(data);
  const rows = data.groups.map((g: ReportGroup, i) => ({
    key: `${g.value ?? g.label}-${i}`,
    label: g.label,
    amount: g.count,
    share: g.share,
    query: g.query,
    paint: markPaint(g, data.palette),
    folded: data.palette === 'series' && g.series === null,
    ...(people ? { person: { avatarUrl: g.avatar_url, nobody: g.value === null } } : {}),
    ...(data.field === 'project' && g.value ? { projectKey: g.value } : {}),
  }));
  // The API returns the field's own order, which is name order for people: Name keeps it.
  return sort === 'name' ? rows : rows.toSorted((a, b) => b.amount - a.amount);
}

const NOUN: Record<string, { one: string; many: string; entries: string }> = {
  assignee: { one: 'assignee', many: 'people', entries: 'assignee entries' },
  tag: { one: 'tag', many: 'tags', entries: 'tag entries' },
  project: { one: 'project', many: 'projects', entries: 'issues' },
};
const nounOf = (field: string) => NOUN[field] ?? { one: 'value', many: 'values', entries: 'values counted' };

/** The arithmetic of a multi-valued field, stated so the counts do not look wrong in either chart. */
function countingNote(data: Distribution) {
  if (data.total_counted === data.total_issues) return null;
  const noun = nounOf(data.field);
  const n = data.multi_valued_issues;
  return `${formatCount(n)} ${n === 1 ? 'has' : 'have'} more than one ${noun.one}, so the counts add up to ${formatCount(data.total_counted)} ${noun.entries}.`;
}

/** The figures to read first: how many issues, over how many people, and how many have nobody. */
function AssigneeStats({ data }: { data: Distribution }) {
  const unassigned = data.groups.find(g => g.value === null);
  const people = data.groups.filter(g => g.value !== null).length;
  const stats: Stat[] = [
    { label: 'Issues', value: formatCount(data.total_issues) },
    ...(data.total_counted !== data.total_issues
      ? [{ label: 'Assignee entries', value: formatCount(data.total_counted) }]
      : []),
    { label: people === 1 ? 'Person assigned' : 'People assigned', value: formatCount(people) },
    unassigned
      ? {
          label: 'Unassigned',
          value: formatCount(unassigned.count),
          unit: `${data.total_issues ? Math.round((unassigned.count / data.total_issues) * 1000) / 10 : 0}% of issues`,
          ...(unassigned.query ? { href: listHref(unassigned.query) as Route } : {}),
        }
      : { label: 'Unassigned', value: 'Hidden' },
  ];
  return <StatRow stats={stats} />;
}

export function DistributionReport({ name }: { name: DistributionName }) {
  const state = useReportState(name);
  const result = useReport(name, state.query);
  const chart = state.params.get('chart') === 'pie' ? 'pie' : 'bar';
  const sort: Sort = state.params.get('sort') === 'name' ? 'name' : 'count';
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
        <>
          <ToggleGroup
            label="Sort"
            value={sort}
            options={[
              { value: 'count', label: 'Most first' },
              { value: 'name', label: 'A–Z' },
            ]}
            onChange={v => state.set({ sort: v === 'name' ? 'name' : null })}
          />
          <ToggleGroup
            label="Chart"
            value={chart}
            options={[
              { value: 'bar', label: 'Bar' },
              { value: 'pie', label: 'Pie' },
            ]}
            onChange={v => state.set({ chart: v === 'pie' ? 'pie' : null })}
          />
        </>
      }
      skeleton="bars"
      summary={d => (
        <>
          {plural(d.total_issues, 'issue')} {scopeText(d.scope, Boolean(state.get('projects')))}.
          {countingNote(d) ? ` ${countingNote(d)}` : null}
        </>
      )}
    >
      {d => {
        const rows = rowsOf(d, sort);
        const noun = nounOf(d.field);
        return (
          <>
            {name === 'issues-per-assignee' ? <AssigneeStats data={d} /> : null}
            {chart === 'pie' ? (
              <div className="grid items-start gap-8 md:grid-cols-[288px_minmax(0,1fr)]">
                <DistributionPie
                  rows={rows}
                  total={d.total_counted}
                  centre={d.total_counted === d.total_issues ? 'issues' : noun.entries}
                  otherNoun={noun.many}
                />
                <DistributionTable
                  rows={rows}
                  total={d.total_counted}
                  truncated={d.truncated}
                  heading={NOUN[d.field] ? capitalise(noun.one) : 'Value'}
                />
              </div>
            ) : (
              <>
                <BarTable
                  heading={NOUN[d.field] ? capitalise(noun.one) : 'Value'}
                  amountHeading="Issues"
                  rows={rows.map(r => ({ ...r, paint: d.palette === 'series' ? null : r.paint, folded: false }))}
                  formatAmount={formatCount}
                  total={d.total_counted}
                />
                {d.truncated ? (
                  <p className="text-xs text-text-secondary">
                    Only the first 500 groups are listed; the total counts them all.
                  </p>
                ) : null}
              </>
            )}
            <HueNote groups={d.groups} />
            <p className="text-xs text-text-secondary">
              A count of issues, not of effort: a one-line fix and a month of work count the same.
            </p>
          </>
        );
      }}
    </ReportFrame>
  );
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function RowTooltip({ row }: { row: Row }) {
  return (
    <ChartTooltipBody
      rows={[{ key: row.key, paint: row.paint, value: formatCount(row.amount), label: row.label, person: row.person }]}
      note={`${row.share}% of the total${row.query ? ' · click to open the issues' : ''}`}
    />
  );
}

/** The pie keeps a slice per series and folds the rest into one Other; the table beside it lists everyone. */
function pieSlices(rows: readonly Row[], noun: string): Row[] {
  const folded = rows.filter(r => r.folded);
  if (folded.length < 2) return rows as Row[];
  const amount = folded.reduce((sum, r) => sum + r.amount, 0);
  return [
    ...rows.filter(r => !r.folded),
    {
      key: 'other',
      label: `Other · ${formatCount(folded.length)} ${noun}`,
      amount,
      share: Math.round(folded.reduce((sum, r) => sum + r.share, 0) * 10) / 10,
      query: null,
      paint: { fill: OTHER_FILL, hatched: false, faded: false },
      folded: true,
    },
  ];
}

function DistributionPie({
  rows,
  total,
  centre,
  otherNoun,
}: {
  rows: readonly Row[];
  total: number;
  centre: string;
  otherNoun: string;
}) {
  const router = useRouter();
  const slices = pieSlices(rows, otherNoun);
  return (
    <div className="relative mx-auto size-[288px]">
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-2xl font-semibold tracking-tight">{formatCount(total)}</p>
          <p className="text-xs text-text-secondary">{centre}</p>
        </div>
      </div>
      <PieChart responsive style={{ width: 288, height: 288 }} accessibilityLayer>
        <HatchDefs />
        <Pie
          data={slices}
          dataKey="amount"
          nameKey="label"
          innerRadius={84}
          outerRadius={136}
          startAngle={90}
          endAngle={-270}
          stroke="var(--bg-surface)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {slices.map(row => (
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
  heading,
  valueLabel = 'Issues',
}: {
  rows: readonly Row[];
  total: number;
  truncated: boolean;
  heading: string;
  valueLabel?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular">
        <thead>
          <tr className="h-8 border-b text-left text-xs text-text-secondary">
            <th className="font-medium">{heading}</th>
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
                  {row.person ? (
                    <PersonMark name={row.label} avatarUrl={row.person.avatarUrl} nobody={row.person.nobody} />
                  ) : null}
                  {row.projectKey ? <ProjectMarkByKey projectKey={row.projectKey} /> : null}
                  <DrillLink query={row.query} className="truncate">
                    {row.label}
                  </DrillLink>
                </span>
              </td>
              <td className="text-right">
                <DrillLink query={row.query}>{formatCount(row.amount)}</DrillLink>
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

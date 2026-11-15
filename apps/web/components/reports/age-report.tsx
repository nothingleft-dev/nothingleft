'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import type { AverageAgeReport as AverageAge } from '@nothingleft/types';
import { StatRow } from '@components/dashboard/stat-row';
import { IssueKey } from '@components/issue-key';
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
  SwitchParam,
  formatCount,
  oneDecimal,
} from '@components/reports/report-bits';
import { useReportState } from '@components/reports/report-state';
import {
  AXIS_TICK,
  CategoryTick,
  peopleByLabel,
  ChartTooltipBody,
  HatchDefs,
  niceTicks,
  Swatch,
  svgFill,
  svgOpacity,
} from '@components/reports/chart/chart-parts';
import { useReport } from '@hooks/use-reports';
import { listHref } from '@lib/issue-list/links';
import { markPaint, type MarkPaint } from '@lib/reports/colors';
import { groupFieldLabel } from '@lib/issue-list/groups';
import { ProjectMarkByKey } from '@components/projects/project-mark';

/** `107 days`, `4.5 days`: a tenth of a day is noise once the figure reaches ten. */
const days = (n: number) => `${n >= 10 ? formatCount(Math.round(n)) : oneDecimal(n)} ${n === 1 ? 'day' : 'days'}`;

const NEUTRAL: MarkPaint = { fill: 'var(--text-muted)', hatched: false, faded: false };

/** People and other series are read by name, so their bars stay neutral; status, category and project keep their colour. */
const paintOf = (group: AverageAge['groups'][number], palette: AverageAge['palette']) =>
  palette === 'series' ? null : markPaint(group, palette);

export function AgeReport() {
  const state = useReportState('average-age');
  const result = useReport('average-age', state.query);
  const unresolvedOnly = state.get('unresolved_only') === 'true';

  return (
    <ReportFrame
      state={state}
      result={result}
      scope={{ query: true, projects: true }}
      controls={
        <>
          <FieldPicker
            label="Group by"
            value={state.get('group_by')}
            projects={state.get('projects')}
            withNone
            onChange={v => state.set({ group_by: v })}
          />
          <SwitchParam
            label="Unresolved only"
            checked={unresolvedOnly}
            onChange={checked => state.set({ unresolved_only: String(checked) })}
          />
        </>
      }
      skeleton="bars"
      skeletonStats={['Issues', 'Average age', 'Oldest']}
      summary={d =>
        `${plural(d.overall.count, d.unresolved_only ? 'unresolved issue' : 'issue')} ${scopeText(d.scope, Boolean(state.get('projects')))}. Age runs from creation to ${
          d.unresolved_only ? 'now' : 'resolution, or to now while open'
        }.`
      }
    >
      {d => (
        <div className="flex flex-col gap-5">
          <StatRow
            stats={[
              { label: 'Issues', value: formatCount(d.overall.count) },
              { label: 'Average age', value: days(d.overall.average_days) },
              {
                label: 'Oldest',
                value: days(d.overall.oldest_days),
                below: d.overall.oldest ? <OldestKey issueKey={d.overall.oldest} /> : null,
              },
            ]}
          />
          {d.groups.length > 0 ? (
            <>
              <AgeBars data={d} />
              <AgeTable data={d} />
              <HueNote groups={d.groups} />
            </>
          ) : null}
        </div>
      )}
    </ReportFrame>
  );
}

function OldestKey({ issueKey }: { issueKey: string }) {
  return (
    <Link href={`/issue/${issueKey}` as Route} className="text-link w-fit">
      <IssueKey issueKey={issueKey} className="text-inherit" />
    </Link>
  );
}

function AgeBars({ data }: { data: AverageAge }) {
  const ticks = niceTicks(Math.max(1, ...data.groups.map(g => g.average_days), data.overall.average_days) * 1.05);
  const router = useRouter();
  const people = isPeopleField(data.group_by, data.groups);
  const rows = data.groups.map((g, i) => ({
    ...g,
    key: `${g.value ?? g.label}-${i}`,
    paint: paintOf(g, data.palette) ?? NEUTRAL,
    person: personOf(g, people),
  }));
  return (
    <BarChart
      layout="vertical"
      data={rows}
      responsive
      style={{ width: '100%', height: rows.length * 32 + 36 }}
      margin={{ top: 24, right: 88, bottom: 4, left: 8 }}
      barCategoryGap={8}
      accessibilityLayer
    >
      <HatchDefs />
      <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
      <XAxis
        type="number"
        tick={AXIS_TICK}
        axisLine={false}
        tickLine={false}
        ticks={ticks}
        domain={[0, ticks.at(-1)!]}
        tickFormatter={(v: number) => `${formatCount(v)} ${v === 1 ? 'day' : 'days'}`}
      />
      <YAxis
        type="category"
        dataKey="label"
        width={176}
        tick={<CategoryTick people={peopleByLabel(data.groups, people)} />}
        axisLine={{ stroke: 'var(--border)' }}
        tickLine={false}
        interval={0}
      />
      <ReferenceLine
        x={data.overall.average_days}
        stroke="var(--text)"
        strokeWidth={1}
        label={{
          value: `All: ${days(data.overall.average_days)}`,
          position: 'top',
          fill: 'var(--text-secondary)',
          fontSize: 12,
        }}
      />
      <Tooltip
        cursor={{ fill: 'var(--bg-hover)' }}
        isAnimationActive={false}
        content={({ active, payload }) => {
          const row = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
          if (!row) return null;
          return (
            <ChartTooltipBody
              title={row.label}
              titlePerson={row.person}
              rows={[{ key: row.key, paint: row.paint, value: days(row.average_days), label: 'on average' }]}
              note={`${plural(row.count, 'issue')} · oldest ${days(row.oldest_days)}`}
            />
          );
        }}
      />
      <Bar dataKey="average_days" maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
        {rows.map(row => (
          <Cell
            key={row.key}
            fill={svgFill(row.paint)}
            fillOpacity={svgOpacity(row.paint)}
            cursor={row.query ? 'pointer' : 'default'}
            onClick={() => row.query && router.push(listHref(row.query))}
          />
        ))}
        <LabelList
          dataKey="average_days"
          position="right"
          fill="var(--text-secondary)"
          fontSize={12}
          stroke="var(--bg-surface)"
          strokeWidth={4}
          paintOrder="stroke"
          formatter={(v: unknown) => days(Number(v))}
        />
      </Bar>
    </BarChart>
  );
}

function AgeTable({ data }: { data: AverageAge }) {
  const people = isPeopleField(data.group_by, data.groups);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm [&_td:not(:first-child)]:tabular">
        <thead>
          <tr className="h-8 border-b text-left text-xs text-text-secondary">
            <th className="font-medium">{groupFieldLabel(data.group_by ?? '')}</th>
            <th className="w-24 text-right font-medium">Issues</th>
            <th className="w-32 text-right font-medium">Average age</th>
            <th className="w-28 pl-6 font-medium">Oldest</th>
            <th className="w-24 text-right font-medium">
              <span className="sr-only">Oldest issue’s age</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.groups.map((g, i) => (
            <tr key={`${g.value ?? g.label}-${i}`} className="h-row border-b border-border-subtle">
              <td className="max-w-0">
                <span className="flex min-w-0 items-center gap-2">
                  {data.palette === 'series' ? null : <Swatch paint={markPaint(g, data.palette)} />}
                  {data.palette === 'project' && g.value ? <ProjectMarkByKey projectKey={g.value} /> : null}
                  {people ? <PersonMark name={g.label} {...personOf(g, true)!} /> : null}
                  <DrillLink query={g.query} className="truncate">
                    {g.label}
                  </DrillLink>
                </span>
              </td>
              <td className="text-right">
                <DrillLink query={g.query}>{g.count}</DrillLink>
              </td>
              <td className="text-right">{days(g.average_days)}</td>
              <td className="pl-6">{g.oldest ? <OldestKey issueKey={g.oldest} /> : null}</td>
              <td className="text-right text-text-secondary">{days(g.oldest_days)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.truncated ? (
        <p className="mt-2 text-xs text-text-secondary">Only the first 500 groups are listed.</p>
      ) : null}
    </div>
  );
}

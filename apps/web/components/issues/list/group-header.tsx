'use client';

import type { CSSProperties } from 'react';
import { ChevronDown } from 'lucide-react';
import type { IssueGroup, IssueGroupBy, LabelColor, StatusCategory } from '@nothingleft/types';
import { StatusDot } from '@components/issues/value-marks';
import { cn } from '@lib/utils';

interface GroupHeaderProps {
  group: IssueGroup;
  groupBy: IssueGroupBy;
  /** Only with group_by=status: drives the dot's texture. */
  category: StatusCategory | null;
  loaded: number;
  collapsed: boolean;
  onToggle: () => void;
  style?: CSSProperties;
}

export const GROUP_HEIGHT = 32;
export const GROUP_GAP = 12;

/** DESIGN-SYSTEM § 7: a `--bg-app` band, 12px/500 secondary text, count muted, overdue in danger ink. */
export function GroupHeader({ group, groupBy, category, loaded, collapsed, onToggle, style }: GroupHeaderProps) {
  const overdue = groupBy === 'due' && group.value === 'overdue';
  return (
    <div style={style} className="pt-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className={cn(
          'flex h-8 w-full items-center gap-2 rounded-sm bg-app px-2 text-left text-xs font-medium text-text-secondary hover:text-text',
          overdue && 'text-danger-fg hover:text-danger-fg',
        )}
      >
        <ChevronDown
          className={cn(
            'size-3 flex-none text-text-muted transition-transform duration-(--dur-fast)',
            collapsed && '-rotate-90',
          )}
        />
        {groupBy === 'status' && group.color ? (
          <StatusDot category={category ?? 'unstarted'} color={group.color as LabelColor} />
        ) : groupBy.startsWith('custom:') && group.color ? (
          <i aria-hidden className={cn(`l-${group.color}`, 'inline-block size-2 flex-none rounded-full bg-c-solid')} />
        ) : null}
        <span className="truncate">{group.label}</span>
        <span className="font-normal tabular text-text-muted">{group.count}</span>
        {!collapsed && loaded < group.count ? (
          <span className="font-normal text-text-muted">· showing {loaded}</span>
        ) : null}
      </button>
    </div>
  );
}

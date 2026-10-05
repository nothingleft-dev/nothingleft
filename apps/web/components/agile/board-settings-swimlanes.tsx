'use client';

import { useId, useState, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  SEED_BOARD_SWIMLANE_TYPE,
  type Board,
  type BoardSwimlane,
  type BoardSwimlaneField,
  type UpdateBoard,
} from '@nothingleft/types';
import { Button } from '@components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@components/ui/radio-group';
import { ChoiceSelect, type ChoiceOption } from '@components/choice-select';
import { SettingsSection } from '@components/settings/section';
import { TypeBadge } from '@components/issues/value-marks';
import { PickerSkeleton } from '@components/issues/pickers';
import { useUpdateBoard } from '@hooks/use-boards';
import { useSchemaValues } from '@hooks/use-project-schema';

const MODES: { value: BoardSwimlane; label: string; hint: string }[] = [
  { value: 'none', label: 'No swimlanes', hint: 'One row of columns.' },
  { value: 'values', label: 'Values', hint: 'One row per value of a field.' },
  { value: 'issues', label: 'Issues', hint: 'One row per issue of the chosen types; each card sits under its own.' },
];

const FIELDS: readonly ChoiceOption<BoardSwimlaneField>[] = [
  { value: 'assignee', label: 'Assignee', hint: 'A card with several people sits in the first one’s row.' },
  { value: 'priority', label: 'Priority', hint: 'One row per priority, most urgent first.' },
  { value: 'type', label: 'Type', hint: 'One row per issue type.' },
];

interface BoardSwimlanesProps {
  projectKey: string;
  board: Board;
  canEdit: boolean;
}

export function BoardSwimlanes({ projectKey, board, canEdit }: BoardSwimlanesProps) {
  const id = useId();
  const update = useUpdateBoard(projectKey);
  const types = useSchemaValues(canEdit ? projectKey : null, 'types');

  const save = (body: UpdateBoard) =>
    update.mutate(
      {
        slug: board.slug,
        body,
        optimistic: b => ({
          ...b,
          ...(body.swimlane_by !== undefined ? { swimlane_by: body.swimlane_by } : {}),
          ...(body.swimlane_field !== undefined ? { swimlane_field: body.swimlane_field } : {}),
          ...(body.swimlane_types !== undefined ? { swimlane_types: body.swimlane_types } : {}),
        }),
      },
      { onError: error => toast.error(error.message) },
    );

  const choose = (mode: BoardSwimlane) => {
    if (mode === board.swimlane_by) return;
    if (mode === 'values') return save({ swimlane_by: 'values', swimlane_field: board.swimlane_field ?? 'assignee' });
    if (mode === 'issues' && board.swimlane_types.length === 0) {
      const names = (types.data ?? []).map(t => t.name);
      const pick = names.find(n => n.toLowerCase() === SEED_BOARD_SWIMLANE_TYPE.toLowerCase()) ?? names[0];
      return save({ swimlane_by: 'issues', ...(pick ? { swimlane_types: [pick] } : {}) });
    }
    save({ swimlane_by: mode });
  };

  const chosen = board.swimlane_types;
  const available = (types.data ?? []).filter(t => !chosen.some(c => c.toLowerCase() === t.name.toLowerCase()));

  return (
    <SettingsSection
      title="Swimlanes"
      description="Rows across the board. Cards that fit no row go in Uncategorized, always last."
    >
      <div className="flex flex-col gap-3">
        <span id={`${id}-by`} className="text-sm font-medium text-text-secondary">
          Swimlanes are identified by:
        </span>
        <RadioGroup
          aria-labelledby={`${id}-by`}
          value={board.swimlane_by}
          onValueChange={v => choose(v as BoardSwimlane)}
          disabled={!canEdit}
          className="flex flex-wrap gap-x-6 gap-y-2"
        >
          {MODES.map(mode => (
            <label key={mode.value} className="flex items-center gap-2 text-sm" title={mode.hint}>
              <RadioGroupItem value={mode.value} />
              {mode.label}
            </label>
          ))}
        </RadioGroup>
        <p className="text-xs text-text-secondary">{MODES.find(m => m.value === board.swimlane_by)?.hint}</p>

        {board.swimlane_by === 'values' ? (
          <div className="max-w-xs">
            <ChoiceSelect
              label="From field"
              value={board.swimlane_field ?? 'assignee'}
              options={FIELDS.filter(f => f.value !== board.column_field)}
              disabled={!canEdit}
              showHint
              onChange={field => field !== board.swimlane_field && save({ swimlane_field: field })}
            />
          </div>
        ) : null}

        {board.swimlane_by === 'issues' ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">Type</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {chosen.map(name => (
                <span
                  key={name}
                  className="inline-flex h-6 items-center gap-1.5 rounded-sm border px-2 text-xs text-text-secondary"
                >
                  {name}
                  {canEdit && chosen.length > 1 ? (
                    <button
                      type="button"
                      aria-label={`Stop using ${name} issues as rows`}
                      onClick={() => save({ swimlane_types: chosen.filter(c => c !== name) })}
                      className="-mr-1 grid size-4 place-items-center rounded-xs text-text-muted hover:bg-hover hover:text-text"
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </span>
              ))}
              {canEdit ? (
                <TypePicker
                  loading={types.isPending}
                  options={available.map(t => ({ name: t.name, mark: <TypeBadge type={t} /> }))}
                  onPick={name => save({ swimlane_types: [...chosen, name] })}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </SettingsSection>
  );
}

function TypePicker({
  options,
  loading,
  onPick,
}: {
  options: { name: string; mark: ReactNode }[];
  loading: boolean;
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="text-text-secondary">
          <Plus />
          Add value
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[240px] max-w-[calc(100vw-32px)] p-0">
        <Command>
          <CommandInput placeholder="Find a type" />
          <CommandList>
            {loading ? <PickerSkeleton rows={3} /> : <CommandEmpty>Every type is already a row.</CommandEmpty>}
            {options.map(option => (
              <CommandItem
                key={option.name}
                value={option.name}
                onSelect={() => {
                  setOpen(false);
                  onPick(option.name);
                }}
              >
                {option.mark}
                <span className="min-w-0 flex-1 truncate">{option.name}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

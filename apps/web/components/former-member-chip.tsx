import { cn } from '@lib/utils';

interface Person {
  name: string;
  former_member: boolean;
  /** Absent on shapes that cannot carry a deactivated account, such as an invitee. */
  deactivated?: boolean;
}

const chipClass =
  'inline-flex h-4.5 flex-none items-center rounded-xs border px-1.5 text-2xs leading-none font-normal whitespace-nowrap text-text-secondary';

export function FormerMemberChip({ className }: { className?: string }) {
  return <span className={cn(chipClass, className)}>Former member</span>;
}

export function InactiveChip({ className }: { className?: string }) {
  return (
    <span className={cn(chipClass, className)} title="This account is deactivated">
      Inactive
    </span>
  );
}

/** A deactivated account keeps its real name, greyed - never "Deleted user" (owner, 27 Sep 2026). */
export const deactivatedInk = (person: Pick<Person, 'deactivated'> | null | undefined) =>
  person?.deactivated ? 'text-text-muted' : undefined;

/** The tooltip text for a person drawn without their name beside them. */
export function personTitle(person: Person) {
  if (person.deactivated) return `${person.name} (deactivated)`;
  if (person.former_member) return `${person.name} (former member)`;
  return person.name;
}

export function PersonName({ person, className }: { person: Person; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span
        className={cn('truncate', deactivatedInk(person))}
        title={person.deactivated ? personTitle(person) : undefined}
      >
        {person.name}
      </span>
      {person.former_member ? <FormerMemberChip /> : null}
    </span>
  );
}

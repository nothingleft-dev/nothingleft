import { MemberAvatar } from '@components/issues/member-avatar';
import { cn } from '@lib/utils';

interface Person {
  name: string;
  former_member: boolean;
  /** Absent on shapes that cannot carry a deactivated account, such as an invitee. */
  deactivated?: boolean;
  avatar_url?: string | null;
}

// Never cut: a chip clipped to its first letter reads as a stray glyph, so the name gives way instead.
const chipClass =
  'inline-block h-4.5 shrink-0 rounded-xs border px-1.5 text-2xs leading-4 font-normal whitespace-nowrap text-text-secondary';

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

/** A person wherever they are named: avatar when asked for, name, and the chip that says they are gone. */
export function PersonName({
  person,
  avatar = false,
  label = person.name,
  chip = true,
  className,
}: {
  person: Person;
  avatar?: boolean;
  /** Off where a tooltip already names the state and the cell has no room, as in an assignee stack. */
  chip?: boolean;
  /** A shorter form where space is tight, such as the first name. */
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      {avatar ? (
        <MemberAvatar member={{ ...person, avatar_url: person.avatar_url ?? null }} className="size-5 flex-none" />
      ) : null}
      <span className={cn('min-w-0 truncate', deactivatedInk(person))}>{label}</span>
      {!chip ? null : person.deactivated ? <InactiveChip /> : person.former_member ? <FormerMemberChip /> : null}
    </span>
  );
}

import { PASSWORD_MIN_LENGTH } from './constants.ts';

export const PASSWORD_STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const;
export type PasswordStrengthLabel = (typeof PASSWORD_STRENGTH_LABELS)[number];

export interface PasswordStrength {
  /** 0–4, matching the four segments of the meter plus an empty state. */
  score: 0 | 1 | 2 | 3 | 4;
  label: PasswordStrengthLabel;
  /** One line of advice, or null once there is nothing useful left to say. */
  tip: string | null;
  meetsMinimum: boolean;
}

export interface PasswordContext {
  name?: string | undefined;
  email?: string | undefined;
}

const COMMON = [
  'password',
  'passw0rd',
  'qwerty',
  'letmein',
  'welcome',
  'iloveyou',
  'admin',
  'monkey',
  'dragon',
  'football',
  'baseball',
  'sunshine',
  'princess',
  'changeme',
  'starwars',
];

const words = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3);

/**
 * Length and variety, discounted for anything guessable from the account itself.
 * Advisory only — the rules the API actually enforces are the minimum length and the
 * breached-password check (docs/auth-and-tenancy.md#login-methods), because composition
 * rules push people toward `Passw0rd!` rather than toward a passphrase.
 */
export function passwordStrength(password: string, context: PasswordContext = {}): PasswordStrength {
  const value = password.trim();
  if (value.length === 0) {
    return { score: 0, label: 'Too short', tip: null, meetsMinimum: false };
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return {
      score: 0,
      label: 'Too short',
      tip: `${PASSWORD_MIN_LENGTH - value.length} more character${PASSWORD_MIN_LENGTH - value.length === 1 ? '' : 's'} to go.`,
      meetsMinimum: false,
    };
  }

  const lower = value.toLowerCase();
  const personal = [...words(context.name ?? ''), ...words((context.email ?? '').split('@')[0] ?? '')];

  if (COMMON.some(c => lower.includes(c))) {
    return {
      score: 1,
      label: 'Weak',
      tip: 'That contains a very common password. Try unrelated words.',
      meetsMinimum: true,
    };
  }
  if (personal.some(w => lower.includes(w))) {
    return {
      score: 1,
      label: 'Weak',
      tip: 'Anyone who knows your name or email could guess this.',
      meetsMinimum: true,
    };
  }
  if (/^(.)\1+$/.test(value) || /^(0123456789|abcdefghij|qwertyuiop)/.test(lower)) {
    return {
      score: 1,
      label: 'Weak',
      tip: 'Repeats and keyboard runs are the first thing a cracker tries.',
      meetsMinimum: true,
    };
  }

  const variety =
    Number(/[a-z]/.test(value)) +
    Number(/[A-Z]/.test(value)) +
    Number(/\d/.test(value)) +
    Number(/[^A-Za-z0-9]/.test(value));
  const points =
    (value.length >= 20 ? 3 : value.length >= 16 ? 2 : value.length >= 12 ? 1 : 0) + (variety >= 3 ? 1 : 0);

  if (points >= 3) return { score: 4, label: 'Strong', tip: null, meetsMinimum: true };
  if (points === 2)
    return { score: 3, label: 'Good', tip: 'A fourth word would make this very hard to crack.', meetsMinimum: true };
  if (points === 1)
    return {
      score: 2,
      label: 'Fair',
      tip: 'Length beats symbols. Three or four unrelated words work well.',
      meetsMinimum: true,
    };
  return {
    score: 1,
    label: 'Weak',
    tip: 'Length beats symbols. Three or four unrelated words work well.',
    meetsMinimum: true,
  };
}

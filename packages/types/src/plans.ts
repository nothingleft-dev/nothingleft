import type { OrgPlan } from './constants.ts';
import { FREE_SEAT_LIMIT_DEFAULT, FREE_STORAGE_BYTES_DEFAULT } from './constants.ts';

export interface PlanPreset {
  /** null = unlimited. Seats are never blocked; the number only drives the notice. */
  readonly seats: number | null;
  readonly storage_bytes: number;
  /** Git integration caps; null = unlimited. */
  readonly git_connections: number | null;
  readonly git_repositories_per_project: number | null;
  readonly automations_per_project: number | null;
  /** Public plans are self-selectable; private ones are assigned by the operator only. */
  readonly public: boolean;
}

const GB = 1024 * 1024 * 1024;

const UNLIMITED_GIT = { git_connections: null, git_repositories_per_project: null, automations_per_project: null };

export const PLAN_PRESETS: Record<OrgPlan, PlanPreset> = {
  free: {
    seats: FREE_SEAT_LIMIT_DEFAULT,
    storage_bytes: FREE_STORAGE_BYTES_DEFAULT,
    git_connections: 2,
    git_repositories_per_project: 10,
    automations_per_project: 10,
    public: true,
  },
  pro: { seats: FREE_SEAT_LIMIT_DEFAULT, storage_bytes: 50 * GB, ...UNLIMITED_GIT, public: true },
  pro_lite: { seats: null, storage_bytes: FREE_STORAGE_BYTES_DEFAULT, ...UNLIMITED_GIT, public: false },
  unlimited: { seats: null, storage_bytes: 250 * GB, ...UNLIMITED_GIT, public: false },
};

export interface PlanOverrides {
  readonly seats?: number | null;
  readonly storage_bytes?: number;
}

export function planLimits(plan: OrgPlan, freeOverrides: PlanOverrides = {}): PlanPreset {
  const preset = PLAN_PRESETS[plan];
  if (plan !== 'free') return preset;
  return {
    ...preset,
    seats: freeOverrides.seats === undefined ? preset.seats : freeOverrides.seats,
    storage_bytes: freeOverrides.storage_bytes ?? preset.storage_bytes,
  };
}

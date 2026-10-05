import type { OrgPlan } from './constants.ts';
import { FREE_SEAT_LIMIT_DEFAULT, FREE_STORAGE_BYTES_DEFAULT } from './constants.ts';

export interface PlanPreset {
  /** null = unlimited. Seats are never blocked; the number only drives the notice. */
  readonly seats: number | null;
  readonly storage_bytes: number;
  /** Public plans are self-selectable; private ones are assigned by the operator only. */
  readonly public: boolean;
}

const GB = 1024 * 1024 * 1024;

export const PLAN_PRESETS: Record<OrgPlan, PlanPreset> = {
  free: { seats: FREE_SEAT_LIMIT_DEFAULT, storage_bytes: FREE_STORAGE_BYTES_DEFAULT, public: true },
  pro: { seats: FREE_SEAT_LIMIT_DEFAULT, storage_bytes: 50 * GB, public: true },
  pro_lite: { seats: null, storage_bytes: FREE_STORAGE_BYTES_DEFAULT, public: false },
  unlimited: { seats: null, storage_bytes: 250 * GB, public: false },
};

export interface PlanOverrides {
  readonly seats?: number | null;
  readonly storage_bytes?: number;
}

export function planLimits(plan: OrgPlan, freeOverrides: PlanOverrides = {}): PlanPreset {
  const preset = PLAN_PRESETS[plan];
  if (plan !== 'free') return preset;
  return {
    seats: freeOverrides.seats === undefined ? preset.seats : freeOverrides.seats,
    storage_bytes: freeOverrides.storage_bytes ?? preset.storage_bytes,
    public: preset.public,
  };
}

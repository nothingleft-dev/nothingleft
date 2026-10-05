const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Binary units, as storage limits are counted: `5 GB`, `4.8 GB`, `312 KB`. One decimal below ten. */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const rounded = unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${UNITS[unit]}`;
}

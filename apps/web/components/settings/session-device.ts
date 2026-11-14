export type DeviceKind = 'phone' | 'tablet' | 'desktop' | 'unknown';

export interface SessionDevice {
  /** "Chrome on macOS", "Safari on iPhone", "Partner Portal Desktop on Linux". */
  name: string;
  kind: DeviceKind;
}

const SYSTEMS: readonly [RegExp, string, DeviceKind][] = [
  [/iPhone/, 'iPhone', 'phone'],
  [/iPad/, 'iPad', 'tablet'],
  [/Android.*Mobile/, 'Android', 'phone'],
  [/Android/, 'Android tablet', 'tablet'],
  [/CrOS/, 'ChromeOS', 'desktop'],
  [/Windows/, 'Windows', 'desktop'],
  [/Mac OS X|Macintosh/, 'macOS', 'desktop'],
  [/Linux|X11/, 'Linux', 'desktop'],
];

// Order matters: Edge and Opera also say Chrome, and Chrome also says Safari.
const BROWSERS: readonly [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
];

const NOT_AN_APP = new Set(['Mozilla', 'AppleWebKit', 'Chrome', 'Safari', 'Electron', 'Gecko', 'KHTML']);

/** An Electron app names itself in a product token before Chrome: "PartnerPortalDesktop/4.12.0". */
function appName(userAgent: string): string | null {
  for (const match of userAgent.matchAll(/([A-Za-z][A-Za-z]+)\/[\d.]+/g)) {
    const token = match[1]!;
    if (NOT_AN_APP.has(token)) continue;
    return token.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  return null;
}

export function describeDevice(userAgent: string | null): SessionDevice {
  if (!userAgent) return { name: 'Unknown device', kind: 'unknown' };
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent));
  const where = system ? ` on ${system[1]}` : '';
  const kind = system?.[2] ?? 'unknown';
  if (/Electron\//.test(userAgent)) return { name: `${appName(userAgent) ?? 'Desktop app'}${where}`, kind };
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1];
  if (browser) return { name: `${browser}${where}`, kind };
  return { name: system ? `Browser${where}` : 'Unknown device', kind };
}

const regions = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en-GB'], { type: 'region' }) : null;

export function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return regions?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

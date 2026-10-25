import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type ResolveHost = (host: string) => Promise<string[]>;

export const resolveHost: ResolveHost = async host =>
  (await lookup(host, { all: true, verbatim: true })).map(a => a.address);

const V4_RESERVED: [number, number][] = [
  [0x00000000, 8], // this network
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // carrier-grade NAT
  [0x7f000000, 8], // loopback
  [0xa9fe0000, 16], // link-local, cloud metadata
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // IETF protocol assignments
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // benchmarking
  [0xe0000000, 3], // multicast and reserved
];

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

const v4Reserved = (n: number) => V4_RESERVED.some(([base, bits]) => n >>> (32 - bits) === base >>> (32 - bits));

/** The eight 16-bit groups of an IPv6 address, an embedded dotted IPv4 tail included. */
function v6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().split('%')[0]!;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (tail) {
    const n = v4ToInt(tail[1]!);
    text = `${text.slice(0, -tail[1]!.length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const [head, rest] = text.split('::') as [string, string | undefined];
  const parse = (part: string) => (part ? part.split(':').map(g => parseInt(g, 16)) : []);
  const left = parse(head);
  const right = rest === undefined ? [] : parse(rest);
  const groups = rest === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
  return groups.length === 8 && groups.every(g => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return v4Reserved(v4ToInt(ip));
  const g = v6Groups(ip);
  if (!g) return true;
  const embeddedV4 = ((g[6]! << 16) | g[7]!) >>> 0;
  const zeros = (n: number) => g.slice(0, n).every(x => x === 0);
  if (zeros(8) || (zeros(7) && g[7] === 1)) return true; // unspecified, loopback
  if (zeros(5) && g[5] === 0xffff) return v4Reserved(embeddedV4); // IPv4-mapped
  if (zeros(6)) return true; // IPv4-compatible, deprecated
  if (g[0] === 0x64 && g[1] === 0xff9b) return true; // NAT64 reaches any IPv4, internal ones included
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // unique local
  if ((g[0]! & 0xffc0) === 0xfe80 || (g[0]! & 0xffc0) === 0xfec0) return true; // link-local, site-local
  if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return false;
}

/** True when every address the URL's host resolves to is public; an unresolvable host is not. */
export async function isPublicUrl(url: string, resolve: ResolveHost): Promise<boolean> {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  try {
    const addresses = isIP(host) ? [host] : await resolve(host);
    return addresses.length > 0 && addresses.every(a => !isPrivateAddress(a));
  } catch {
    return false;
  }
}

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { PAT_DISPLAY_PREFIX_LENGTH, PAT_PREFIX } from '@nothingleft/types';

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const PAT_BODY_LENGTH = 43;

export function sha256(value: string): Buffer {
  return Buffer.from(new Bun.CryptoHasher('sha256').update(value).digest());
}

export function randomToken(bytes = 32): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url');
}

function base62(length: number): string {
  // Rejection sampling: 256 % 62 != 0, so the naive modulo skews the first four letters.
  const limit = 256 - (256 % BASE62.length);
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte >= limit) continue;
      out += BASE62[byte % BASE62.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export interface IssuedToken {
  token: string;
  token_hash: Buffer;
}

export function issueSessionToken(): IssuedToken {
  const token = randomToken();
  return { token, token_hash: sha256(token) };
}

export function issueOneTimeToken(): IssuedToken {
  const token = randomToken();
  return { token, token_hash: sha256(token) };
}

export function issueInvitationToken(): IssuedToken {
  const token = randomToken();
  return { token, token_hash: sha256(token) };
}

export interface IssuedPat extends IssuedToken {
  token_prefix: string;
}

export function issuePat(): IssuedPat {
  const body = base62(PAT_BODY_LENGTH);
  const token = `${PAT_PREFIX}${body}`;
  return {
    token,
    token_hash: sha256(token),
    token_prefix: `${PAT_PREFIX}${body.slice(0, PAT_DISPLAY_PREFIX_LENGTH)}`,
  };
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function issuePkcePair(): PkcePair {
  const verifier = randomToken();
  return { verifier, challenge: sha256(verifier).toString('base64url') };
}

/**
 * A link that must keep working for as long as the email exists (an unsubscribe link):
 * signed rather than stored, so nothing expires and no row is written per email sent.
 */
export function signLink(secret: string, payload: string): string {
  const mac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${Buffer.from(payload).toString('base64url')}.${mac}`;
}

export function verifyLink(secret: string, token: string): string | null {
  const [encoded, mac] = token.split('.');
  if (!encoded || !mac) return null;
  const payload = Buffer.from(encoded, 'base64url').toString();
  const expected = Buffer.from(createHmac('sha256', secret).update(payload).digest('base64url'));
  const given = Buffer.from(mac);
  return given.length === expected.length && timingSafeEqual(given, expected) ? payload : null;
}

export type SealPurpose = 'totp' | 'byo_storage';
export type KeyPurpose = SealPurpose | 'mcp-confirm';

const SEAL_VERSION = 'v1';

// One master key, a subkey per purpose, so a secret sealed for one use never opens as another.
export function subkey(master: Buffer, purpose: KeyPurpose): Buffer {
  return Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), `nothingleft:${purpose}`, 32));
}

/**
 * AES-256-GCM with a fresh 12-byte IV on every seal. `aad` names the row the secret belongs
 * to, so a ciphertext copied onto another row does not open. The version prefix leaves room
 * for a second key during a future rotation.
 */
export function seal(master: Buffer, purpose: SealPurpose, aad: string, plaintext: string): string {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = createCipheriv('aes-256-gcm', subkey(master, purpose), iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [SEAL_VERSION, Buffer.from(iv), body, cipher.getAuthTag()]
    .map(part => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

export function unseal(master: Buffer, purpose: SealPurpose, aad: string, sealed: string): string {
  const [version, iv, body, tag] = sealed.split('.');
  if (version !== SEAL_VERSION || !iv || !body || !tag) throw new Error('unrecognised sealed value');
  const decipher = createDecipheriv('aes-256-gcm', subkey(master, purpose), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
}

import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';
import { RECOVERY_CODE_COUNT } from '@nothingleft/types';
import { TOTP_ISSUER, TOTP_EPOCH_TOLERANCE_SECONDS } from '@config/constants';
import { sha256 } from '@lib/crypto';

// Crockford base32: no I, L, O or U, so a code read off paper cannot be mistyped into another.
const RECOVERY_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const RECOVERY_GROUP = 5;

export function newTotpSecret(): string {
  return generateSecret();
}

export function otpauthUri(secret: string, account: string): string {
  return generateURI({ issuer: TOTP_ISSUER, label: account, secret });
}

const digitsOf = (code: string) => code.replace(/[\s-]/g, '');

export const isTotpShaped = (code: string) => /^\d{6}$/.test(digitsOf(code));

/** The time step the code matched, or null. Codes at or before `afterStep` are replays. */
export function verifyTotp(secret: string, code: string, afterStep: number | null, at = new Date()): number | null {
  if (!isTotpShaped(code)) return null;
  const token = digitsOf(code);
  const result = verifySync({
    secret,
    token,
    epoch: Math.floor(at.getTime() / 1000),
    epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS,
    ...(afterStep !== null ? { afterTimeStep: afterStep } : {}),
  });
  return result.valid && 'timeStep' in result ? result.timeStep : null;
}

/** For tests and the end-to-end script, which play the authenticator app. */
export function totpCode(secret: string, at = new Date()): string {
  return generateSync({ secret, epoch: Math.floor(at.getTime() / 1000) });
}

export const normaliseRecoveryCode = (code: string) => code.toLowerCase().replace(/[\s-]/g, '');

export const hashRecoveryCode = (code: string) => sha256(normaliseRecoveryCode(code));

export function issueRecoveryCodes(): { codes: string[]; hashes: Buffer[] } {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const chars = [...crypto.getRandomValues(new Uint8Array(RECOVERY_GROUP * 2))].map(
      byte => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length],
    );
    return `${chars.slice(0, RECOVERY_GROUP).join('')}-${chars.slice(RECOVERY_GROUP).join('')}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

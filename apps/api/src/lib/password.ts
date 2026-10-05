import { BREACH_CHECK_TIMEOUT_MS } from '@config/constants';

export const hashPassword = (password: string): Promise<string> =>
  Bun.password.hash(password, { algorithm: 'argon2id' });

export const verifyPassword = (password: string, hash: string): Promise<boolean> =>
  Bun.password.verify(password, hash, 'argon2id');

/**
 * k-anonymity range query: only the first five hex characters of the SHA-1 leave this
 * process, so the password itself is never disclosed. A network failure returns false —
 * a breach list that is briefly unreachable must not block sign-up.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  const digest = new Bun.CryptoHasher('sha1').update(password).digest('hex').toUpperCase();
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(BREACH_CHECK_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const body = await response.text();
    return body.split('\n').some(line => {
      const [hashSuffix, count] = line.trim().split(':');
      return hashSuffix === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}

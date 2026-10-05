const KEY = 'nl:invite-intent';

/**
 * Path A ends inside the organisation without a second click, but the sign-up leaves the
 * page — an OAuth round trip, or a verification link opened later. This remembers, in
 * this browser only, that the account was created *from* this invitation, so coming back
 * accepts it rather than showing the Path B card to someone who already said yes.
 */
export function rememberInviteIntent(token: string) {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // Storage blocked: the explicit Accept card is shown instead, which is never wrong.
  }
}

export function takeInviteIntent(token: string): boolean {
  try {
    if (sessionStorage.getItem(KEY) !== token) return false;
    sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

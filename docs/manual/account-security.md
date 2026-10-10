# Account security

Two-factor authentication, deactivating your account, transferring an organisation you own,
and deleting one. All of it lives in the web app — **Settings → Security** for your account,
**Organisation → Danger zone** for the organisation — and none of it can be done with an access
token or an AI agent: those are the credentials it protects.

## Access tokens and devices

Create and revoke access tokens in **Settings → Access tokens**, and sign other devices out in
**Settings → Sessions**, from the web app. An access token can list both but change neither.
Creating a token, or changing your email address, needs a verified email address first. If you
mistyped your address when you signed up, sign up again with the right one.

Resetting or changing your password makes every older password-reset link stop working.

If someone signed up with your address before you did and never verified it, signing in with
Google or GitHub takes the account back: their password, two-factor, tokens, sessions and
pending links are all removed.

## Two-factor authentication

Two-factor adds a second step to signing in with your email and password: a six-digit code from
an authenticator app on your phone, such as Google Authenticator, 1Password or Authy.

### Turning it on

1. **Settings → Security → Two-factor authentication → Turn on.**
2. Scan the QR code with your authenticator app, or type the key shown under it.
3. Enter the six-digit code the app now shows, and your password, to prove it works. Two-factor
   is only switched on once a code has been accepted, so a mis-scanned QR code can never lock
   you out.
4. Save your **ten recovery codes**. They are shown once. Each one signs you in a single time if
   you lose your phone — there is no support desk that can let you back in without them.

You get an email whenever two-factor is turned on or off.

### Signing in

After your email and password, you are asked for the current code from your app. A code works
once: if you are asked again straight away, wait for the next one. Lost your phone? Choose
**Use a recovery code** and type one of your saved codes; spaces, dashes and capitals do not
matter. Each recovery code works once, and using one sends you an email saying how many you
have left.

**Signing in with Google or GitHub never asks for a code.** Those providers already protect your
account with their own second step, so Nothing Left does not add another.

Five wrong codes in a row end the attempt, and you start again from your password. More wrong
codes pause sign-in for 15 minutes.

### New recovery codes, and turning it off

- **Create new recovery codes** when you have used several, or think someone has seen them. The
  old ones stop working at once.
- **Turn off** two-factor with your password and a code — from the app, or a recovery code.

An account that only ever signs in with Google or GitHub has no password, so there is nothing for
two-factor to protect; set a password first if you want it.

## Confirming important changes

Turning off two-factor, creating new recovery codes, deactivating your account, and deleting or
handing over an organisation all ask you to confirm:

- with your **password**, plus a **code** if two-factor is on;
- or, if your account has no password, by **signing in with Google or GitHub again** — the
  change then goes through within the next ten minutes.

## Deactivating your account

**Settings → Security → Danger zone → Deactivate account.** Deactivating:

- signs you out everywhere and revokes every access token, so connected agents and scripts stop
  working;
- keeps your memberships and everything you wrote, under your real name. Colleagues see your
  name greyed out, and you are no longer offered as an assignee or in mentions;
- sends you a confirmation email;
- starts a six-month clock. After six months your personal data is erased, as described under
  [Erasing your data](#erasing-your-data), and the account cannot be reactivated.

If you own an organisation, you cannot deactivate your account until you **transfer ownership**
or the organisation is **deleted** — someone has to be able to look after it.

To reactivate, email us from the address on the account within six months of deactivating. Your memberships come back as they
were; sign in again and create new access tokens.

**Erasing your data.** Deactivation keeps your name on your work. Six months after you deactivate,
your personal data is erased automatically. To have it erased sooner, email us — you, or an Org
Admin of your organisation on your behalf. Erasure replaces your name with *Deleted user*, and
removes your email address, photo, password, sign-in links, last sign-in IP address and recent
searches. What you wrote in issues and comments is not rewritten.

## Transferring ownership

Every organisation has one Owner, who alone can delete it or hand it over. To hand it over, the
Owner goes to **Organisation → Danger zone → Transfer ownership**, picks a member and confirms.
Any active member with a verified email can receive it.

For example, Alex Lee owns ACME and offers it to Casey Kim:

- Casey gets an email with a link to accept or decline, valid for 7 days; Alex gets a note that
  the offer went out.
- Until Casey accepts, Alex is still the Owner and can cancel the offer. Making a new offer
  replaces the old one.
- When Casey accepts, Casey becomes the Owner and Alex stays an **Org Admin**. Both get an
  email, and the audit log records the transfer.
- If Casey declines, Alex hears so and nothing changes.

The link only works for the person it was sent to: signed in as anyone else, it says so.

## Deleting an organisation

Only the Owner can delete an organisation: **Organisation → Danger zone → Delete organisation**,
then confirm.

- Deletion is **scheduled, not immediate**. There are **14 days** before anything is removed, and
  every member sees a banner with the date. Everyone can keep working meanwhile.
- The Owner and every Org Admin get an email when it is scheduled, a reminder one day before, and
  another when it is done.
- The Owner can **cancel** at any time during the 14 days; the admins are told, and nothing is
  lost. A pending ownership transfer is cancelled when deletion is scheduled, and none can be
  started until it is cancelled.
- After 14 days the organisation's projects, issues, comments, articles and files are deleted,
  and nobody can open it any more. Files kept in your own connected bucket are never touched.
  Members' accounts, and their other organisations, are unaffected.
- The organisation's address — `acme` in `X-Organization: acme` — stays reserved, so it can
  never be taken by someone else.

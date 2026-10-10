# Emails

Every email the system sends, in one list, so the templates can be written and reviewed in
one place. Layout lives in `apps/api/src/lib/email-html.ts` and the wording lives in `packages/i18n/en.json` under the keys named here
(`<key>.subject`, `<key>.body`); this page holds only what each email is for and what it is
given. Policy — which mail is transactional, subject style, sender, unsubscribe — is
[notifications.md](./notifications.md#transactional-email). A body keeps its link alone in
its own paragraph, and the matching `<key>.action` message is the button label.

Every email is plain text with an HTML copy generated from it, and every subject ends
`· Nothing Left`. **Tokens** are the `{placeholders}` the sender fills; a template may use
any of them and must not need any other. `{name}` is always the recipient's name, `{url}` a
link into the app. Transactional mail carries no unsubscribe link.

## Account and security

Transactional: always sent, not subject to preferences.

| Key | Subject | Tokens | Purpose |
|---|---|---|---|
| `email.verify` | Verify your email | `name`, `url` | Confirms a new account's address; the link works for 24 hours and may carry `next` back to an invitation. |
| `email.password_reset` | Reset your password | `name`, `url` | The single-use reset link, one hour; sent only when the address has an account, but the request always answers the same. |
| `email.password_changed` | Your password was changed | `name`, `url` | Tells the holder their password changed (reset or settings), in case it was not them. |
| `email.unverified_account_linked` | Your password was removed | `name`, `email`, `provider`, `url` | A Google/GitHub sign-in linked an account whose address was never verified, so its password was dropped and its sessions ended. |
| `email.email_change_verify` | Confirm your new email | `name`, `new_email`, `url` | Sent to the new address; the change happens only when this link is used (24 hours). |
| `email.email_changed` | Your email address was changed | `name`, `old_email`, `new_email` | Sent to both the old and the new address once the change is made. |
| `email.pat_created` | A new access token was created | `name`, `token_name`, `url` | Tells the holder a personal access token was minted on their account. |
| `email.two_factor_enabled` | Two-factor authentication is on | `name`, `url` | Confirms two-factor was switched on. |
| `email.two_factor_disabled` | Two-factor authentication is off | `name`, `url` | Warns that two-factor was switched off, in case it was not them. |
| `email.recovery_code_used` | A recovery code was used | `name`, `remaining`, `url` | A recovery code signed in or confirmed an action; says how many are left — a new phone or an intruder. |
| `email.recovery_codes_regenerated` | New recovery codes were created | `name`, `url` | The old recovery codes no longer work. |
| `email.account_deactivated` | Your account was deactivated | `name` | Confirms deactivation (by the holder or the operator) and says how to ask for reactivation. |
| `email.account_reactivated` | Your account is active again | `name` | The operator reactivated the account; memberships are back, tokens must be made again. |

## Organisation and membership

Transactional.

| Key | Subject | Tokens | Purpose |
|---|---|---|---|
| `email.invitation` | {inviter} invited you to {org} | `inviter`, `org`, `role`, `email`, `url` | An email invitation to an organisation, 14 days, for that address only. |
| `email.invitation_project` | {inviter} invited you to {org} (subject shared with `email.invitation`) | `inviter`, `org`, `project`, `role`, `email`, `url` | The same, for a project invitation. |
| `email.member_removed` | You were removed from {org} | `name`, `actor`, `org` | Tells a removed member they lost access; their account and other organisations are untouched. |
| `email.role_raised` | You are now an admin of {org} | `name`, `actor`, `org`, `url` | Someone was made an Org Admin. |
| `email.project_role_raised` | You are now a Project Admin on {project} | `name`, `actor`, `org`, `project`, `url` | Someone was made a Project Admin. |
| `email.ownership_offered` | {owner} wants to make you the owner of {org} | `name`, `owner`, `org`, `url` | To the proposed owner: the accept / decline link, 7 days. |
| `email.ownership_offer_sent` | You offered {org} to {target} | `name`, `target`, `org`, `url` | To the Owner: confirms the offer and where to cancel it. |
| `email.ownership_offer_cancelled` | The ownership transfer of {org} was cancelled | `name`, `owner`, `org` | To the proposed owner: the Owner withdrew the offer. |
| `email.ownership_offer_declined` | {target} declined to own {org} | `name`, `target`, `org`, `url` | To the Owner: the proposed owner said no. |
| `email.ownership_received` | You now own {org} | `name`, `other`, `org`, `url` | To the new Owner, once they accept; `other` is the previous Owner. |
| `email.ownership_handed_over` | {other} now owns {org} | `name`, `other`, `org`, `url` | To the previous Owner, now an Org Admin; `other` is the new Owner. |
| `email.org_deletion_scheduled` | {org} is scheduled for deletion | `name`, `actor`, `org`, `date`, `url` | To the Owner and every Org Admin: deletion on `date` (their own timezone) unless the Owner cancels. |
| `email.org_deletion_reminder` | {org} will be deleted tomorrow | `name`, `org`, `date`, `url` | The same people, one day before the deadline. |
| `email.org_deletion_cancelled` | {org} will not be deleted | `name`, `actor`, `org`, `date`, `url` | The same people: the Owner cancelled. |
| `email.org_deleted` | {org} was deleted | `name`, `org`, `date`, `url` | The same people, once `org.delete` has removed it. |

## Limits

Transactional.

| Key | Subject | Tokens | Purpose |
|---|---|---|---|
| `email.storage_almost_full` | Your storage is almost full | `name`, `org`, `used`, `limit`, `percent`, `url` | Org Admins and the Owner, once per crossing of 95% of the quota. |
| `email.storage_full` | Your storage is full | `name`, `org`, `used`, `limit`, `url` | The same people, on the first upload refused for lack of space. |

## Bring your own storage

Transactional, to the Org Admins and the Owner (6c). A connected bucket receives every file
the organisation uploads, so each change to it is announced the way a new access token is.

| Key | Subject | Tokens | Purpose |
|---|---|---|---|
| `email.storage_connected` | {org} now stores files in your own bucket | `name`, `org`, `actor`, `bucket`, `url` | The bucket passed both checks: new uploads go there and the quota no longer applies. Sent on the first verification, not on a key rotation. |
| `email.storage_disconnected` | Your storage bucket was disconnected from {org} | `name`, `org`, `actor`, `bucket`, `url` | Its files stay in the bucket and stop opening until the same bucket (same account or region, same name) is connected again; uploads use the built-in storage again. |
| `email.storage_byo_failed` | Fix the storage connection for {org} | `name`, `org`, `bucket`, `url` | The bucket refused its key (revoked, or a permission removed). Sent once, by the request that found out; files there and uploads stop until the key is updated. |

## Activity notifications

Opt-in per kind ([notifications.md § Preferences](./notifications.md#preferences)); each carries
`List-Unsubscribe` and a one-click unsubscribe link. A body is assembled from line keys.

| Key | Subject | Tokens | Purpose |
|---|---|---|---|
| `email.notification` | {summary} | `summary`; lines: `email.notification.greeting` (`name`), `.line` (`summary`), `.open` (`subject`, `url`), `.footer` (`kinds`, `unsubscribe_url`, `preferences_url`) | An instant email with one change. |
| `email.notification_many` | {count} updates on {subject} | `count`, `subject`; the same lines | An instant email with several changes to one issue or article. |
| `email.notification_due` | {count} of your issues need attention | `count`, `subject`; the same lines | An instant email whose changes span two or more issues (`count` is the number of issues), including the due-date producer's batch: due soon and overdue. The subject is not specific to due dates. |
| `email.digest.daily` | Your day in {org} | `org`; lines: `email.digest.daily.heading` (`org`), `.project` (`project`), `.kind` (`label`, `count`), `.issue` (`key`, `title`), `.more` (`count`, `url`), `.count` (`label`, `count`, `url`), `.watched` (`count`, `url`), `.footer.daily` (`kinds`, `unsubscribe_url`, `preferences_url`) | The 9am (recipient's local time) daily digest per organisation, unread only, never empty. At most 5 issues are listed per kind line, the rest collapse into `.more`. |
| `email.digest.weekly` | Your week in {org} | as daily, with `email.digest.weekly.heading` and `.footer.weekly` | The Monday 9am (local) weekly digest. |

## Notes for the template work

- Every send goes through one function, `createMailer` in `apps/api/src/lib/email.ts`, which hands
  the message to Resend, Zoho CPaaS or SMTP (`EMAIL_PROVIDER`, [infrastructure.md](./infrastructure.md)).
- The HTML copy is built by `renderHtml` from the same catalogue text: a heading from the subject, one
  paragraph per blank-line block, a button where a link stands alone, and a footer. Both themes ship in
  one file (`prefers-color-scheme`), and the logo is three PNGs served from `ASSET_BASE_URL` (`email/logo.png` in a neutral grey that reads on
  either background, for clients such as Gmail that recolour the page and ignore the colour scheme, plus
  `email/logo-light.png` and `email/logo-dark.png` for clients that honour it; `design/emails/build-logo.mjs`
  draws them). Run `bun run scripts/preview-emails.ts` in `apps/api` to write
  `design/emails/all.html`, which shows every email with sample values.
- Delivery is best-effort except `email.verify` on resend and `email.email_change_verify`,
  which fail the request (502) when the send fails.
- `email.invitation_project` has no subject key of its own; it reuses `email.invitation.subject`.
  The sender also passes `project` to `email.invitation`, which does not use it.
- `email.org_deleted` is given `date` and `url`, but its current body uses only `name` and `org`.
  `email.storage_full` is likewise given `percent` and does not use it.
- `email.org_deletion_*` and `email.storage_*` are sent once per Org Admin and Owner, each with
  their own `name`. `email.org_deleted` goes to the admins snapshotted before the purge.
- Activity mail and digests carry `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`;
  no other email sets headers.
- Digests and instant mail are assembled from line keys rather than one body key, so a template
  must lay out lines, not a single string.

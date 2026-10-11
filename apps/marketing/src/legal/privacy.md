---
title: Privacy Policy
updated: '2026-10-12'
---

This policy explains what personal data Nothing Left collects, why, who receives it, how long we
keep it and what you can do about it. It is written to be read. Where something is not settled
yet, it says so.

## 1. Who we are

Nothing Left is run by Raunak Gupta, an individual in India operating as Nothing Left ("we",
"us").

For privacy questions and requests, email [admin@nothingleft.dev](mailto:admin@nothingleft.dev).

We decide why and how your account data, security data and support requests are processed. Under
India's Digital Personal Data Protection Act, 2023 that makes us the data fiduciary; under the
GDPR, the controller. The content an organisation keeps in Nothing Left is different: the
organisation decides what goes in and who sees it, and we process it on its behalf
([section 6](#6-the-content-in-your-workspace)).

## 2. What this policy covers

- The web app at work.nothingleft.dev.
- The REST API at api.nothingleft.dev and the MCP server at api.nothingleft.dev/mcp, which AI
  agents use.
- This website, nothingleft.dev, including the docs and the support form.
- The emails we send.

It does not cover a copy of Nothing Left that someone else runs on their own servers. Whoever runs
that copy is responsible for it. It also does not cover what your AI client, Google or GitHub do
with data under their own policies.

## 3. What we collect

### Your account

- Your email address, your name, whether your email address is verified, and when you signed up.
- If you sign in with Google: your Google account ID, email address, whether Google has verified
  it, your name and your picture.
- If you sign in with GitHub: your GitHub account ID, username, name, avatar URL and email
  addresses.
- In each organisation you join: your username (taken from your email address at first, and
  changeable), your role, when you joined, who invited you and, if it happens, when you were
  removed.

### Your profile

- Your photo. It is one you upload, the one from Google or GitHub, or a Gravatar image.
- Your timezone, sent by your browser so dates show correctly. If your browser does not send one,
  we use UTC.
- Interface preferences, such as your theme, the last project you opened and panels you have
  collapsed.

To find a Gravatar image, our server sends Gravatar a SHA-256 hash of your email address when you
sign up and when you sign in with Google or GitHub. If you have a Gravatar image, other members'
browsers load it from gravatar.com, which sees their IP address. We copy Google and GitHub photos
to our own storage. Until a photo is copied, browsers load it from Google or GitHub.

### Sign-in and security

- Your password, stored only as a one-way hash.
- Your signed-in sessions: a hashed session token, your browser's user agent, your IP address and
  country, when the session started and was last used, when it expires, and which organisation is
  open.
- Your personal access tokens: name, a hash of the token, its first characters, its scopes, when
  it was last used, when it expires and whether you revoked it.
- Two-factor authentication: the secret, encrypted, and your recovery codes, hashed.
- One-time links for verifying an email address, resetting a password, changing your email address
  (including the new address) and transferring an organisation.
- For a few minutes during sign-in: the Google or GitHub sign-in state (10 minutes), the two-factor
  step (5 minutes) and counters of failed attempts.

**Breached-password check.** When you set or change a password, our server asks Have I Been
Pwned's Pwned Passwords service whether it has appeared in a known breach. It sends only the first
five characters of the password's SHA-1 hash, and the reply is padded. Your password and its full
hash never leave our servers.

### What you add to a workspace

Issues, descriptions, comments, mentions, links, tags, custom-field values, sprints, boards, saved
views, knowledge base articles, the history of changes, notifications and your recent searches.
When an Org Admin invites someone, we store the invitee's email address and role, and the
invitation goes to that address.

### Files

Attachments and CSV imports: the file itself, its name, type, size, checksum, image dimensions and
who uploaded it. A CSV import's file is deleted once the import has run.

### Time entries

Who logged the time, the date, the duration, the type of work and the description.

### The organisation audit log

When someone changes an organisation's settings, members or storage, we record who did it, what
changed, the values before and after, and their IP address. These values can include email
addresses, usernames, a storage bucket name and an access key ID. Org Admins and the Owner can read
the log, including the IP addresses, and export it as CSV.

### Technical and log data

- The IP address, time and country of your last sign-in. The country is a two-letter code from
  Cloudflare.
- The IP address used each time an invitation link is used.
- **API request logs.** For every request: the method, the full URL including its query string,
  the host, your IP address, the status and the timing. The query string can include text you
  searched for and names in profile-picture addresses. Passwords, cookies and authorisation
  headers are removed before anything is logged. We keep these logs for 7 days.
- Rate-limit counters keyed by IP address, session or token, kept for 60 seconds. Copies of some
  API responses, kept for 24 hours so a repeated request is not applied twice. Report results,
  cached for 5 minutes.

### Product analytics and error reports

Nothing Left sends product analytics and error reports to PostHog. Session replay is not used. Our
server sends it, not your browser. It sends event names, a pseudonymous ID for you and your
organisation, and allow-listed counts and categories. Error reports carry the error, the route,
the request ID and the status. The events are designed to carry IDs and counts, not your content.

The web app also loads Google Analytics, only on the sign-in, sign-up and invitation pages, never
once you are inside the app. It records page addresses with IDs removed and whether you signed up
or signed in, with email, Google or GitHub. A notice on those pages tells you it is there.

### Emails

To send email we use your address, your name and the message itself. Notification and digest
emails include issue keys, titles and summaries of what changed. Account and security emails are
always sent. Notification emails are off until you turn them on, and every one has a one-click
unsubscribe. We do not send marketing email.

### Support requests

When you use the support form, we store the request type, your name, your email address, the
subject, your message, the product area and the time it arrived. The form does not store your IP
address. Cloudflare, which runs this website, handles your request on the way to us. If you
email us instead, we keep the email.

### Docs reactions

When you react to a docs page, we add one to a counter for that page and reaction. We store
nothing about you. Your browser remembers your own reaction so you can change it.

### Browsing this website

This website loads Google Analytics on every page, which sets Google's analytics cookies. It
records the address of each page you visit without its query string or fragment, so text you
type into docs search is not sent, and the site you came from, cut to its domain. A notice tells
you this when you first visit. Fonts are served from this site and docs search runs in your
browser. Cloudflare serves the site and processes each request, including your IP address. The
[API reference](/docs/api) loads its viewer from jsDelivr, which sees your IP address, browser and
the page you came from.

### Security reports

If you report a vulnerability through GitHub, we receive what you send, under GitHub's terms.

## 4. How we use it

- **To run the service.** Create your account, sign you in, show your work to the people your
  organisation allows, and send the emails the service needs.
- **To keep it secure.** Show you your signed-in devices, stop abuse, limit request rates, check
  passwords against known breaches, and keep each organisation's audit log.
- **To operate and fix it.** Read logs when something goes wrong, and keep backups so data can be
  restored.
- **To answer you.** Reply to support requests and privacy requests.
- **To improve it,** only if product analytics is on, as described in
  [section 3](#3-what-we-collect).

We do not sell personal data, use it for advertising, or share it for anyone else's marketing.

## 5. Why we are allowed to

- **To provide what you signed up for.** Your account, sign-in, workspace, files and the emails the
  service needs.
- **Legitimate interests.** Security, abuse prevention, logs, backups, the audit log an
  organisation relies on, answering support requests and docs reaction counts.
- **Consent.** Notification emails you turn on, and anything optional we add later. You can turn
  them off at any time.
- **Legal obligations.** Where the law requires us to keep or disclose data.

**If you are in India.** By creating an account after reading this notice, you consent to us
processing your personal data for the purposes in [section 4](#4-how-we-use-it). Some processing,
such as keeping security logs, is also allowed by the Act without consent. You can withdraw
consent by deactivating your account and asking us to erase your data
([section 11](#11-your-rights)). Withdrawing does not affect what we did before.

## 6. The content in your workspace

- **It is yours.** You, or the organisation you add it to, own what you put in Nothing Left.
- **The organisation is in charge of it.** The Owner and Org Admins decide who is a member and with
  which role, and can export or delete the organisation's content. We process that content on the
  organisation's behalf and follow what it sets in the product.
- **We do not sell it, advertise with it or train AI models on it.**
- **We send it to no AI provider.** An AI agent works with Nothing Left only through a personal
  access token you create, with your permissions and that token's scopes. What your AI client
  then does with the content is between you and its provider.
- **Who can see it.** Each organisation's data is kept apart in every query, and that separation is
  tested. Inside an organisation, access follows its [roles and permissions](/docs/permissions).
  Members' email addresses are visible only to Org Admins, the Owner and the member.
- **Our access.** Nothing Left is run by one person, who has technical access to the servers,
  database and logs to operate the service. There is no admin console and no way to sign in as
  you. We open customer content only to fix a reported fault, investigate abuse or a security
  incident, or meet a legal requirement, and only as far as that needs.
- **Agreements with organisations.** We do not offer a data processing agreement yet.
- **Images from other sites.** A member can embed an image hosted elsewhere in an issue or article.
  When you view it, your browser fetches it from that site, which sees your IP address.

## 7. Who receives data

These providers process personal data for us. "Active" means in use now. "Only if enabled" means
built but switched off.

| Provider                            | What for                                                                                                                      | What they receive                                                                                               | Status                          |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Oracle Cloud Infrastructure         | Hosting the API, the MCP server, the database, the cache and logs; encrypted backups; monitoring                              | Everything the service stores                                                                                   | Active                          |
| Cloudflare                          | DNS and secure connections for the API and files; hosting this website and the support form; storing files and profile photos | Traffic on its way to us, including IP addresses, cookies and request content; every file and profile photo     | Active                          |
| Resend                              | Sending email                                                                                                                 | Your email address and name, and the full message                                                               | Active                          |
| Turso                               | Storing support requests and docs reaction counts                                                                             | Name, email address, subject, message and product area from the support form                                    | Active                          |
| Gravatar (Automattic)               | Profile photo when you have not set one                                                                                       | A SHA-256 hash of your email address; viewers' IP addresses when the photo loads                                | Active                          |
| Have I Been Pwned (Pwned Passwords) | Checking new passwords against known breaches                                                                                 | The first five characters of the password's SHA-1 hash, and our server's IP address                             | Active                          |
| Google                              | Sign-in, if you choose it                                                                                                     | Google sends us your account ID, email address, name and picture, and learns that you signed in to Nothing Left | Active when you use it          |
| GitHub                              | Sign-in, if you choose it; private security reports                                                                           | GitHub sends us your account ID, username, name, avatar URL and email addresses, and learns that you signed in  | Active when you use it          |
| jsDelivr                            | Delivering the viewer for the API reference on this website                                                                   | Your IP address, browser and the page you came from                                                             | Active                          |
| Vercel                              | Hosting the web app at work.nothingleft.dev                                                                                   | Web app traffic, including IP addresses, page addresses and the session cookie                                  | Active                          |
| PostHog (US Cloud)                  | Product analytics and error reports                                                                                           | Pseudonymous IDs, event names, counts and categories, error details                                             | Active |
| Google Analytics                    | This website, and the web app's sign-in, sign-up and invitation pages                                                         | Page addresses without query strings (and with IDs removed in the web app), a cookie ID, IP address and device details | Active                          |

**Email.** The admin@nothingleft.dev mailbox is hosted by Google (Gmail). Google receives the emails
you send us and our replies to them.

**Your organisation's own bucket.** An Org Admin can connect the organisation's own Cloudflare R2
or AWS S3 bucket for attachments. Files then go to that bucket, whose region and security the
organisation controls.

**When the law requires it.** We disclose personal data to authorities only when the law requires
us to.

## 8. Where your data is stored

The service runs in the United States, and so do its backups. If you use Nothing Left from India, the European Union, the United Kingdom or anywhere
else, your data is transferred to the United States and to the providers in
[section 7](#7-who-receives-data). We do not target people in the European Union or the United Kingdom, and we do not offer transfer
safeguards for them.

## 9. Cookies and browser storage

### In the web app

| Name          | What it does                                    | How long                          |
| ------------- | ----------------------------------------------- | --------------------------------- |
| `sid`         | Keeps you signed in. It holds a random ID only. | 30 days, renewed while you use it |
| `oauth_state` | Protects sign-in with Google or GitHub          | 10 minutes                        |
| `tfa`         | Carries you through the two-factor step         | 5 minutes                         |

All three are essential. The `sid` cookie is set for nothingleft.dev and its subdomains, so your
browser also sends it to this website and to static.nothingleft.dev, where profile photos are
served. Neither reads it.

The web app also keeps these in your browser's local and session storage:

| Name                           | What it remembers                                   |
| ------------------------------ | --------------------------------------------------- |
| `theme`                        | Light or dark                                       |
| `nl.sidebar.collapsed`         | Whether the sidebar is collapsed                    |
| `nl.issue-list.columns`        | Which columns the issue list shows                  |
| `nl.recently-viewed`           | The keys and titles of the last 8 issues you opened |
| `nl:create-issue:last-project` | The project you last created an issue in            |
| `nl:editor:mode`               | Visual or Markdown editor                           |
| `nl:oauth-next`                | Where to return after signing in, for this tab only |
| `nl:invite-intent`             | An invitation you are accepting, for this tab only  |

Issue titles in `nl.recently-viewed` stay on your device until you clear them. On a shared
computer, anyone using the same browser profile can read them.

### On this website

Our code sets one cookie here, `nl_notice_dismissed`, described below. The only thing it stores
in local storage is `nl:docs:reaction:<page>`, which remembers your own reaction to a docs page.
Cloudflare may set its own security cookies, such as `__cf_bm`, to filter bots. The API reference
viewer may keep its own settings in your browser.

### Analytics cookies

Google Analytics sets its `_ga` cookies on this website and on the web app's sign-in, sign-up
and invitation pages. They hold a random ID that lets Google count returning visitors, and last
up to two years.

When you close the notice about them, or it closes by itself after 10 seconds, we set
`nl_notice_dismissed` for nothingleft.dev and its subdomains, so the notice does not appear again
on this website or in the web app. It holds only the value `1` and lasts one year.

## 10. How long we keep it

| Data                                                                  | How long                                                                                                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Your account record                                                   | Never deleted, so work stays attributed. Erasure replaces your personal details ([section 11](#11-your-rights)). A deactivated account is erased six months after deactivation.     |
| Sessions                                                              | Deleted within an hour of expiring, 30 days after last use                                                                                                                          |
| One-time links                                                        | Deleted when they expire                                                                                                                                                            |
| Personal access tokens                                                | Kept, marked revoked, after you revoke them. Deleted six months after revocation.                                                                                                   |
| API request logs                                                      | 7 days                                                                                                                                                                              |
| Rate-limit counters, repeated-request records, cached reports         | 60 seconds, 24 hours and 5 minutes                                                                                                                                                  |
| Issues and articles in the trash                                      | 14 days, then deleted with their comments, time entries, files and history                                                                                                          |
| Deleted files                                                         | Removed within the hour. Uploads never finished go after 1 hour, and uploads never attached after 2 days                                                                            |
| CSV import files                                                      | Deleted when the import has run, or after a day if it is never started                                                                                                              |
| Organisation exports                                                  | 7 days after they are built, then deleted. They hold what the organisation holds, including members' email addresses                                                                |
| Notifications                                                         | 30 days after you read them; 90 days if unread                                                                                                                                      |
| Saved views, history of issues that still exist                       | Kept while the issues exist                                                                                                                                                         |
| Recent searches                                                       | Deleted 90 days after they are made                                                                                                                                                 |
| A deleted organisation                                                | 14 days to cancel, then its content and files are deleted. A record that it existed and its audit log stay, and its address stays reserved. Files in its own bucket are not touched |
| Organisation audit log, including IP addresses and email addresses    | Kept while the organisation exists and for two years after it is deleted, including after a member's data is erased.                                                               |
| Last sign-in IP address and country; IP addresses of invitation links | The last sign-in is replaced at your next sign-in. Invitation IP addresses are deleted after one year.                                                                              |
| Invitations never accepted                                            | Deleted 30 days after they expire or are cancelled                                                                                                                                  |
| Support requests                                                      | Two years after they arrive, then deleted                                                                                                                                           |
| Backups                                                               | The two latest weekly full backups and the changes since, about two to three weeks. Deleted data stays in backups until they rotate out                                             |
| Records held by Resend, PostHog and Google                            | Set by each provider. Its own terms say how long it keeps data.                                                                                             |
| Docs reaction counts                                                  | Kept. They contain no personal data                                                                                                                                                 |

## 11. Your rights

Depending on where you live, you can ask to access, correct, complete, update or erase your
personal data, to restrict or object to its use, to receive it in a portable form, to withdraw
consent, and to have your complaints heard. Under India's Act you can also nominate someone to
exercise your rights if you die or cannot act.

### What you can do yourself

- **See your data.** Your profile, signed-in devices and access tokens are in **Settings**.
- **Correct it.** Change your name, timezone, photo and your username in each organisation. Change
  your email address after verifying the new one; the old address is told.
- **Take a copy.** Export issues and reports as CSV, or read your data through the REST API and MCP.
  An Org Admin can export the whole organisation as one download. There is no single "download
  all my data" for one person yet.
- **Stop notification emails.** They are off until you turn them on, and every one can be
  unsubscribed with one click.
- **Sign out devices and revoke tokens** in **Settings**.
- **Deactivate your account** in **Settings → Security → Danger zone**. This signs you out
  everywhere and revokes your access tokens. Your memberships and your work stay, under your name.
  If you own an organisation, transfer it or delete it first. To reactivate, email us from the
  address on the account within six months of deactivating it. After six months your personal data
  is erased and the account cannot be reactivated. See
  [Account security](/docs/account-security#deactivating-your-account).

### What you ask us for by email

Email [admin@nothingleft.dev](mailto:admin@nothingleft.dev) from the address on your account.

- **Erasure.** You, or an Org Admin of your organisation on your behalf, can ask us to erase your
  personal data. We do it by hand. Your name becomes _Deleted user_, your email address is replaced
  by an irreversible hash, and your photo, password and Google or GitHub links are removed. Erasure
  also clears your sign-in IP address and country, invitation IP addresses and recent searches. What
  you wrote in issues and comments is not rewritten. Ask separately if you need specific text
  removed. Audit log entries that name your email address stay, and backups keep the old data until
  they rotate out.
- **Access, a copy, or any other right** above.
- **Leaving an organisation.** An Org Admin removes members. Ask one, or ask us.

We may ask you to confirm the request from the address on the account. We answer within 30 days.

If you are not satisfied, contact our Grievance Officer ([section 14](#14-grievance-officer)). In
India you can then complain to the Data Protection Board of India. In the European Union or the
United Kingdom you can complain to your data protection authority.

## 12. Children

Nothing Left is for people aged 18 or over. By creating an account you confirm that you are. We do
not knowingly collect data from anyone younger. If you believe someone under 18 has an account,
email us and we will deactivate it.

## 13. Security

- Passwords, session tokens, access tokens and recovery codes are stored only as hashes.
- Two-factor secrets and the credentials for an organisation's own bucket are encrypted.
- Connections to the service use TLS, and backups are encrypted.
- Two-factor authentication is available for every account that has a password.
- Every database query is scoped to one organisation, and that is tested.

No system is perfectly secure. If a breach of personal data affects you, we will tell you and the
authorities the law requires us to tell.

Found a vulnerability? Report it privately through
[GitHub](https://github.com/nothingleft-dev/nothingleft/security), as our
[security policy](https://github.com/nothingleft-dev/nothingleft/blob/main/SECURITY.md) explains.
Do not send it to the support form.

## 14. Grievance Officer

Under Indian law you can raise a complaint about how we handle your personal data with our
Grievance Officer.

- **Name:** Raunak Gupta
- **Email:** [admin@nothingleft.dev](mailto:admin@nothingleft.dev)

We acknowledge a grievance within 24 hours of receiving it and resolve it within 15 days.

## 15. Changes to this policy

When we change this policy, we update this page and the date at the top. If a change affects how
we use your data in a meaningful way, we tell account holders by email or in the app before it
takes effect.

## 16. Contact

Raunak Gupta, operating as Nothing Left.
Email: [admin@nothingleft.dev](mailto:admin@nothingleft.dev).

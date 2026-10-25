# Limits and billing

What your organisation can use, what happens when it reaches a limit, and what
billing will and will not change. Org Admins and the owner see the details under
**Organisation → Plan**.

## The beta

Nothing Left is in beta, and there is no subscription charge for a team of any
size. There is no payment flow in the product: no checkout, no card on file, no
trial that runs out. **Organisation → Plan** says so, and shows the limits that
apply to your organisation.

The storage limit below does apply during the beta.

## Seats

**The first 20 members of every organisation are free, forever.** That stays
true after billing arrives, for every organisation, including those created
before it.

You can go past 20. An invite or a join beyond the 20th member succeeds like
any other, and nothing changes for anyone: no feature is withheld, nothing turns
read-only, there is no countdown.

What you see instead:

- **The invite dialog**, once the organisation has 20 members, says which
  member you are adding, repeats that the first 20 are free forever, and states
  what seats beyond them will cost once billing launches.
- **Organisation settings** show Org Admins and the owner a notice from the
  20th member on, with the member count and how many are beyond the free
  allowance. It stays for as long as that is true.
- **Organisation → Plan** shows the same count as a meter.

Before any charge for seats beyond 20 takes effect, you get advance notice.

A member stops counting as soon as they are removed
([Members](./members.md)). People who are invited but have not joined do not
count.

## Storage

Each organisation has **5 GB** for files: attachments on issues, comments,
time entries and articles. Avatars never count.

| Usage | What happens                                                         |
| ----- | -------------------------------------------------------------------- |
| 80%   | A notice appears on the dashboard and above an issue's attachments   |
| 95%   | The notice escalates, and the Org Admins and the owner get one email |
| 100%  | New uploads are refused. The message names the two ways out          |

There is no way to buy more storage. At the limit you either:

1. **Make room** - delete files from **Organisation → Storage**, which lists them
   largest first.
2. **Bring your own bucket** - connect a Cloudflare R2 or AWS S3 bucket. Once
   it passes its checks, the storage limit lifts at once, without waiting for
   existing files to move.

Both are covered step by step in [Storage](./storage.md).

## Other limits

| Limit                      | Value                        |
| -------------------------- | ---------------------------- |
| File size                  | 100 MB per file              |
| Attachments                | 50 per issue, 50 per article |
| Issues in one bulk edit    | 500                          |
| Custom fields              | 50 per project               |
| GitHub or GitLab accounts  | 2 per organisation           |
| Linked repositories        | 10 per project               |
| Automations                | 10 per project               |
| Projects                   | No limit                     |
| Tags                       | No limit                     |
| API requests, signed in    | 300 a minute                 |
| API requests, access token | 600 a minute                 |

The file size and attachment limits still apply with your own bucket. They exist
so uploads stay reliable, not to save space.

An agent connected with an access token shares the token's 600 requests a
minute, and one tool call uses two to four of them ([Connecting an AI
agent](./mcp.md)). Every API response carries `X-RateLimit-Limit`,
`X-RateLimit-Remaining` and `X-RateLimit-Reset`, so a client can pace itself.
Past the limit, requests answer `429` with a `Retry-After` header saying how
many seconds to wait.

## Self-hosting

Nothing Left is licensed under AGPL-3.0, and the hosted service runs the same
build you can run yourself. There is no separate community edition with
features taken out.

On your own install, the seat and storage limits are environment settings:

| Setting              | Default      | What it changes                                    |
| -------------------- | ------------ | -------------------------------------------------- |
| `FREE_SEAT_LIMIT`    | `20`         | The member count at which the seat notice starts   |
| `FREE_STORAGE_BYTES` | `5368709120` | Each organisation's storage limit, in bytes (5 GB) |

Both take a positive whole number. Set them to whatever suits your install and
restart the API. A bucket connected by an organisation lifts its storage limit
on a self-hosted install too.

To install it, see [Self-hosting with Docker Compose](./self-hosting.md) or [Deploying on
AWS](./self-hosting-aws.md).

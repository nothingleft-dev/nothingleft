# Self-hosting with Docker Compose

Run the whole of Nothing Left on one machine: the web app, the API with its MCP endpoint, the
database, the cache and file storage. The same steps start a trial on your laptop and, with a
few more settings, a server your team uses every day. To run it on AWS instead, see [Deploying
on AWS](./self-hosting-aws.md).

## What runs

| Service    | What it is                                                             | Port   |
| ---------- | ---------------------------------------------------------------------- | ------ |
| `web`      | The web app, built from `apps/web`                                     | `3000` |
| `api`      | The REST API, with the MCP endpoint at `/mcp`, built from `apps/api`   | `4000` |
| `postgres` | PostgreSQL 16 - every issue, comment and setting                       | `5432` |
| `redis`    | Redis 7 - rate limits and short-lived caches                           | `6379` |
| `storage`  | RustFS, an S3-compatible store - attachments in one bucket, avatars in another | `9000` |
| `mailpit`  | Catches outgoing email so you can read it, until you set up real mail  | `8025` |
| `caddy`    | HTTPS for a server, with certificates issued automatically             | `443`  |

Two one-off jobs run before the API starts, on every start: `migrate` brings the database
schema up to date, and `storage-init` creates both buckets and lets the browser upload to them.

Every port is bound to `127.0.0.1`, so nothing is reachable from another machine until Caddy
serves it.

## What you need

- Docker with Compose 2.24 or later (`docker compose version`).
- About 4 GB of memory free while the images build. Running, the stack uses about 1 GB.
- `git` and `openssl`.

## Try it on your machine

### 1. Get the code

```sh
git clone https://github.com/nothingleft-dev/nothingleft.git
cd nothingleft
```

### 2. Create the settings file and its secrets

```sh
cp infra/docker/.env.example infra/docker/.env
sed -i.bak \
  -e "s|^ENCRYPTION_MASTER_KEY=$|ENCRYPTION_MASTER_KEY=$(openssl rand -base64 32)|" \
  -e "s|^EMAIL_LINK_SECRET=$|EMAIL_LINK_SECRET=$(openssl rand -hex 32)|" \
  -e "s|^POSTGRES_PASSWORD=$|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^APP_DB_PASSWORD=$|APP_DB_PASSWORD=$(openssl rand -hex 24)|" \
  -e "s|^STORAGE_SECRET_KEY=$|STORAGE_SECRET_KEY=$(openssl rand -hex 24)|" \
  infra/docker/.env && rm infra/docker/.env.bak
```

This fills the five secrets in `infra/docker/.env`. Keep the file: the database passwords are
fixed when the database is first created, and `ENCRYPTION_MASTER_KEY` seals two-factor and
storage secrets that nothing can read without it.

### 3. Start it

```sh
docker compose --env-file infra/docker/.env --profile app up -d --build
```

The first start builds both images and takes a few minutes. Later starts take seconds.

### 4. Sign up

Open <http://localhost:3000> and create an account. The verification email arrives in Mailpit at
<http://localhost:8025>; open its link and carry on as in [Getting started](./getting-started.md).
The first person to sign up is not special: each account creates or joins its own
organisation.

To stop everything, run the same command with `down` in place of `up -d --build`. Your data stays
in Docker volumes until you add `-v`, which deletes it.

## Run it on a server

A server needs three host names, HTTPS and a real mail server. Everything else is the same.

### 1. Point three names at the server

Create an `A` (or `AAAA`) record for each, all under the same parent domain:

| Name                  | Serves                                                    |
| --------------------- | --------------------------------------------------------- |
| `work.example.com`    | The web app                                               |
| `api.example.com`     | The API, the MCP endpoint and attachment downloads        |
| `storage.example.com` | File storage: uploads go straight here from the browser   |

The web app and the API must share a parent domain. The session cookie is set for
`.example.com` so that both can read it; on two unrelated domains, sign-in cannot work.

Open ports 80 and 443 on the server's firewall, and no others. Caddy needs port 80 to obtain its
certificates.

### 2. Change the addresses in `infra/docker/.env`

```sh
APP_BASE_URL=https://work.example.com
API_BASE_URL=https://api.example.com
S3_BROWSER_ENDPOINT=https://storage.example.com
S3_PUBLIC_BUCKET_BASE_URL=https://storage.example.com/nl-public
SESSION_COOKIE_DOMAIN=.example.com
APP_HOST=work.example.com
API_HOST=api.example.com
STORAGE_HOST=storage.example.com
TRUST_PROXY=1
```

`TRUST_PROXY=1` tells the API that one proxy, Caddy, sits in front of it, so it records each
visitor's real address instead of Caddy's.

### 3. Set up mail

Replace the Mailpit lines with your mail server's. Any SMTP server works:

```sh
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
EMAIL_FROM="Nothing Left <noreply@example.com>"
SUPPORT_EMAIL=help@example.com
```

`EMAIL_PROVIDER=resend` with `RESEND_API_KEY`, or `zoho` with `ZOHO_EMAIL_API_KEY`, sends through
those services' APIs instead. `SUPPORT_EMAIL` is where replies to any email go, and the address
the app shows where it says "email us".

### 4. Start it with HTTPS

```sh
docker compose --env-file infra/docker/.env --profile app --profile proxy up -d --build
```

The web image is rebuilt because its API address changed: the web app's address for the API is
compiled into it. Open `https://work.example.com` once Caddy has its certificates, usually within
a minute.

### 5. Connect an agent

Agents reach the MCP endpoint at `https://api.example.com/mcp`. Follow [Connecting an AI
agent](./mcp.md) with that address in place of the hosted one; for the stdio shim, set
`NOTHINGLEFT_MCP_URL` to it.

## Settings

`infra/docker/.env` holds everything that differs between installs. The compose file supplies
the rest: the database, Redis and storage addresses inside Docker. The settings you are most
likely to change:

| Setting                                           | What it does                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `APP_BASE_URL`, `API_BASE_URL`                    | Where people reach the web app and the API. Links in emails use them            |
| `S3_BROWSER_ENDPOINT`                             | Where browsers reach file storage to upload and download                        |
| `S3_PUBLIC_BUCKET_BASE_URL`                       | Where browsers load avatars from                                                |
| `SESSION_COOKIE_DOMAIN`                           | The parent domain the web app and the API share, with a leading dot             |
| `TRUST_PROXY`                                     | How many proxies sit in front of the API: `false` for none, `1` behind Caddy    |
| `EMAIL_PROVIDER`, `SMTP_*`, `EMAIL_FROM`          | How mail is sent, and from whom                                                 |
| `GOOGLE_CLIENT_ID`, `GITHUB_CLIENT_ID` and secret | Sign-in with Google or GitHub. Register `APP_BASE_URL/auth/google/callback` (or `github`) with the provider |
| `FREE_SEAT_LIMIT`, `FREE_STORAGE_BYTES`           | The member count at which the seat notice starts, and each organisation's storage limit ([Limits and billing](./limits-and-billing.md#self-hosting)) |
| `ASSET_BASE_URL`                                  | Where the logo in emails loads from. Unset, it loads from the hosted service's public assets |

Product analytics and error reports are off unless you set `POSTHOG_KEY` and turn them on. The
[environment reference](https://github.com/nothingleft-dev/nothingleft/blob/main/docs/infrastructure.md#environment-configuration)
lists every variable the API reads.

After changing `infra/docker/.env`, run the start command again. Compose restarts what changed;
add `--build` when an address in `APP_BASE_URL`, `API_BASE_URL` or `SUPPORT_EMAIL` changed, since
the web image carries them.

## Who can sign up

Anyone who can open the web app's address can create an account and their own organisation.
There is no setting that turns sign-up off. To keep an install to your team, put it where only
your team can reach it: a private network, a VPN, or a firewall rule that allows your offices'
addresses.

## Upgrading

```sh
git pull
docker compose --env-file infra/docker/.env --profile app --profile proxy up -d --build
```

Back up first. The `migrate` job updates the database before the new API starts. If it fails,
the command stops before replacing the API, and `logs migrate` says why.

## Backups

Two things hold your data: the database and the file store. Back up both, at the same time.

```sh
docker compose --env-file infra/docker/.env exec -T postgres \
  pg_dump -U nothingleft -Fc nothingleft > nothingleft-$(date +%F).dump
docker compose --env-file infra/docker/.env cp storage:/data ./storage-$(date +%F)
```

Keep `infra/docker/.env` with them: a database restored without its `ENCRYPTION_MASTER_KEY` has
two-factor and storage secrets nobody can read.

To restore, start from an empty install with the same `infra/docker/.env`, and bring back the
data before the app starts for the first time:

```sh
docker compose --env-file infra/docker/.env create storage
docker compose --env-file infra/docker/.env cp ./storage-2026-10-21/. storage:/data
docker compose --env-file infra/docker/.env up -d --wait postgres storage
docker compose --env-file infra/docker/.env exec -T postgres \
  pg_restore -U nothingleft -d nothingleft < nothingleft-2026-10-21.dump
docker compose --env-file infra/docker/.env exec -T postgres psql -U nothingleft -d nothingleft -c \
  "REVOKE ALL ON org_activity FROM PUBLIC, nothingleft_app; GRANT SELECT, INSERT ON org_activity TO nothingleft_app;"
```

The last line keeps the audit log append-only: a restore otherwise lets the app change past
entries. Then start the app as usual.

## Day to day

| Task                         | Command (after `docker compose --env-file infra/docker/.env`)                      |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| Follow the API's log         | `logs -f api`                                                                      |
| See what is running          | `ps`                                                                               |
| Deactivate an account        | `exec api bun run account deactivate someone@example.com`                          |
| Reactivate it                | `exec api bun run account reactivate someone@example.com`                          |
| Check every dependency       | `curl -s http://localhost:4000/health/deep` on the server                          |

`/health` answers whenever the API is running; `/health/deep` also checks the database, Redis
and the private bucket. Point an uptime checker at it no more often than every 10 seconds.

## When something goes wrong

**The API keeps restarting.** `logs api` shows `Invalid environment` followed by the setting at
fault and why. Production refuses to start without `ENCRYPTION_MASTER_KEY`, `EMAIL_LINK_SECRET`
and the chosen mail provider's settings.

**`migrate` or the API cannot log in to the database.** The two database passwords are set when
the database is first created. Changing them in `infra/docker/.env` afterwards does not change
them in PostgreSQL. Put the old values back, or change them in the database with `ALTER ROLE`.

**Sign-in goes straight back to the sign-in page.** The browser is not keeping the session
cookie. Check that the web app and the API share a parent domain, that `SESSION_COOKIE_DOMAIN`
names it with a leading dot, and that both are served over HTTPS.

**Uploads fail.** Open the browser's network panel. A request to the wrong host means
`S3_BROWSER_ENDPOINT` is not the address the browser can reach. A CORS error means the buckets
still allow the previous `APP_BASE_URL`: `storage-init` updates them on every start, so start
the stack again.

**No email arrives.** Look for `email not sent` in `logs api`. On a trial install, the email is
in Mailpit at <http://localhost:8025>.

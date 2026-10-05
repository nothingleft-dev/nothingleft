# @nothingleft/api

From the repository root:

```sh
bun install
cp apps/api/.env.example apps/api/.env  # fill Neon + Upstash + PostHog values
bun run --filter '@nothingleft/db' db:migrate
bun run --filter '@nothingleft/api' dev  # http://localhost:4000
bun run --filter '@nothingleft/api' test # needs the configured Postgres + Redis
```

Everything else — layers, aliases, logging, analytics, how to add an
endpoint — is in `docs/backend-guide.md`.

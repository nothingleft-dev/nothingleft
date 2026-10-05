# @nothingleft/web

From the repository root:

```sh
bun install
cp apps/web/.env.example apps/web/.env  # NEXT_PUBLIC_API_BASE_URL points to the API
cp apps/api/.env.example apps/api/.env  # fill backend values if not already configured
bun run --filter '@nothingleft/api' dev # API on :4000
# In another terminal:
bun run --filter '@nothingleft/web' dev # http://localhost:3000
```

Everything else — layout, aliases, the API client, theming, how to add a
page — is in `docs/frontend-guide.md`.

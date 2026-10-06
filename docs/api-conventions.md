# API Conventions

Resource paths are settled during implementation. Everything in this document
is **not** left open, because other parts of the system depend on it.

## One response envelope

Every response has the same top-level shape. The contents differ; the
structure never does. A client that can parse one response can parse all of
them.

### Success — single resource

```json
{
  "data": { "key": "PMS-118", "title": "Login redirect loops", "…": "…" },
  "meta": { "request_id": "01937f2a-…" }
}
```

### Success — collection

```json
{
  "data": [ { "…": "…" }, { "…": "…" } ],
  "meta": {
    "request_id": "01937f2a-…",
    "pagination": {
      "total": 248,
      "limit": 50,
      "offset": 0,
      "next_cursor": "eyJpZCI6…",
      "has_more": true
    }
  }
}
```

### Error

```json
{
  "error": {
    "code": "invalid_status",
    "message": "Unknown status \"Done\" for project PMS.",
    "field": "status",
    "valid_values": ["Submitted", "Open", "In Progress",
                     "Reopened", "Fixed", "Closed"],
    "request_id": "01937f2a-…"
  }
}
```

### Rules

- **`data` and `error` are mutually exclusive.** Never both, never neither.
- **`data` is always present on success**, even for `DELETE`, which returns
  the deleted resource in its final state. A bare `204` forces the client
  into a special case.
- **`meta.request_id` is on every response**, success and error alike. It
  matches the log line and the analytics event, so a user's bug report maps
  to one trace.
- **`meta.pagination` appears on every collection**, even an unpaginated one.
  A client should never need to know which endpoints paginate.
- **Create, update and delete all return the full resource**, in the same
  shape `GET` returns it. No trimmed-down write responses — that is the
  difference the MCP server would otherwise have to work around.
- `code` is a stable, machine-readable string. It is part of the contract and
  does not change when the message is reworded.
- **A CSV download is the one success without an envelope.** Its path ends
  in `.csv` (`/v1/organizations/{slug}/activity/export.csv`, later
  `/v1/issues/export.csv`); it answers `text/csv` with a
  `Content-Disposition` filename and `X-Request-Id`. Its errors still use the
  error envelope. Decided 23 Sep 2026 (0c).
- **The files route answers `302`, not the envelope.** `GET {FILES_BASE_URL}/{id}/{filename}`
  redirects to a presigned storage URL; its errors still use the error envelope. Decided
  25 Sep 2026 (1f); [file-storage.md § Serving](./file-storage.md#serving--the-part-that-is-easy-to-get-wrong).
- **The one-click unsubscribe takes a form.** `POST /v1/notifications/unsubscribe` accepts
  `application/x-www-form-urlencoded` (`List-Unsubscribe=One-Click`, RFC 8058) as well as JSON,
  and needs no sign-in: the signed token in its query is the credential. It answers with the
  envelope. Decided 27 Sep 2026 (6a).
- **`/mcp` speaks JSON-RPC, not the envelope.** It is the MCP protocol endpoint,
  not a REST resource: its answers are the protocol's own framing. Only its
  `401 auth.pat_required`, raised before any JSON-RPC exists, uses the error
  envelope. Decided 25 Sep 2026 (2a); [mcp.md § Built in 2a](./mcp.md#built-in-2a).
- `valid_values` is present whenever the failure is a bad enum, status,
  priority, type, tag or field name. `mcp.md` promises errors an agent can
  recover from; this is where that promise is kept.
- A search-query error (`query.*`) also carries `span: {start, end}`, the
  characters of the query at fault, and `field` names the parameter (`q`,
  `sort`, or `query` on a saved view). Decided 24 Sep 2026 (1c).
- A token refused only for a missing scope answers `403 token.scope_missing` and adds
  `scope`, the scope a new token needs (`"scope": "issues:write"`), so an agent can tell its
  person which token to create. A refusal by role stays `forbidden`. Decided 26 Sep 2026
  (2b); [permissions.md](./permissions.md#rules-that-bind-the-whole-table).
- A grouped issue list adds `meta.groups` — every group's value, label, colour
  and count over the whole filtered set, not just the page, plus the status
  `category` when grouped by status (added 24 Sep 2026 for DESIGN-SYSTEM § 8a). It is the one
  addition to `meta` beyond `request_id` and `pagination`.

## Pagination

Both forms, chosen per endpoint and never mixed within one:

| Form | Used for | Why |
|---|---|---|
| **Offset** | Issue lists, reports, member lists | The UI shows "page 4 of 12" and users jump around |
| **Cursor** | Activity, comments, notifications, audit log | Append-only streams; offset paging skips or repeats rows when writes land mid-scroll |

## PATCH distinguishes unchanged from cleared

An absent key means leave it alone. An explicit `null` means clear it.

```json
{ "due_date": null }    // clear the due date
{ "title": "New" }      // due_date untouched
```

Without this, clearing a due date is impossible through the API and "No due
date" becomes unreachable.

## Issue keys are one path segment

```
/v1/issues/PMS-118            ✅
/v1/projects/PMS/issues/118   ❌
```

`PMS-118` is the identifier people say out loud and paste into chat.
Splitting it means every client reassembles it, and the MCP contract — human
identifiers, never internal IDs — depends on passing it whole.

## Organisation selection

Browser requests act within `sessions.current_org_id`. PAT requests may send
`X-Organization: <slug>`; when absent the API resolves the organisation from
the user's memberships and the project key, and answers `400
organization_ambiguous` with `valid_values` when it cannot. Full rules in
[auth-and-tenancy.md § Current organisation](./auth-and-tenancy.md#current-organisation).

## Idempotency

Agents retry. `create_issue` fired twice on a flaky connection must not
produce two issues.

Mutating requests accept an `Idempotency-Key` header. The first response is
stored and replayed for 24 hours. The MCP server sets the header
automatically; the web client sets it on create operations.

The store is **Redis**, keyed by principal, organisation and key, with a 24-hour TTL
(decided 21 Sep 2026; organisation added 1 Oct 2026). It is a cache with an expiry,
which is what Redis is for; a table would need its own purge job. Redis unavailable
degrades to no replay protection, never to a failed request — the same posture as rate
limiting.

How it behaves (decided 24 Sep 2026, built in 1b as `@plugins/idempotency`):

- The key is scoped to the **credential** — a session or a PAT — and to the
  **organisation** the request acts in: the session's current organisation, or the
  PAT's `X-Organization` (none when the header is absent). Two callers can never
  collide, and a retry under another organisation is a new request rather than a
  replay or a `422`. The key is 1–255 characters.
- A fingerprint of method, URL and body is stored with the response. The
  same key with a **different request** answers `422 idempotency.key_reused`.
- While the first request is still running, a second one with its key
  answers `409 idempotency.in_progress`.
- Every completed response is stored, 4xx included, and replayed byte for
  byte with `Idempotent-Replayed: true`. **5xx and `429` are not stored**:
  they say nothing about the request, so the key is released for the retry.
- A replay re-checks that you can still read what the first request acted in. The
  organisations and projects it resolved are stored with its response; a caller who has
  since been removed from one gets that organisation's `404 organization.not_found` or
  that project's `404 project.not_found`, and the stored response stays in place. The
  re-check is read access only: a role lowered since the first request still replays
  the response that request already returned.
- The 24 hours run from the first request; storing the response keeps that
  expiry.

## CORS and exposed headers

`work.nothingleft.dev` and `api.nothingleft.dev` are the same *site* — which
is what lets the session cookie be `SameSite=Lax` — but different *origins*,
so CORS applies to every request the browser makes.

By default a browser exposes only the CORS-safelisted response headers
(`Cache-Control`, `Content-Language`, `Content-Length`, `Content-Type`,
`Expires`, `Last-Modified`, `Pragma`). **Every other header is invisible to
JavaScript**, silently — `response.headers.get('x-request-id')` returns
`null` with no error.

So the API must name them:

```ts
await app.register(cors, {
  origin: env.APP_BASE_URL,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  exposedHeaders: [
    'x-request-id',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'retry-after',
    'content-disposition',
  ],
});
```

Why each matters:

- **`x-request-id`** — the API client attaches it to every error it reports,
  so a user's screenshot maps to one server trace. The body's
  `meta.request_id` covers responses with a body; the header is what a `502`,
  a timeout or an opaque failure leaves behind.
- **Rate-limit headers** — `mcp.md` promises "limits are returned in response
  headers so a well-behaved client can pace itself". Unexposed, that promise
  is false for every browser client.
- **`retry-after`** — sent with `429`, and not safelisted either.
- **`content-disposition`** — carries the filename of a CSV download, the one
  kind of success that is not an envelope (see Rules).

## Message catalogue

**No user-facing string is written inline in the backend.** Every message an
end user can see resolves from a catalogue.

```
packages/i18n/
└── en.json
```

```json
{
  "error.issue.unknown_status": "Unknown status \"{status}\" for project {project}.",
  "error.auth.invalid_credentials": "That email or password is incorrect.",
  "error.storage.quota_exceeded": "Your organisation has used all 5GB of storage.",
  "email.invite.subject": "You've been invited to {org} · Nothing Left",
  "notification.assigned.summary": "{actor} assigned {issue} to you"
}
```

Covered: API error messages, email subjects and bodies, notification summary
lines, validation messages, webhook failure notices.

English only, with no plan for another language. The point is not
translation — it is that **every message a user can see lives in one file**.
Rewording an error becomes editing one line of JSON rather than hunting
through handlers, and the full set of things the product says can be read
in one sitting.

`error.code` values in the envelope map one-to-one onto catalogue keys, so
adding an error means adding a key, and a missing key fails CI rather than
shipping `undefined` to a user.

A lint rule bans user-facing string literals in `apps/api/src`.

The web app does **not** use this. It has no i18n layer; its strings are
inline. Only messages that cross the API boundary are catalogued.

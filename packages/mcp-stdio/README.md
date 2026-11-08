# @nothingleft/mcp

Connects a stdio MCP client, such as Claude Desktop or Claude Code, to
[Nothing Left](https://nothingleft.dev). It forwards each message to the hosted MCP endpoint
with your personal access token. Requires Node.js 20 or later.

Create a token in Nothing Left under **Settings → Access tokens**.

## Claude Code

```sh
claude mcp add nothingleft \
  -e NOTHINGLEFT_TOKEN=nl_pat_… \
  -- npx -y @nothingleft/mcp
```

This connects it in the current project only. Add `--scope user` for every project, or
`--scope project` to share it through the repository's `.mcp.json` (with
`NOTHINGLEFT_TOKEN=${NOTHINGLEFT_TOKEN}`, so the token stays out of the file). Options go before the
server name: anything after `--` is passed to this package, which ignores it.

## Claude Desktop

Open **Settings → Developer → Edit Config** and add:

```json
{
  "mcpServers": {
    "nothingleft": {
      "command": "npx",
      "args": ["-y", "@nothingleft/mcp"],
      "env": { "NOTHINGLEFT_TOKEN": "nl_pat_…" }
    }
  }
}
```

## Settings

| Variable              | Meaning                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `NOTHINGLEFT_TOKEN`   | Your personal access token. Required                                                              |
| `NOTHINGLEFT_MCP_URL` | The endpoint. Default `https://api.nothingleft.dev/mcp`; change it only for a self-hosted install |

Clients that speak MCP over HTTP can skip this package and connect to
`https://api.nothingleft.dev/mcp` directly. See the
[MCP guide](https://nothingleft.dev/docs/mcp) for every supported agent.

## Changelog

The package and the hosted server share one version number; the server reports it in `serverInfo`.

### 0.2.1

- When the client closes the connection with a notification stream still open, the shim now
  ends that stream and exits. Before, Node's fetch could miss the abort and leave the process
  running in the background, holding the stream open.

### 0.2.0

- A create that is repeated with the same arguments within 10 minutes, typically a retry after a
  client timeout, returns the first result with a notice instead of creating a duplicate. This
  covers every tool that adds something: `create_*`, `add_comment`, `log_time`,
  `upload_attachment`, `invite_member`, `start_csv_import` and `request_org_export`.
- Those tools take an optional `client_ref`. The same `client_ref` returns the first result; a new
  one creates on purpose, even with identical arguments.
- The server reports its real version instead of `0.0.0`.
- Notification streams (`subscriptions/listen`) are relayed as each event arrives, so the client
  gets its acknowledgement at once instead of timing out. Before, an open stream produced nothing
  until the edge gave up after 100 seconds, and Claude Code then dropped the connection.
- A request the client cancels is aborted and never answered afterwards, and cancelling one while
  its answer is still arriving no longer stops the shim.
- When the client closes the connection the shim closes its open streams and exits, instead of
  staying behind.

### 0.1.0

- First release.


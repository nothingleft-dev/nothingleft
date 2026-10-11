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

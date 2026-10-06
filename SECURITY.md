# Security policy

## Reporting a vulnerability

Please report it privately, through GitHub: the repository's **Security** tab →
**Report a vulnerability**. Do not open a public issue, pull request or discussion for it.

Include what you can of:

- what an attacker can do, and what they need first (an account, a role, a token scope)
- the endpoint, MCP tool or page involved, and the steps or request that show it
- whether you found it on the hosted service or on your own instance, and the commit

Use test accounts and organisations you control. Do not access, change or keep other
people's data, and do not degrade the service for others (no load or denial-of-service
testing against the hosted service).

We aim to acknowledge a report within five working days and to keep you updated until it
is resolved. Once a fix has shipped we publish an advisory and credit you, unless you
prefer not to be named.

## Supported versions

Nothing Left is in beta. Fixes land on `main` and on the hosted service; there are no
maintained release branches yet. If you run your own instance, stay on the latest `main`.

## What is in scope

The API (`apps/api`), the web app (`apps/web`), the MCP server and the `@nothingleft/mcp`
client (`packages/mcp`, `packages/mcp-stdio`), and the shared packages they use. Issues
in third-party services the hosted instance relies on belong with those providers.

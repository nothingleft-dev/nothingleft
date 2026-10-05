'use client';

import { useState, type ReactNode } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { CreatedPersonalAccessToken, PatScope } from '@nothingleft/types';
import { Button } from '@components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@components/ui/dialog';
import { Field } from '@components/auth/field';
import { FormAlert } from '@components/auth/form-alert';
import { CopyButton } from '@components/copy-button';
import { ChoiceSelect } from '@components/choice-select';
import { ScopeChecklist } from '@components/settings/token-scopes';
import { useApiError } from '@hooks/use-api-error';
import { useCreateToken, useTokenFirstUse } from '@hooks/use-tokens';
import { formatTime } from '@lib/datetime';
import { env } from '@lib/env';

// What an agent triaging issues needs; admin scopes are a deliberate extra tick.
const AGENT_SCOPES: PatScope[] = ['issues:read', 'issues:write', 'comments:write', 'time:write'];

const mcpUrl = () => `${env.apiBaseUrl}/mcp`;
const json = (value: object) => JSON.stringify(value, null, 2);
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

interface AgentClient {
  value: string;
  label: string;
  hint: string;
  /** Where the config goes. */
  where: string;
  /** How the person sees it connected, before asking the first question. */
  check: ReactNode;
  config: (token: string) => string;
}

const cmd = (text: string) => <code className="rounded-xs bg-inset px-1 font-mono text-2xs text-text">{text}</code>;

// Every client below speaks Streamable HTTP with a bearer header except Claude Desktop,
// which only starts local servers and so runs the stdio shim.
const CLIENTS: readonly AgentClient[] = [
  {
    value: 'claude-code',
    label: 'Claude Code',
    hint: 'Terminal, over HTTP. Nothing to install.',
    where: 'Run this in a terminal.',
    check: <>Run {cmd('claude mcp list')} — nothingleft should say ✓ Connected.</>,
    config: t => `claude mcp add --transport http nothingleft ${mcpUrl()} --header "Authorization: Bearer ${t}"`,
  },
  {
    value: 'claude-code-stdio',
    label: 'Claude Code (stdio)',
    hint: 'Terminal, through the local shim. Needs Node.js 20.',
    where: 'Run this in a terminal.',
    check: <>Run {cmd('claude mcp list')} — nothingleft should say ✓ Connected.</>,
    config: t =>
      `claude mcp add nothingleft -e NOTHINGLEFT_TOKEN=${t} -e NOTHINGLEFT_MCP_URL=${mcpUrl()} -- npx -y @nothingleft/mcp`,
  },
  {
    value: 'claude-desktop',
    label: 'Claude Desktop',
    hint: 'The desktop app, through the local shim. Needs Node.js 20.',
    where: 'In Claude Desktop, open Settings → Developer → Edit Config, add this, and restart it.',
    check: <>Nothing Left appears in the tools menu after the restart.</>,
    config: t =>
      json({
        mcpServers: {
          nothingleft: {
            command: 'npx',
            args: ['-y', '@nothingleft/mcp'],
            env: { NOTHINGLEFT_TOKEN: t, NOTHINGLEFT_MCP_URL: mcpUrl() },
          },
        },
      }),
  },
  {
    value: 'codex',
    label: 'Codex (OpenAI)',
    hint: 'The Codex CLI and IDE extension.',
    where: 'Add this to ~/.codex/config.toml.',
    check: <>Run {cmd('codex mcp list')} — nothingleft is listed.</>,
    config: t => `[mcp_servers.nothingleft]\nurl = "${mcpUrl()}"\nhttp_headers = { Authorization = "Bearer ${t}" }`,
  },
  {
    value: 'cursor',
    label: 'Cursor',
    hint: 'The Cursor editor.',
    where: 'Add this to ~/.cursor/mcp.json (or .cursor/mcp.json in one project).',
    check: <>Settings → MCP shows nothingleft with a green dot.</>,
    config: t => json({ mcpServers: { nothingleft: { url: mcpUrl(), headers: bearer(t) } } }),
  },
  {
    value: 'vscode',
    label: 'VS Code (Copilot)',
    hint: 'GitHub Copilot agent mode in VS Code.',
    where: 'Add this to .vscode/mcp.json in your workspace.',
    check: <>Run {cmd('MCP: List Servers')} from the command palette — nothingleft is running.</>,
    config: t => json({ servers: { nothingleft: { type: 'http', url: mcpUrl(), headers: bearer(t) } } }),
  },
  {
    value: 'antigravity',
    label: 'Antigravity',
    hint: "Google's agent IDE.",
    where: 'Open the agent panel → Manage MCP Servers → View raw config, and add this.',
    check: <>nothingleft appears in Manage MCP Servers with its tools.</>,
    config: t => json({ mcpServers: { nothingleft: { serverUrl: mcpUrl(), headers: bearer(t) } } }),
  },
  {
    value: 'windsurf',
    label: 'Windsurf',
    hint: 'The Windsurf editor.',
    where: 'Add this to ~/.codeium/windsurf/mcp_config.json.',
    check: <>The MCP panel shows nothingleft with its tools.</>,
    config: t => json({ mcpServers: { nothingleft: { serverUrl: mcpUrl(), headers: bearer(t) } } }),
  },
  {
    value: 'gemini',
    label: 'Gemini CLI',
    hint: "Google's terminal agent.",
    where: 'Add this to ~/.gemini/settings.json.',
    check: <>Type {cmd('/mcp')} in the CLI — nothingleft is connected.</>,
    config: t => json({ mcpServers: { nothingleft: { httpUrl: mcpUrl(), headers: bearer(t) } } }),
  },
];

/** onboarding.md § The first empty state: token, config block, one command to verify. */
export function ConnectAgentDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedPersonalAccessToken | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setCreated(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        {created ? <ConnectStep token={created} onDone={() => setOpen(false)} /> : <TokenStep onCreated={setCreated} />}
      </DialogContent>
    </Dialog>
  );
}

function TokenStep({ onCreated }: { onCreated: (token: CreatedPersonalAccessToken) => void }) {
  const [name, setName] = useState('Claude Code');
  const [scopes, setScopes] = useState<PatScope[]>(AGENT_SCOPES);
  const create = useCreateToken();
  const error = useApiError(create.error);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Connect an LLM</DialogTitle>
        <DialogDescription>
          The agent acts as you through an access token. It can never do more than your role allows, and everything it
          changes is recorded under your name.
        </DialogDescription>
      </DialogHeader>

      {error.summary ? <FormAlert title={error.summary} /> : null}

      <form
        noValidate
        id="connect-agent-token"
        className="flex flex-col gap-4"
        onSubmit={event => {
          event.preventDefault();
          create.mutate({ name, scopes }, { onSuccess: onCreated });
        }}
      >
        <Field
          label="Token name"
          hint="Where it will live, so you can tell it apart later."
          value={name}
          error={error.fields['name']}
          onChange={e => setName(e.target.value)}
        />
        <ScopeChecklist value={scopes} onChange={setScopes} />
      </form>

      <DialogFooter>
        <Button type="submit" form="connect-agent-token" disabled={scopes.length === 0 || create.isPending}>
          {create.isPending ? 'Creating…' : 'Create token'}
        </Button>
      </DialogFooter>
    </>
  );
}

function ConnectStep({ token, onDone }: { token: CreatedPersonalAccessToken; onDone: () => void }) {
  const [clientId, setClientId] = useState(CLIENTS[0]!.value);
  const client = CLIENTS.find(c => c.value === clientId) ?? CLIENTS[0]!;
  const firstUse = useTokenFirstUse(token.id);
  const config = client.config(token.token);
  const usedAt = firstUse.data ?? null;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add Nothing Left to your agent</DialogTitle>
        <DialogDescription>
          The token is in the config below. This is the only time it is shown; you can revoke it in Settings → Access
          tokens.
        </DialogDescription>
      </DialogHeader>

      <div className="flex min-w-0 flex-col gap-3">
        <ChoiceSelect label="Your agent" value={clientId} options={CLIENTS} onChange={setClientId} showHint />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-secondary">{client.where}</p>
          <CopyButton value={config} what="Config" />
        </div>
        <pre className="min-w-0 rounded-md border bg-inset p-3 font-mono text-2xs leading-5 break-all whitespace-pre-wrap text-text">
          {config}
        </pre>
      </div>

      <section aria-label="Verify" className="flex flex-col gap-2 border-t pt-4">
        <h3 className="font-medium">Check it works</h3>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-text-secondary">
          <li>{client.check}</li>
          <li>
            Ask your agent <span className="text-text">“Who am I in Nothing Left?”</span> It answers with your name, the
            token’s scopes and your organisations.
          </li>
        </ol>
        <p role="status" className="flex items-center gap-2 text-xs">
          {usedAt ? (
            <>
              <CheckCircle2 className="size-icon-sm text-success-fg" />
              <span className="text-text">Connected. The first call arrived at {formatTime(usedAt)}.</span>
            </>
          ) : (
            <>
              <span className="size-2 animate-pulse rounded-full bg-text-muted" aria-hidden />
              <span className="text-text-muted">Waiting for the first call from this token…</span>
            </>
          )}
        </p>
      </section>

      <DialogFooter>
        <Button variant={usedAt ? 'default' : 'ghost'} onClick={onDone}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}

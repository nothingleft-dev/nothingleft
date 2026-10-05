import type { PatScope } from './constants.ts';

export type Principal =
  | { via: 'session'; userId: number; sessionId: number; currentOrgId: number | null }
  | {
      via: 'pat';
      userId: number;
      tokenId: number;
      scopes: readonly PatScope[];
      projectIds: readonly number[] | null;
      // Set when the MCP server made the call, for the MCP-vs-UI figures only: never an access decision.
      client?: 'mcp';
    };

/** The X-Nothingleft-Client value the MCP server sends on every API call it makes. */
export const MCP_CLIENT_HEADER = 'x-nothingleft-client';

export const viaOf = (principal: Principal): 'session' | 'pat' | 'mcp' =>
  principal.via === 'pat' && principal.client === 'mcp' ? 'mcp' : principal.via;

export type Credential = { kind: 'session'; token: string } | { kind: 'pat'; token: string };

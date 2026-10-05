import type { z } from 'zod';
import type { Endpoint, ToolContext } from './tool.ts';

export interface ResourceEntry {
  uri: string;
  name: string;
  description?: string;
}

/** A URI template a client can attach as context: `issue://{key}`. The markdown is what a tool would answer. */
export interface ResourceDefinition {
  name: string;
  title: string;
  description: string;
  /** RFC 6570. Any URI may end in `?org=<slug>` to name the organisation when a key exists in two of yours. */
  template: string;
  endpoints: readonly Endpoint[];
  list?: (ctx: ToolContext) => Promise<ResourceEntry[]>;
  read: (ctx: ToolContext, variables: Record<string, string>) => Promise<string>;
}

export const defineResource = (resource: ResourceDefinition): ResourceDefinition => resource;

export interface PromptResult {
  text: string;
  /** Context embedded beside it, so the model starts with the data instead of fetching it. */
  resources?: { uri: string; markdown: string }[];
}

/** Every argument is a string: MCP prompt arguments are, whatever a schema says. */
export interface PromptDefinition<S extends z.ZodObject = z.ZodObject> {
  name: string;
  title: string;
  description: string;
  input: S;
  build: (ctx: ToolContext, args: z.output<S>) => Promise<PromptResult>;
}

export const definePrompt = <S extends z.ZodObject>(prompt: PromptDefinition<S>): PromptDefinition<S> => prompt;

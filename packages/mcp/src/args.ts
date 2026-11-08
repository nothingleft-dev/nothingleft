import { z } from 'zod';

// Explained once, in the server instructions: the same sentence on every tool cost 13k characters.
export const org = z.string().trim().min(1).max(100).optional();

export const project = z.string().trim().min(1).max(20).describe('Project key.');

export const limit = z.number().int().min(1).max(50).optional().describe('1–50, default 20.');
export const offset = z.number().int().min(0).optional().describe('Rows to skip. Default 0.');

export const ORG_ROLES = { Member: 'member', 'Org Admin': 'org_admin' } as const;
export const PROJECT_ROLES = {
  Observer: 'observer',
  Contributor: 'contributor',
  'Project Admin': 'project_admin',
} as const;

export const orgRole = z.enum(Object.keys(ORG_ROLES) as [keyof typeof ORG_ROLES]);
export const projectRole = z.enum(Object.keys(PROJECT_ROLES) as [keyof typeof PROJECT_ROLES]);

export const DEFAULT_LIMIT = 20;

export const issue = z.string().trim().min(1).max(40).describe('Issue key, e.g. "PP-12".');

// How to name a person is in the server instructions; a field says only which person it wants.
export const person = z.string().trim().min(1).max(100);

export const people = (what: string) => z.array(person).max(50).describe(what);

export const calendarDate = z.iso.date().describe('YYYY-MM-DD.');

export const duration = z
  .union([z.number().int().min(1), z.string().trim().min(1).max(40)])
  .describe('"1w 2d 3h 30m" or minutes.');

export const markdown = (what: string) => z.string().max(300_000).describe(`${what}, in markdown.`);

export const cursor = z.string().max(200).optional().describe('From the previous page\'s "Pass cursor" line.');

// Its meaning is in the server instructions, once, rather than on each of the creating tools.
export const clientRef = z.string().trim().min(1).max(100).optional();

export const tagList = (what: string) =>
  z.array(z.string().trim().min(1).max(100)).max(50).describe(`${what}, by name or slug; new names are created.`);

export const sprint = z.string().trim().min(1).max(100).describe('Sprint by name or slug, e.g. "September 2026".');

export const board = z.string().trim().min(1).max(100).describe('Board by name or slug, e.g. "pp".');

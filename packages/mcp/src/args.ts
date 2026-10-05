import { z } from 'zod';

export const org = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .optional()
  .describe(
    'Organisation slug, e.g. "acme". Only needed when you belong to more than one organisation; list_orgs shows the slugs.',
  );

export const project = z.string().trim().min(1).max(20).describe('Project key, e.g. "PP".');

export const limit = z.number().int().min(1).max(50).optional().describe('Rows per page, 1–50. Default 20.');
export const offset = z.number().int().min(0).optional().describe('Rows to skip, from the previous page. Default 0.');

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

export const person = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .describe('A member: "@casey", "casey", "me", or their full name when only one member has it.');

export const people = (what: string) => z.array(person).max(50).describe(`${what}: "@casey", "me" or a full name.`);

export const calendarDate = z.iso.date().describe('A calendar date, YYYY-MM-DD.');

export const duration = z
  .union([z.number().int().min(1), z.string().trim().min(1).max(40)])
  .describe('"1w 2d 3h 30m" (the organisation\'s working day and week) or whole minutes.');

export const markdown = (what: string) => z.string().max(300_000).describe(`${what}, in markdown.`);

export const cursor = z.string().max(200).optional().describe('From the previous page\'s "Pass cursor" line.');

export const tagList = (what: string) =>
  z.array(z.string().trim().min(1).max(100)).max(50).describe(`${what}, by name or slug. A new name is created.`);

export const sprint = z.string().trim().min(1).max(100).describe('Sprint by name or slug, e.g. "September 2026".');

export const board = z.string().trim().min(1).max(100).describe('Board by name or slug, e.g. "pp".');

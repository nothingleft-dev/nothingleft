import type {
  CreateIssueType,
  CreatePriority,
  CreateWorkflowStatus,
  CreateWorkType,
  IssueType,
  Priority,
  UpdateIssueType,
  UpdatePriority,
  UpdateWorkflowStatus,
  UpdateWorkType,
  WorkflowStatus,
  WorkType,
} from '@nothingleft/types';
import { api } from '@lib/api/client';

export interface SchemaTables {
  statuses: { value: WorkflowStatus; create: CreateWorkflowStatus; update: UpdateWorkflowStatus };
  priorities: { value: Priority; create: CreatePriority; update: UpdatePriority };
  types: { value: IssueType; create: CreateIssueType; update: UpdateIssueType };
  'work-types': { value: WorkType; create: CreateWorkType; update: UpdateWorkType };
}

export type SchemaTable = keyof SchemaTables;
export type SchemaValue<T extends SchemaTable> = SchemaTables[T]['value'];

const base = (key: string, table: SchemaTable) => `/v1/projects/${encodeURIComponent(key)}/${table}`;
const one = (key: string, table: SchemaTable, name: string) => `${base(key, table)}/${encodeURIComponent(name)}`;

export const listSchemaValues = <T extends SchemaTable>(key: string, table: T) =>
  api.get<SchemaValue<T>[]>(base(key, table));

export const createSchemaValue = <T extends SchemaTable>(key: string, table: T, body: SchemaTables[T]['create']) =>
  api.post<SchemaValue<T>>(base(key, table), { body });

export const updateSchemaValue = <T extends SchemaTable>(
  key: string,
  table: T,
  name: string,
  body: SchemaTables[T]['update'],
) => api.patch<SchemaValue<T>>(one(key, table, name), { body });

export const deleteSchemaValue = <T extends SchemaTable>(key: string, table: T, name: string, moveTo?: string) =>
  api.delete<SchemaValue<T>>(one(key, table, name), { query: { move_to: moveTo } });

export const SUPPORT_ENDPOINT = '/api/support';

export const REQUEST_TYPES = [
  { id: 'problem', label: 'Report a problem' },
  { id: 'feedback', label: 'Beta feedback' },
  { id: 'account', label: 'Account help' },
  { id: 'question', label: 'A question about fit' },
] as const;

export const PRODUCT_AREAS = [
  { id: 'issues', label: 'Issues' },
  { id: 'sprints', label: 'Sprints and boards' },
  { id: 'search', label: 'Search and saved views' },
  { id: 'time', label: 'Time tracking' },
  { id: 'reports', label: 'Reports' },
  { id: 'knowledge-base', label: 'Knowledge base' },
  { id: 'agents', label: 'MCP and agents' },
  { id: 'account', label: 'Account and sign-in' },
  { id: 'storage', label: 'Files and storage' },
  { id: 'other', label: 'Something else' },
] as const;

export type RequestType = (typeof REQUEST_TYPES)[number]['id'];
export type ProductArea = (typeof PRODUCT_AREAS)[number]['id'];

export const LIMITS = { name: 100, email: 254, subject: 150, message: 5000 } as const;

// A person cannot read the form and fill it in faster than this; a script usually does.
export const MIN_FILL_MS = 2500;

export interface SupportRequest {
  type: RequestType;
  name: string;
  email: string;
  subject: string;
  message: string;
  area: ProductArea | '';
  /** Honeypot: hidden from people, so anything in it marks the request as automated. */
  website: string;
  elapsed_ms: number;
}

export type SupportField = 'type' | 'name' | 'email' | 'subject' | 'message' | 'area';

export type SupportErrorCode =
  | 'invalid_field'
  | 'invalid_body'
  | 'forbidden_origin'
  | 'not_configured'
  | 'storage_failed'
  | 'method_not_allowed'
  | 'not_found';

export interface SupportErrorBody {
  error: { code: SupportErrorCode; field?: SupportField };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function invalidField(input: SupportRequest): SupportField | undefined {
  if (!REQUEST_TYPES.some(t => t.id === input.type)) return 'type';
  if (input.name.length > LIMITS.name) return 'name';
  if (!EMAIL.test(input.email) || input.email.length > LIMITS.email) return 'email';
  if (!input.subject.trim() || input.subject.length > LIMITS.subject) return 'subject';
  if (!input.message.trim() || input.message.length > LIMITS.message) return 'message';
  if (input.area !== '' && !PRODUCT_AREAS.some(a => a.id === input.area)) return 'area';
  return undefined;
}

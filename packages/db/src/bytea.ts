import { customType } from 'drizzle-orm/pg-core';

// 32 raw bytes rather than 64 hex characters, with no case or encoding ambiguity
// — docs/data-model.md#conventions.
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

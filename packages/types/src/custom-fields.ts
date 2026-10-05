import { z } from 'zod';
import {
  CONFIG_NAME_MAX_LENGTH,
  CUSTOM_FIELD_DECIMALS_MAX,
  CUSTOM_FIELD_MULTI_MAX,
  CUSTOM_FIELD_OPTIONS_MAX,
  CUSTOM_FIELD_SLUG_MAX,
  CUSTOM_FIELD_TIME_ROLES,
  CUSTOM_FIELD_TYPES,
  LABEL_COLORS,
  WORK_ITEM_ATTRIBUTE_VALUES_MAX,
} from './constants.ts';
import { MemberRefSchema } from './organizations.ts';

export const CUSTOM_FIELD_SLUG_PATTERN = new RegExp(`^[a-z][a-z0-9-]{0,${CUSTOM_FIELD_SLUG_MAX - 1}}$`);

export const CustomFieldConfigSchema = z.strictObject({
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  decimals: z.number().int().min(0).max(CUSTOM_FIELD_DECIMALS_MAX).optional(),
});
export type CustomFieldConfig = z.infer<typeof CustomFieldConfigSchema>;

export const CustomFieldOptionSchema = z.object({
  name: z.string(),
  color: z.enum(LABEL_COLORS),
  position: z.number().int(),
  is_archived: z.boolean(),
});
export type CustomFieldOption = z.infer<typeof CustomFieldOptionSchema>;

// A value in the form a request writes it: an option's name, a username, an ISO date,
// minutes or `1h 30m`, true / false; a list for the multi types. null clears.
export const CustomFieldValueInputSchema = z
  .union([
    z.string().max(20_000),
    z.number().finite(),
    z.boolean(),
    z.array(z.string().trim().min(1).max(200)).max(CUSTOM_FIELD_MULTI_MAX),
  ])
  .nullable();
export type CustomFieldValueInput = z.infer<typeof CustomFieldValueInputSchema>;

// Keyed by slug or field name.
export const CustomFieldsInputSchema = z.record(z.string().trim().min(1).max(100), CustomFieldValueInputSchema);
export type CustomFieldsInput = z.infer<typeof CustomFieldsInputSchema>;

export const CustomFieldSchema = z.object({
  slug: z.string(),
  name: z.string(),
  type: z.enum(CUSTOM_FIELD_TYPES),
  config: CustomFieldConfigSchema,
  is_required: z.boolean(),
  default_value: CustomFieldValueInputSchema,
  // null reads "No <name>".
  empty_label: z.string().nullable(),
  // Issue type names; empty applies to every type.
  applies_to: z.array(z.string()),
  // Select and multi-select only; empty for every other type.
  options: z.array(CustomFieldOptionSchema),
  position: z.number().int(),
  is_archived: z.boolean(),
  // Set when the project uses this field as its Estimation or Spent time.
  time_role: z.enum(CUSTOM_FIELD_TIME_ROLES).nullable(),
  // Issues holding a value, hidden ones included (a type the field no longer applies to); what a delete destroys.
  issue_count: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type CustomField = z.infer<typeof CustomFieldSchema>;

const FieldNameSchema = z.string().trim().min(1).max(CONFIG_NAME_MAX_LENGTH);
const EmptyLabelSchema = z.string().trim().min(1).max(CONFIG_NAME_MAX_LENGTH);
const PositionSchema = z.number().int().min(0).max(999);
const TypeNamesSchema = z.array(z.string().trim().min(1).max(100)).max(50);
const OptionNameSchema = z.string().trim().min(1).max(CONFIG_NAME_MAX_LENGTH);

export const CreateCustomFieldOptionSchema = z.object({
  name: OptionNameSchema,
  color: z.enum(LABEL_COLORS).optional(),
  position: PositionSchema.optional(),
});
export type CreateCustomFieldOption = z.infer<typeof CreateCustomFieldOptionSchema>;

export const UpdateCustomFieldOptionSchema = z.object({
  name: OptionNameSchema.optional(),
  color: z.enum(LABEL_COLORS).optional(),
  position: PositionSchema.optional(),
  is_archived: z.boolean().optional(),
});
export type UpdateCustomFieldOption = z.infer<typeof UpdateCustomFieldOptionSchema>;

export const CreateCustomFieldSchema = z.object({
  name: FieldNameSchema,
  type: z.enum(CUSTOM_FIELD_TYPES),
  // Fixed once created; the slugified name when absent.
  slug: z.string().trim().min(1).max(CUSTOM_FIELD_SLUG_MAX).optional(),
  config: CustomFieldConfigSchema.optional(),
  is_required: z.boolean().optional(),
  default_value: CustomFieldValueInputSchema.optional(),
  empty_label: EmptyLabelSchema.nullable().optional(),
  applies_to: TypeNamesSchema.optional(),
  options: z.array(CreateCustomFieldOptionSchema).max(CUSTOM_FIELD_OPTIONS_MAX).optional(),
  position: PositionSchema.optional(),
});
export type CreateCustomField = z.infer<typeof CreateCustomFieldSchema>;

export const UpdateCustomFieldSchema = z.object({
  name: FieldNameSchema.optional(),
  config: CustomFieldConfigSchema.optional(),
  is_required: z.boolean().optional(),
  default_value: CustomFieldValueInputSchema.optional(),
  empty_label: EmptyLabelSchema.nullable().optional(),
  applies_to: TypeNamesSchema.optional(),
  position: PositionSchema.optional(),
  is_archived: z.boolean().optional(),
});
export type UpdateCustomField = z.infer<typeof UpdateCustomFieldSchema>;

export const CustomFieldOptionRefSchema = z.object({ name: z.string(), color: z.enum(LABEL_COLORS) });
export type CustomFieldOptionRef = z.infer<typeof CustomFieldOptionRefSchema>;

const valueEntry = <const K extends readonly [string, ...string[]], T extends z.ZodType>(types: K, value: T) =>
  z.object({
    slug: z.string(),
    name: z.string(),
    type: z.enum(types),
    empty_label: z.string(),
    value,
  });

// One entry per field that applies to the issue's type and is not archived, in field order.
// Empty is null, or [] for the multi types.
export const IssueCustomFieldValueSchema = z.discriminatedUnion('type', [
  valueEntry(['text', 'markdown', 'url'], z.string().nullable()),
  valueEntry(['number', 'integer', 'duration'], z.number().nullable()),
  // date: YYYY-MM-DD; datetime: an ISO instant.
  valueEntry(['date', 'datetime'], z.string().nullable()),
  valueEntry(['checkbox'], z.boolean()),
  valueEntry(['select'], CustomFieldOptionRefSchema.nullable()),
  valueEntry(['multi_select'], z.array(CustomFieldOptionRefSchema)),
  valueEntry(['user'], MemberRefSchema.nullable()),
  valueEntry(['multi_user'], z.array(MemberRefSchema)),
]);
export type IssueCustomFieldValue = z.infer<typeof IssueCustomFieldValueSchema>;

export const WorkItemAttributeValueSchema = z.object({
  name: z.string(),
  short_label: z.string(),
  position: z.number().int(),
  is_archived: z.boolean(),
});
export type WorkItemAttributeValue = z.infer<typeof WorkItemAttributeValueSchema>;

export const WorkItemAttributeSchema = z.object({
  name: z.string(),
  position: z.number().int(),
  is_archived: z.boolean(),
  values: z.array(WorkItemAttributeValueSchema),
});
export type WorkItemAttribute = z.infer<typeof WorkItemAttributeSchema>;

const ShortLabelSchema = z.string().trim().length(1);

export const CreateWorkItemAttributeValueSchema = z.object({
  name: OptionNameSchema,
  short_label: ShortLabelSchema.optional(),
  position: PositionSchema.optional(),
});
export type CreateWorkItemAttributeValue = z.infer<typeof CreateWorkItemAttributeValueSchema>;

export const UpdateWorkItemAttributeValueSchema = z.object({
  name: OptionNameSchema.optional(),
  short_label: ShortLabelSchema.optional(),
  position: PositionSchema.optional(),
  is_archived: z.boolean().optional(),
});
export type UpdateWorkItemAttributeValue = z.infer<typeof UpdateWorkItemAttributeValueSchema>;

export const CreateWorkItemAttributeSchema = z.object({
  name: FieldNameSchema,
  position: PositionSchema.optional(),
  values: z.array(CreateWorkItemAttributeValueSchema).max(WORK_ITEM_ATTRIBUTE_VALUES_MAX).optional(),
});
export type CreateWorkItemAttribute = z.infer<typeof CreateWorkItemAttributeSchema>;

export const UpdateWorkItemAttributeSchema = z.object({
  name: FieldNameSchema.optional(),
  position: PositionSchema.optional(),
  is_archived: z.boolean().optional(),
});
export type UpdateWorkItemAttribute = z.infer<typeof UpdateWorkItemAttributeSchema>;

// Attribute name → value name; null clears. Work type keeps its own `work_type` key.
export const WorkItemAttributesInputSchema = z.record(
  z.string().trim().min(1).max(100),
  z.string().trim().min(1).max(100).nullable(),
);
export type WorkItemAttributesInput = z.infer<typeof WorkItemAttributesInputSchema>;

export const WorkItemAttributeRefSchema = z.object({
  attribute: z.string(),
  value: z.object({ name: z.string(), short_label: z.string() }),
});
export type WorkItemAttributeRef = z.infer<typeof WorkItemAttributeRefSchema>;

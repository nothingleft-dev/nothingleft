CREATE TABLE "custom_fields" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "custom_fields_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"default_value" jsonb,
	"empty_label" text,
	"position" smallint NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custom_fields_project_slug_unique" UNIQUE("project_id","slug"),
	CONSTRAINT "custom_fields_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "custom_fields_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "custom_fields_type_check" CHECK ("custom_fields"."type" in ('text','markdown','number','integer','date','datetime','checkbox','select','multi_select','user','multi_user','url','duration'))
);
--> statement-breakpoint
CREATE TABLE "custom_field_applies_to" (
	"field_id" bigint NOT NULL,
	"type_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	CONSTRAINT "custom_field_applies_to_field_id_type_id_pk" PRIMARY KEY("field_id","type_id")
);
--> statement-breakpoint
CREATE TABLE "custom_field_options" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "custom_field_options_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"field_id" bigint NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'gray-2' NOT NULL,
	"position" smallint NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "custom_field_options_id_field_unique" UNIQUE("id","field_id")
);
--> statement-breakpoint
CREATE TABLE "issue_field_values" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "issue_field_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"issue_id" bigint NOT NULL,
	"field_id" bigint NOT NULL,
	"value_text" text,
	"value_number" double precision,
	"value_date" date,
	"value_timestamptz" timestamp with time zone,
	"value_bool" boolean,
	"option_id" bigint,
	"user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_field_values_value_unique" UNIQUE NULLS NOT DISTINCT("issue_id","field_id","option_id","user_id"),
	CONSTRAINT "issue_field_values_one_value_check" CHECK (num_nonnulls("issue_field_values"."value_text", "issue_field_values"."value_number", "issue_field_values"."value_date", "issue_field_values"."value_timestamptz", "issue_field_values"."value_bool", "issue_field_values"."option_id", "issue_field_values"."user_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "work_item_attributes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_item_attributes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"name" text NOT NULL,
	"position" smallint NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_attributes_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "work_item_attributes_id_project_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "work_item_attribute_values" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_item_attribute_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"attribute_id" bigint NOT NULL,
	"name" text NOT NULL,
	"short_label" char(1) NOT NULL,
	"position" smallint NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "work_item_attribute_values_id_attribute_unique" UNIQUE("id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE "work_item_values" (
	"work_item_id" bigint NOT NULL,
	"attribute_id" bigint NOT NULL,
	"value_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	CONSTRAINT "work_item_values_work_item_id_attribute_id_pk" PRIMARY KEY("work_item_id","attribute_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "estimation_field_id" bigint;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "spent_time_field_id" bigint;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_applies_to" ADD CONSTRAINT "custom_field_applies_to_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_applies_to" ADD CONSTRAINT "custom_field_applies_to_field_project_fk" FOREIGN KEY ("field_id","project_id") REFERENCES "public"."custom_fields"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_applies_to" ADD CONSTRAINT "custom_field_applies_to_type_project_fk" FOREIGN KEY ("type_id","project_id") REFERENCES "public"."issue_types"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_options" ADD CONSTRAINT "custom_field_options_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_options" ADD CONSTRAINT "custom_field_options_field_org_fk" FOREIGN KEY ("field_id","org_id") REFERENCES "public"."custom_fields"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_field_values" ADD CONSTRAINT "issue_field_values_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_field_values" ADD CONSTRAINT "issue_field_values_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_field_values" ADD CONSTRAINT "issue_field_values_issue_project_fk" FOREIGN KEY ("issue_id","project_id") REFERENCES "public"."issues"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_field_values" ADD CONSTRAINT "issue_field_values_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_field_values" ADD CONSTRAINT "issue_field_values_field_project_fk" FOREIGN KEY ("field_id","project_id") REFERENCES "public"."custom_fields"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_field_values" ADD CONSTRAINT "issue_field_values_option_field_fk" FOREIGN KEY ("option_id","field_id") REFERENCES "public"."custom_field_options"("id","field_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_attributes" ADD CONSTRAINT "work_item_attributes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_attributes" ADD CONSTRAINT "work_item_attributes_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_attribute_values" ADD CONSTRAINT "work_item_attribute_values_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_attribute_values" ADD CONSTRAINT "work_item_attribute_values_attribute_org_fk" FOREIGN KEY ("attribute_id","org_id") REFERENCES "public"."work_item_attributes"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_values" ADD CONSTRAINT "work_item_values_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_values" ADD CONSTRAINT "work_item_values_work_item_org_fk" FOREIGN KEY ("work_item_id","org_id") REFERENCES "public"."work_items"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_values" ADD CONSTRAINT "work_item_values_attribute_org_fk" FOREIGN KEY ("attribute_id","org_id") REFERENCES "public"."work_item_attributes"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_values" ADD CONSTRAINT "work_item_values_value_attribute_fk" FOREIGN KEY ("value_id","attribute_id") REFERENCES "public"."work_item_attribute_values"("id","attribute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_estimation_field_fk" FOREIGN KEY ("estimation_field_id","id") REFERENCES "public"."custom_fields"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_spent_time_field_fk" FOREIGN KEY ("spent_time_field_id","id") REFERENCES "public"."custom_fields"("id","project_id") ON DELETE no action ON UPDATE no action;
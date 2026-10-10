CREATE TABLE "import_jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"created_by" bigint NOT NULL,
	"source" text DEFAULT 'csv' NOT NULL,
	"filename" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"object_key" text,
	"status" text DEFAULT 'awaiting_upload' NOT NULL,
	"headers" text[],
	"column_mapping" jsonb,
	"total_rows" integer,
	"processed_rows" integer DEFAULT 0 NOT NULL,
	"created_issues" integer DEFAULT 0 NOT NULL,
	"failed_rows" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "import_jobs_source_check" CHECK ("import_jobs"."source" in ('csv')),
	CONSTRAINT "import_jobs_status_check" CHECK ("import_jobs"."status" in ('awaiting_upload','ready','queued','running','completed','failed','expired'))
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "export_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"created_by" bigint NOT NULL,
	"scope" text DEFAULT 'org' NOT NULL,
	"format" text DEFAULT 'json' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"object_key" text,
	"size_bytes" bigint,
	"file_count" integer,
	"missing_file_count" integer,
	"expires_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "export_jobs_scope_check" CHECK ("export_jobs"."scope" in ('org')),
	CONSTRAINT "export_jobs_format_check" CHECK ("export_jobs"."format" in ('json')),
	CONSTRAINT "export_jobs_status_check" CHECK ("export_jobs"."status" in ('queued','running','completed','failed','expired'))
);
--> statement-breakpoint
ALTER TABLE "org_activity" DROP CONSTRAINT "org_activity_kind_check";--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "export_jobs_one_pending_per_org" ON "export_jobs" USING btree ("org_id") WHERE "export_jobs"."status" in ('queued', 'running');--> statement-breakpoint
ALTER TABLE "org_activity" ADD CONSTRAINT "org_activity_kind_check" CHECK ("org_activity"."kind" in ('member_invited','member_joined','member_removed','role_changed','invite_created','invite_revoked','project_created','project_archived','project_deleted','schema_changed','custom_field_changed','storage_connected','storage_disconnected','ownership_transferred','org_settings_changed','export_requested','token_created','token_revoked','project_updated','project_unarchived','invite_rotated','username_changed','deletion_scheduled','deletion_cancelled','storage_updated','tag_renamed','tag_merged','tag_deleted'));
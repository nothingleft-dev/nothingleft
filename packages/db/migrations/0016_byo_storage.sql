CREATE TABLE "org_storage_configs" (
	"org_id" bigint PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"endpoint" text NOT NULL,
	"region" text NOT NULL,
	"bucket" text NOT NULL,
	"access_key_id" text NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone,
	"checked_at" timestamp with time zone,
	"last_error" text,
	"migration_state" text DEFAULT 'idle' NOT NULL,
	"migrated_bytes" bigint DEFAULT 0 NOT NULL,
	"total_bytes" bigint DEFAULT 0 NOT NULL,
	"migrated_files" integer DEFAULT 0 NOT NULL,
	"total_files" integer DEFAULT 0 NOT NULL,
	"migration_error" text,
	"migration_started_at" timestamp with time zone,
	"migration_finished_at" timestamp with time zone,
	"created_by" bigint NOT NULL,
	"updated_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_storage_configs_provider_check" CHECK ("org_storage_configs"."provider" in ('r2','s3')),
	CONSTRAINT "org_storage_configs_status_check" CHECK ("org_storage_configs"."status" in ('pending','verified','failed')),
	CONSTRAINT "org_storage_configs_migration_state_check" CHECK ("org_storage_configs"."migration_state" in ('idle','running','done','failed'))
);
--> statement-breakpoint
ALTER TABLE "org_activity" DROP CONSTRAINT "org_activity_kind_check";--> statement-breakpoint
ALTER TABLE "org_storage_configs" ADD CONSTRAINT "org_storage_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_storage_configs" ADD CONSTRAINT "org_storage_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_storage_configs" ADD CONSTRAINT "org_storage_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_activity" ADD CONSTRAINT "org_activity_kind_check" CHECK ("org_activity"."kind" in ('member_invited','member_joined','member_removed','role_changed','invite_created','invite_revoked','project_created','project_archived','project_deleted','schema_changed','custom_field_changed','storage_connected','storage_disconnected','ownership_transferred','org_settings_changed','export_requested','token_created','token_revoked','project_updated','project_unarchived','invite_rotated','username_changed','deletion_scheduled','deletion_cancelled','storage_updated'));
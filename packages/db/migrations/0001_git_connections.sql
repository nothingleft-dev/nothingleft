CREATE TABLE "git_connections" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "git_connections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"base_url" text NOT NULL,
	"auth_kind" text NOT NULL,
	"installation_id" text,
	"account_login" text NOT NULL,
	"account_avatar_url" text,
	"account_url" text NOT NULL,
	"token_ciphertext" text,
	"hook_id_hash" "bytea",
	"hook_secret_ciphertext" text,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_event_at" timestamp with time zone,
	"token_expires_at" timestamp with time zone,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "git_connections_hook_id_hash_unique" UNIQUE("hook_id_hash"),
	CONSTRAINT "git_connections_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "git_connections_auth_kind_check" CHECK ("git_connections"."auth_kind" in ('app_installation','token','manual')),
	CONSTRAINT "git_connections_status_check" CHECK ("git_connections"."status" in ('active','suspended','token_expired','failing','revoked')),
	CONSTRAINT "git_connections_last_error_check" CHECK ("git_connections"."last_error" in ('signature','processing','token_invalid','token_expired','suspended','uninstalled'))
);
--> statement-breakpoint
CREATE TABLE "git_repositories" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "git_repositories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"connection_id" bigint NOT NULL,
	"provider_repo_id" text NOT NULL,
	"full_name" text NOT NULL,
	"html_url" text NOT NULL,
	"default_branch" text NOT NULL,
	"is_private" boolean NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"provider_webhook_id" text,
	"webhook_status" text DEFAULT 'not_applicable' NOT NULL,
	"webhook_last_status_code" integer,
	"match_all_projects" boolean DEFAULT false NOT NULL,
	"merge_base_branches" text[],
	"last_event_at" timestamp with time zone,
	"backfill_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	CONSTRAINT "git_repositories_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "git_repositories_connection_provider_id_unique" UNIQUE("connection_id","provider_repo_id"),
	CONSTRAINT "git_repositories_webhook_status_check" CHECK ("git_repositories"."webhook_status" in ('active','failing','missing','not_applicable'))
);
--> statement-breakpoint
CREATE TABLE "project_repositories" (
	"project_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"linked_by" bigint NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_repositories_project_id_repository_id_pk" PRIMARY KEY("project_id","repository_id")
);
--> statement-breakpoint
CREATE TABLE "git_webhook_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "git_webhook_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"connection_id" bigint NOT NULL,
	"repository_id" bigint,
	"provider_repo_id" text,
	"delivery_id" text NOT NULL,
	"event_name" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"run_automations" boolean DEFAULT false NOT NULL,
	"payload" jsonb NOT NULL,
	"truncated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "git_webhook_events_connection_delivery_unique" UNIQUE("connection_id","delivery_id"),
	CONSTRAINT "git_webhook_events_status_check" CHECK ("git_webhook_events"."status" in ('pending','done','ignored','failed'))
);
--> statement-breakpoint
ALTER TABLE "org_activity" DROP CONSTRAINT "org_activity_kind_check";--> statement-breakpoint
ALTER TABLE "git_connections" ADD CONSTRAINT "git_connections_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_connections" ADD CONSTRAINT "git_connections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_repositories" ADD CONSTRAINT "git_repositories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_repositories" ADD CONSTRAINT "git_repositories_connection_org_fk" FOREIGN KEY ("connection_id","org_id") REFERENCES "public"."git_connections"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_repository_org_fk" FOREIGN KEY ("repository_id","org_id") REFERENCES "public"."git_repositories"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_webhook_events" ADD CONSTRAINT "git_webhook_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_webhook_events" ADD CONSTRAINT "git_webhook_events_connection_org_fk" FOREIGN KEY ("connection_id","org_id") REFERENCES "public"."git_connections"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_webhook_events" ADD CONSTRAINT "git_webhook_events_repository_org_fk" FOREIGN KEY ("repository_id","org_id") REFERENCES "public"."git_repositories"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "git_connections_installation_unique" ON "git_connections" USING btree ("provider","base_url","installation_id") WHERE "git_connections"."revoked_at" is null and "git_connections"."installation_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "git_connections_org_account_unique" ON "git_connections" USING btree ("org_id","provider","base_url",lower("account_login")) WHERE "git_connections"."revoked_at" is null;--> statement-breakpoint
ALTER TABLE "org_activity" ADD CONSTRAINT "org_activity_kind_check" CHECK ("org_activity"."kind" in ('member_invited','member_joined','member_removed','role_changed','invite_created','invite_revoked','project_created','project_archived','project_deleted','schema_changed','custom_field_changed','storage_connected','storage_disconnected','ownership_transferred','org_settings_changed','export_requested','token_created','token_revoked','project_updated','project_unarchived','invite_rotated','username_changed','deletion_scheduled','deletion_cancelled','storage_updated','tag_renamed','tag_merged','tag_deleted','git_connection_created','git_connection_removed','git_connection_error','repository_linked','repository_unlinked'));
CREATE TABLE "users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"name" text NOT NULL,
	"avatar_url" text,
	"password_hash" text,
	"google_id" text,
	"github_id" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"country_code" char(2),
	"last_login_at" timestamp with time zone,
	"last_login_ip" "inet",
	"totp_secret_ciphertext" text,
	"totp_enabled_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_github_id_unique" UNIQUE("github_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "organizations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_user_id" bigint NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"storage_used_bytes" bigint DEFAULT 0 NOT NULL,
	"workday_minutes" integer DEFAULT 480 NOT NULL,
	"workweek_days" integer DEFAULT 5 NOT NULL,
	"week_starts_on" smallint DEFAULT 1 NOT NULL,
	"deletion_scheduled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_plan_check" CHECK ("organizations"."plan" in ('free')),
	CONSTRAINT "organizations_week_starts_on_check" CHECK ("organizations"."week_starts_on" between 0 and 6)
);
--> statement-breakpoint
CREATE TABLE "org_members" (
	"org_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"username" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invited_by" bigint,
	"removed_at" timestamp with time zone,
	CONSTRAINT "org_members_org_id_user_id_pk" PRIMARY KEY("org_id","user_id"),
	CONSTRAINT "org_members_role_check" CHECK ("org_members"."role" in ('org_admin', 'member'))
);
--> statement-breakpoint
CREATE TABLE "org_activity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "org_activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"actor_id" bigint,
	"kind" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_activity_kind_check" CHECK ("org_activity"."kind" in ('member_invited','member_joined','member_removed','role_changed','invite_created','invite_revoked','project_created','project_archived','project_deleted','schema_changed','custom_field_changed','storage_connected','storage_disconnected','ownership_transferred','org_settings_changed','export_requested','token_created','token_revoked'))
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_activity" ADD CONSTRAINT "org_activity_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_activity" ADD CONSTRAINT "org_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_username_lower_unique" ON "org_members" USING btree ("org_id",lower("username"));--> statement-breakpoint
-- log_min_duration_statement is a server setting: docker-compose.yml sets it; Neon does not expose it.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

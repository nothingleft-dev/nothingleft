CREATE TABLE "users" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"name" text NOT NULL,
	"avatar_url" text,
	"avatar_object_key" text,
	"password_hash" text,
	"google_id" text,
	"github_id" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"country_code" char(2),
	"last_login_at" timestamp with time zone,
	"last_login_ip" "inet",
	"totp_secret_ciphertext" text,
	"totp_enabled_at" timestamp with time zone,
	"totp_last_used_step" bigint,
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
	"storage_notice_level" smallint DEFAULT 0 NOT NULL,
	"workday_minutes" integer DEFAULT 480 NOT NULL,
	"workweek_days" integer DEFAULT 5 NOT NULL,
	"week_starts_on" smallint DEFAULT 1 NOT NULL,
	"deletion_scheduled_at" timestamp with time zone,
	"deletion_reminder_sent_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug"),
	CONSTRAINT "organizations_plan_check" CHECK ("organizations"."plan" in ('free','pro','pro_lite','unlimited')),
	CONSTRAINT "organizations_week_starts_on_check" CHECK ("organizations"."week_starts_on" between 0 and 6),
	CONSTRAINT "organizations_storage_notice_level_check" CHECK ("organizations"."storage_notice_level" in (0,95,100)),
	CONSTRAINT "organizations_workday_minutes_check" CHECK ("organizations"."workday_minutes" between 1 and 1440),
	CONSTRAINT "organizations_workweek_days_check" CHECK ("organizations"."workweek_days" between 1 and 7),
	CONSTRAINT "organizations_storage_used_bytes_check" CHECK ("organizations"."storage_used_bytes" >= 0)
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
	CONSTRAINT "org_activity_kind_check" CHECK ("org_activity"."kind" in ('member_invited','member_joined','member_removed','role_changed','invite_created','invite_revoked','project_created','project_archived','project_deleted','schema_changed','custom_field_changed','storage_connected','storage_disconnected','ownership_transferred','org_settings_changed','export_requested','token_created','token_revoked','project_updated','project_unarchived','invite_rotated','username_changed','deletion_scheduled','deletion_cancelled','storage_updated','tag_renamed','tag_merged','tag_deleted'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"token_hash" "bytea" NOT NULL,
	"user_id" bigint NOT NULL,
	"current_org_id" bigint,
	"user_agent" text,
	"ip" "inet",
	"country_code" char(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "personal_access_tokens" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "personal_access_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"name" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"token_prefix" text NOT NULL,
	"scopes" text[] NOT NULL,
	"restricted" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "personal_access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "personal_access_token_projects" (
	"token_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	CONSTRAINT "personal_access_token_projects_token_id_project_id_pk" PRIMARY KEY("token_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "one_time_tokens" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "one_time_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"org_id" bigint,
	"new_email" text,
	"created_by" bigint,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "one_time_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "one_time_tokens_purpose_check" CHECK ("one_time_tokens"."purpose" in ('password_reset','email_verify','email_change','ownership_transfer')),
	CONSTRAINT "one_time_tokens_transfer_fields_check" CHECK ("one_time_tokens"."purpose" <> 'ownership_transfer' or ("one_time_tokens"."org_id" is not null and "one_time_tokens"."created_by" is not null)),
	CONSTRAINT "one_time_tokens_email_change_check" CHECK ("one_time_tokens"."purpose" <> 'email_change' or "one_time_tokens"."new_email" is not null)
);
--> statement-breakpoint
CREATE TABLE "totp_recovery_codes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "totp_recovery_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"code_hash" "bytea" NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description_md" text,
	"avatar_color" text NOT NULL,
	"avatar_initials" text NOT NULL,
	"lead_user_id" bigint,
	"issue_counter" integer DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"time_tracking_enabled" boolean DEFAULT true NOT NULL,
	"estimation_field_id" bigint,
	"spent_time_field_id" bigint,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_org_key_unique" UNIQUE("org_id","key"),
	CONSTRAINT "projects_org_slug_unique" UNIQUE("org_id","slug"),
	CONSTRAINT "projects_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "projects_issue_counter_check" CHECK ("projects"."issue_counter" >= 0),
	CONSTRAINT "projects_time_fields_distinct_check" CHECK ("projects"."estimation_field_id" is null or "projects"."spent_time_field_id" is null or "projects"."estimation_field_id" <> "projects"."spent_time_field_id")
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"project_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" bigint NOT NULL,
	CONSTRAINT "project_members_project_id_user_id_pk" PRIMARY KEY("project_id","user_id"),
	CONSTRAINT "project_members_role_check" CHECK ("project_members"."role" in ('project_admin','contributor','observer'))
);
--> statement-breakpoint
CREATE TABLE "invitation_uses" (
	"invitation_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" "inet",
	CONSTRAINT "invitation_uses_invitation_id_user_id_pk" PRIMARY KEY("invitation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invitations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"project_id" bigint,
	"kind" text NOT NULL,
	"email" text,
	"token_hash" "bytea" NOT NULL,
	"token" text,
	"org_role" text NOT NULL,
	"project_role" text,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"allowed_email_domain" text,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invitations_kind_check" CHECK ("invitations"."kind" in ('email','link')),
	CONSTRAINT "invitations_org_role_check" CHECK ("invitations"."org_role" in ('org_admin','member')),
	CONSTRAINT "invitations_token_kind_check" CHECK (("invitations"."kind" = 'link') = ("invitations"."token" is not null)),
	CONSTRAINT "invitations_project_role_check" CHECK ("invitations"."project_role" is null or "invitations"."project_role" in ('project_admin','contributor','observer'))
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" bigint PRIMARY KEY NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"last_project_id" bigint,
	"ui" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "user_preferences_theme_check" CHECK ("user_preferences"."theme" in ('light','dark','system'))
);
--> statement-breakpoint
CREATE TABLE "workflow_statuses" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "workflow_statuses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"color" text NOT NULL,
	"short_label" char(1) NOT NULL,
	"position" smallint NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "workflow_statuses_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "workflow_statuses_category_check" CHECK ("workflow_statuses"."category" in ('backlog','unstarted','started','done','cancelled')),
	CONSTRAINT "workflow_statuses_default_not_archived" CHECK (not ("workflow_statuses"."is_default" and "workflow_statuses"."is_archived"))
);
--> statement-breakpoint
CREATE TABLE "priorities" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "priorities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"short_label" char(1) NOT NULL,
	"position" smallint NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "priorities_id_project_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "issue_types" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "issue_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text NOT NULL,
	"short_label" char(1) NOT NULL,
	"position" smallint NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "issue_types_id_project_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "work_types" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"name" text NOT NULL,
	"short_label" char(1) NOT NULL,
	"position" smallint NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "work_types_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "work_types_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "work_types_default_not_archived" CHECK (not ("work_types"."is_default" and "work_types"."is_archived"))
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "issues_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"key_number" integer NOT NULL,
	"title" text NOT NULL,
	"description_md" text,
	"status_id" bigint NOT NULL,
	"priority_id" bigint NOT NULL,
	"type_id" bigint NOT NULL,
	"created_by" bigint NOT NULL,
	"updated_by" bigint NOT NULL,
	"parent_id" bigint,
	"sprint_id" bigint,
	"rank" double precision,
	"estimate_minutes" integer,
	"spent_minutes" integer DEFAULT 0 NOT NULL,
	"story_points" integer,
	"start_date" date,
	"due_date" date,
	"resolved_at" timestamp with time zone,
	"vote_count" integer DEFAULT 0 NOT NULL,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("issues"."title", '')), 'A') || setweight(to_tsvector('english', coalesce("issues"."description_md", '')), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "issues_project_key_number_unique" UNIQUE("project_id","key_number"),
	CONSTRAINT "issues_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "issues_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "issues_estimate_minutes_check" CHECK ("issues"."estimate_minutes" is null or "issues"."estimate_minutes" >= 0),
	CONSTRAINT "issues_spent_minutes_check" CHECK ("issues"."spent_minutes" >= 0),
	CONSTRAINT "issues_story_points_check" CHECK ("issues"."story_points" is null or "issues"."story_points" between 0 and 999),
	CONSTRAINT "issues_vote_count_check" CHECK ("issues"."vote_count" >= 0),
	CONSTRAINT "issues_comment_count_check" CHECK ("issues"."comment_count" >= 0),
	CONSTRAINT "issues_parent_id_check" CHECK ("issues"."parent_id" is null or "issues"."parent_id" <> "issues"."id"),
	CONSTRAINT "issues_start_date_check" CHECK ("issues"."start_date" is null or "issues"."due_date" is null or "issues"."start_date" <= "issues"."due_date")
);
--> statement-breakpoint
CREATE TABLE "issue_assignees" (
	"issue_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_assignees_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "issue_links" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "issue_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"from_issue_id" bigint NOT NULL,
	"to_issue_id" bigint NOT NULL,
	"type" text NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_links_from_to_type_unique" UNIQUE("from_issue_id","to_issue_id","type"),
	CONSTRAINT "issue_links_type_check" CHECK ("issue_links"."type" in ('relates','depends','duplicate','subtask')),
	CONSTRAINT "issue_links_from_issue_id_check" CHECK ("issue_links"."from_issue_id" <> "issue_links"."to_issue_id")
);
--> statement-breakpoint
CREATE TABLE "issue_tags" (
	"issue_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_tags_issue_id_tag_id_pk" PRIMARY KEY("issue_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_org_slug_unique" UNIQUE("org_id","slug"),
	CONSTRAINT "tags_id_org_unique" UNIQUE("id","org_id")
);
--> statement-breakpoint
CREATE TABLE "issue_stars" (
	"issue_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_stars_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "issue_votes" (
	"issue_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_votes_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "issue_watchers" (
	"issue_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_watchers_issue_id_user_id_pk" PRIMARY KEY("issue_id","user_id"),
	CONSTRAINT "issue_watchers_source_check" CHECK ("issue_watchers"."source" in ('explicit','auto'))
);
--> statement-breakpoint
CREATE TABLE "comment_reactions" (
	"comment_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_reactions_comment_id_user_id_emoji_pk" PRIMARY KEY("comment_id","user_id","emoji"),
	CONSTRAINT "comment_reactions_emoji_check" CHECK ("comment_reactions"."emoji" in ('👍','👎','🎉','👀','❤️'))
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "comments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"issue_id" bigint,
	"article_id" bigint,
	"author_id" bigint NOT NULL,
	"body_md" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "comments_id_org_unique" UNIQUE("id","org_id")
);
--> statement-breakpoint
CREATE TABLE "issue_activity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "issue_activity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"issue_id" bigint NOT NULL,
	"actor_id" bigint NOT NULL,
	"change_group_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"field" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_activity_kind_check" CHECK ("issue_activity"."kind" in ('created','field_changed','commented','comment_edited','comment_deleted','linked','unlinked','attached','detached','time_logged','tagged','untagged','sprint_changed','parent_changed','deleted','restored'))
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "mentions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"source_type" text NOT NULL,
	"source_id" bigint NOT NULL,
	"mentioned_user_id" bigint NOT NULL,
	"issue_id" bigint,
	"article_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentions_source_user_unique" UNIQUE("org_id","source_type","source_id","mentioned_user_id"),
	CONSTRAINT "mentions_source_type_check" CHECK ("mentions"."source_type" in ('issue','comment','work_item','article'))
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"issue_id" bigint NOT NULL,
	"author_id" bigint NOT NULL,
	"created_by" bigint NOT NULL,
	"work_date" date NOT NULL,
	"duration_minutes" integer NOT NULL,
	"work_type_id" bigint,
	"description_md" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_items_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "work_items_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "work_items_duration_minutes_check" CHECK ("work_items"."duration_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attachments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"public_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"org_id" bigint NOT NULL,
	"issue_id" bigint,
	"comment_id" bigint,
	"work_item_id" bigint,
	"article_id" bigint,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum" "bytea" NOT NULL,
	"storage_target" text NOT NULL,
	"storage_location_id" bigint,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"public_url" text,
	"width" integer,
	"height" integer,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "attachments_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "attachments_storage_target_check" CHECK ("attachments"."storage_target" in ('platform','byo')),
	CONSTRAINT "attachments_storage_location_check" CHECK (("attachments"."storage_target" = 'byo') = ("attachments"."storage_location_id" is not null)),
	CONSTRAINT "attachments_size_bytes_check" CHECK ("attachments"."size_bytes" >= 0),
	CONSTRAINT "attachments_width_check" CHECK ("attachments"."width" is null or "attachments"."width" > 0),
	CONSTRAINT "attachments_height_check" CHECK ("attachments"."height" is null or "attachments"."height" > 0),
	CONSTRAINT "attachments_parent_shape_check" CHECK (not ("attachments"."issue_id" is not null and "attachments"."article_id" is not null)
        and ("attachments"."work_item_id" is null or "attachments"."issue_id" is not null)
        and ("attachments"."comment_id" is null or "attachments"."issue_id" is not null or "attachments"."article_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_views_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"owner_id" bigint NOT NULL,
	"project_id" bigint,
	"name" text NOT NULL,
	"query" text NOT NULL,
	"query_ast" jsonb NOT NULL,
	"sort" jsonb NOT NULL,
	"columns" text[] NOT NULL,
	"visibility" text NOT NULL,
	"position" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_views_visibility_check" CHECK ("saved_views"."visibility" in ('private','project','org')),
	CONSTRAINT "saved_views_project_visibility_check" CHECK ("saved_views"."visibility" <> 'project' or "saved_views"."project_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "recent_searches" (
	"user_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"query_hash" "bytea" NOT NULL,
	"query" text NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"use_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "recent_searches_user_id_org_id_query_hash_pk" PRIMARY KEY("user_id","org_id","query_hash")
);
--> statement-breakpoint
CREATE TABLE "sprints" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sprints_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"goal_md" text,
	"start_date" date,
	"end_date" date,
	"state" text DEFAULT 'planned' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sprints_project_slug_unique" UNIQUE("project_id","slug"),
	CONSTRAINT "sprints_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "sprints_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "sprints_state_check" CHECK ("sprints"."state" in ('planned','active','completed')),
	CONSTRAINT "sprints_start_date_check" CHECK ("sprints"."start_date" is null or "sprints"."end_date" is null or "sprints"."start_date" <= "sprints"."end_date")
);
--> statement-breakpoint
CREATE TABLE "sprint_snapshots" (
	"sprint_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_points" integer NOT NULL,
	"completed_points" integer NOT NULL,
	"total_issues" integer NOT NULL,
	"completed_issues" integer NOT NULL,
	"remaining_estimate_minutes" integer NOT NULL,
	"total_estimate_minutes" integer,
	CONSTRAINT "sprint_snapshots_sprint_id_snapshot_date_pk" PRIMARY KEY("sprint_id","snapshot_date"),
	CONSTRAINT "sprint_snapshots_total_points_check" CHECK ("sprint_snapshots"."total_points" >= 0),
	CONSTRAINT "sprint_snapshots_completed_points_check" CHECK ("sprint_snapshots"."completed_points" >= 0 and "sprint_snapshots"."completed_points" <= "sprint_snapshots"."total_points"),
	CONSTRAINT "sprint_snapshots_total_issues_check" CHECK ("sprint_snapshots"."total_issues" >= 0),
	CONSTRAINT "sprint_snapshots_completed_issues_check" CHECK ("sprint_snapshots"."completed_issues" >= 0 and "sprint_snapshots"."completed_issues" <= "sprint_snapshots"."total_issues"),
	CONSTRAINT "sprint_snapshots_remaining_estimate_minutes_check" CHECK ("sprint_snapshots"."remaining_estimate_minutes" >= 0),
	CONSTRAINT "sprint_snapshots_total_estimate_minutes_check" CHECK ("sprint_snapshots"."total_estimate_minutes" is null or "sprint_snapshots"."total_estimate_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "boards_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"column_field" text DEFAULT 'status' NOT NULL,
	"swimlane_by" text DEFAULT 'none' NOT NULL,
	"swimlane_field" text,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boards_org_slug_unique" UNIQUE("org_id","slug"),
	CONSTRAINT "boards_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "boards_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "boards_column_field_check" CHECK ("boards"."column_field" in ('status','priority','type')),
	CONSTRAINT "boards_swimlane_by_check" CHECK ("boards"."swimlane_by" in ('none','values','issues')),
	CONSTRAINT "boards_swimlane_field_check" CHECK ("boards"."swimlane_field" in ('assignee','priority','type')),
	CONSTRAINT "boards_swimlane_field_mode_check" CHECK (("boards"."swimlane_by" = 'values') = ("boards"."swimlane_field" is not null))
);
--> statement-breakpoint
CREATE TABLE "board_columns" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "board_columns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"board_id" bigint NOT NULL,
	"name" text NOT NULL,
	"position" smallint NOT NULL,
	"wip_min" smallint,
	"wip_max" smallint,
	"is_collapsed_by_default" boolean DEFAULT false NOT NULL,
	CONSTRAINT "board_columns_board_position_unique" UNIQUE("board_id","position"),
	CONSTRAINT "board_columns_id_board_unique" UNIQUE("id","board_id"),
	CONSTRAINT "board_columns_wip_min_check" CHECK ("board_columns"."wip_min" is null or "board_columns"."wip_min" between 1 and 999),
	CONSTRAINT "board_columns_wip_max_check" CHECK ("board_columns"."wip_max" is null or "board_columns"."wip_max" between 1 and 999),
	CONSTRAINT "board_columns_wip_order_check" CHECK ("board_columns"."wip_min" is null or "board_columns"."wip_max" is null or "board_columns"."wip_min" <= "board_columns"."wip_max")
);
--> statement-breakpoint
CREATE TABLE "board_swimlane_types" (
	"board_id" bigint NOT NULL,
	"type_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	CONSTRAINT "board_swimlane_types_board_id_type_id_pk" PRIMARY KEY("board_id","type_id")
);
--> statement-breakpoint
CREATE TABLE "board_column_values" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "board_column_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"column_id" bigint NOT NULL,
	"board_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"status_id" bigint,
	"priority_id" bigint,
	"type_id" bigint,
	CONSTRAINT "board_column_values_board_status_unique" UNIQUE("board_id","status_id"),
	CONSTRAINT "board_column_values_board_priority_unique" UNIQUE("board_id","priority_id"),
	CONSTRAINT "board_column_values_board_type_unique" UNIQUE("board_id","type_id"),
	CONSTRAINT "board_column_values_one_value_check" CHECK (num_nonnulls("board_column_values"."status_id", "board_column_values"."priority_id", "board_column_values"."type_id") = 1)
);
--> statement-breakpoint
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
	"project_id" bigint NOT NULL,
	CONSTRAINT "work_item_values_work_item_id_attribute_id_pk" PRIMARY KEY("work_item_id","attribute_id")
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "articles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"parent_id" bigint,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"position" integer NOT NULL,
	"created_by" bigint NOT NULL,
	"updated_by" bigint NOT NULL,
	"published_at" timestamp with time zone,
	"search_tsv" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce("articles"."title", '')), 'A') || setweight(to_tsvector('english', coalesce("articles"."body_md", '')), 'B')) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "articles_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "articles_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "articles_status_check" CHECK ("articles"."status" in ('draft','published')),
	CONSTRAINT "articles_parent_id_check" CHECK ("articles"."parent_id" is null or "articles"."parent_id" <> "articles"."id")
);
--> statement-breakpoint
CREATE TABLE "article_tags" (
	"article_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"tag_id" bigint NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_tags_article_id_tag_id_pk" PRIMARY KEY("article_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "article_stars" (
	"article_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_stars_article_id_user_id_pk" PRIMARY KEY("article_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "article_watchers" (
	"article_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_watchers_article_id_user_id_pk" PRIMARY KEY("article_id","user_id"),
	CONSTRAINT "article_watchers_source_check" CHECK ("article_watchers"."source" in ('explicit','auto'))
);
--> statement-breakpoint
CREATE TABLE "article_issue_refs" (
	"article_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"issue_key" text NOT NULL,
	CONSTRAINT "article_issue_refs_org_id_issue_key_article_id_pk" PRIMARY KEY("org_id","issue_key","article_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"project_id" bigint,
	"issue_id" bigint,
	"comment_id" bigint,
	"article_id" bigint,
	"sprint_id" bigint,
	"actor_id" bigint,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_user_dedupe_unique" UNIQUE("user_id","dedupe_key"),
	CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('assigned','unassigned','mentioned','commented','status_changed','resolved','linked','due_soon','overdue','time_logged','sprint_started','sprint_finished','article_published','article_updated','reaction'))
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"email" text DEFAULT 'off' NOT NULL,
	CONSTRAINT "notification_preferences_user_id_kind_pk" PRIMARY KEY("user_id","kind"),
	CONSTRAINT "notification_preferences_kind_check" CHECK ("notification_preferences"."kind" in ('assigned','unassigned','mentioned','commented','status_changed','resolved','linked','due_soon','overdue','time_logged','sprint_started','sprint_finished','article_published','article_updated','reaction')),
	CONSTRAINT "notification_preferences_email_check" CHECK ("notification_preferences"."email" in ('off','instant','daily_digest','weekly_digest'))
);
--> statement-breakpoint
CREATE TABLE "notification_digests" (
	"user_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"cadence" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notification_digests_user_id_org_id_cadence_pk" PRIMARY KEY("user_id","org_id","cadence"),
	CONSTRAINT "notification_digests_cadence_check" CHECK ("notification_digests"."cadence" in ('daily','weekly'))
);
--> statement-breakpoint
CREATE TABLE "org_storage_locations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "org_storage_locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"endpoint" text NOT NULL,
	"region" text NOT NULL,
	"bucket" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_storage_locations_identity_unique" UNIQUE("org_id","provider","endpoint","bucket"),
	CONSTRAINT "org_storage_locations_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "org_storage_locations_provider_check" CHECK ("org_storage_locations"."provider" in ('r2','s3'))
);
--> statement-breakpoint
CREATE TABLE "org_storage_configs" (
	"org_id" bigint PRIMARY KEY NOT NULL,
	"location_id" bigint NOT NULL,
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
	CONSTRAINT "org_storage_configs_status_check" CHECK ("org_storage_configs"."status" in ('pending','verified','failed')),
	CONSTRAINT "org_storage_configs_migration_state_check" CHECK ("org_storage_configs"."migration_state" in ('idle','running','done','failed'))
);
--> statement-breakpoint
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
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_activity" ADD CONSTRAINT "org_activity_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_activity" ADD CONSTRAINT "org_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_current_org_id_organizations_id_fk" FOREIGN KEY ("current_org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_access_token_projects" ADD CONSTRAINT "personal_access_token_projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_access_token_projects" ADD CONSTRAINT "personal_access_token_projects_token_fk" FOREIGN KEY ("token_id") REFERENCES "public"."personal_access_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_access_token_projects" ADD CONSTRAINT "personal_access_token_projects_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "totp_recovery_codes" ADD CONSTRAINT "totp_recovery_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_user_id_users_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_estimation_field_fk" FOREIGN KEY ("estimation_field_id","id") REFERENCES "public"."custom_fields"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_spent_time_field_fk" FOREIGN KEY ("spent_time_field_id","id") REFERENCES "public"."custom_fields"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_uses" ADD CONSTRAINT "invitation_uses_invitation_id_invitations_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation_uses" ADD CONSTRAINT "invitation_uses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_last_project_id_projects_id_fk" FOREIGN KEY ("last_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_statuses" ADD CONSTRAINT "workflow_statuses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_statuses" ADD CONSTRAINT "workflow_statuses_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priorities" ADD CONSTRAINT "priorities_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_types" ADD CONSTRAINT "issue_types_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_types" ADD CONSTRAINT "issue_types_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_types" ADD CONSTRAINT "work_types_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_types" ADD CONSTRAINT "work_types_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_status_project_fk" FOREIGN KEY ("status_id","project_id") REFERENCES "public"."workflow_statuses"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_priority_project_fk" FOREIGN KEY ("priority_id","project_id") REFERENCES "public"."priorities"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_type_project_fk" FOREIGN KEY ("type_id","project_id") REFERENCES "public"."issue_types"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_parent_project_fk" FOREIGN KEY ("parent_id","project_id") REFERENCES "public"."issues"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_sprint_project_fk" FOREIGN KEY ("sprint_id","project_id") REFERENCES "public"."sprints"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_from_issue_org_fk" FOREIGN KEY ("from_issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_to_issue_org_fk" FOREIGN KEY ("to_issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_tags" ADD CONSTRAINT "issue_tags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_tags" ADD CONSTRAINT "issue_tags_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_tags" ADD CONSTRAINT "issue_tags_tag_org_fk" FOREIGN KEY ("tag_id","org_id") REFERENCES "public"."tags"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_stars" ADD CONSTRAINT "issue_stars_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_stars" ADD CONSTRAINT "issue_stars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_stars" ADD CONSTRAINT "issue_stars_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_votes" ADD CONSTRAINT "issue_votes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_votes" ADD CONSTRAINT "issue_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_votes" ADD CONSTRAINT "issue_votes_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchers" ADD CONSTRAINT "issue_watchers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchers" ADD CONSTRAINT "issue_watchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_watchers" ADD CONSTRAINT "issue_watchers_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_org_fk" FOREIGN KEY ("comment_id","org_id") REFERENCES "public"."comments"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_article_org_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "public"."articles"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_article_org_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "public"."articles"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_issue_project_fk" FOREIGN KEY ("issue_id","project_id") REFERENCES "public"."issues"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_work_type_project_fk" FOREIGN KEY ("work_type_id","project_id") REFERENCES "public"."work_types"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_comment_org_fk" FOREIGN KEY ("comment_id","org_id") REFERENCES "public"."comments"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_work_item_org_fk" FOREIGN KEY ("work_item_id","org_id") REFERENCES "public"."work_items"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_article_org_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "public"."articles"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_storage_location_org_fk" FOREIGN KEY ("storage_location_id","org_id") REFERENCES "public"."org_storage_locations"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_searches" ADD CONSTRAINT "recent_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_searches" ADD CONSTRAINT "recent_searches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_snapshots" ADD CONSTRAINT "sprint_snapshots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_snapshots" ADD CONSTRAINT "sprint_snapshots_sprint_org_fk" FOREIGN KEY ("sprint_id","org_id") REFERENCES "public"."sprints"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_board_org_fk" FOREIGN KEY ("board_id","org_id") REFERENCES "public"."boards"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_swimlane_types" ADD CONSTRAINT "board_swimlane_types_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_swimlane_types" ADD CONSTRAINT "board_swimlane_types_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_swimlane_types" ADD CONSTRAINT "board_swimlane_types_board_project_fk" FOREIGN KEY ("board_id","project_id") REFERENCES "public"."boards"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_swimlane_types" ADD CONSTRAINT "board_swimlane_types_type_project_fk" FOREIGN KEY ("type_id","project_id") REFERENCES "public"."issue_types"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_column_board_fk" FOREIGN KEY ("column_id","board_id") REFERENCES "public"."board_columns"("id","board_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_board_project_fk" FOREIGN KEY ("board_id","project_id") REFERENCES "public"."boards"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_status_project_fk" FOREIGN KEY ("status_id","project_id") REFERENCES "public"."workflow_statuses"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_priority_project_fk" FOREIGN KEY ("priority_id","project_id") REFERENCES "public"."priorities"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_type_project_fk" FOREIGN KEY ("type_id","project_id") REFERENCES "public"."issue_types"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_applies_to" ADD CONSTRAINT "custom_field_applies_to_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_applies_to" ADD CONSTRAINT "custom_field_applies_to_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "work_item_values" ADD CONSTRAINT "work_item_values_work_item_project_fk" FOREIGN KEY ("work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_values" ADD CONSTRAINT "work_item_values_attribute_project_fk" FOREIGN KEY ("attribute_id","project_id") REFERENCES "public"."work_item_attributes"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_values" ADD CONSTRAINT "work_item_values_value_attribute_fk" FOREIGN KEY ("value_id","attribute_id") REFERENCES "public"."work_item_attribute_values"("id","attribute_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_parent_project_fk" FOREIGN KEY ("parent_id","project_id") REFERENCES "public"."articles"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_article_org_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "public"."articles"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_tags" ADD CONSTRAINT "article_tags_tag_org_fk" FOREIGN KEY ("tag_id","org_id") REFERENCES "public"."tags"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_stars" ADD CONSTRAINT "article_stars_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_stars" ADD CONSTRAINT "article_stars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_stars" ADD CONSTRAINT "article_stars_article_org_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "public"."articles"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_watchers" ADD CONSTRAINT "article_watchers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_watchers" ADD CONSTRAINT "article_watchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_watchers" ADD CONSTRAINT "article_watchers_article_org_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "public"."articles"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_issue_refs" ADD CONSTRAINT "article_issue_refs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_issue_refs" ADD CONSTRAINT "article_issue_refs_article_org_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "public"."articles"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_comment_org_fk" FOREIGN KEY ("comment_id","org_id") REFERENCES "public"."comments"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_article_org_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "public"."articles"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sprint_org_fk" FOREIGN KEY ("sprint_id","org_id") REFERENCES "public"."sprints"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digests" ADD CONSTRAINT "notification_digests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_digests" ADD CONSTRAINT "notification_digests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_storage_locations" ADD CONSTRAINT "org_storage_locations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_storage_configs" ADD CONSTRAINT "org_storage_configs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_storage_configs" ADD CONSTRAINT "org_storage_configs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_storage_configs" ADD CONSTRAINT "org_storage_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_storage_configs" ADD CONSTRAINT "org_storage_configs_location_org_fk" FOREIGN KEY ("location_id","org_id") REFERENCES "public"."org_storage_locations"("id","org_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "org_members_org_username_lower_unique" ON "org_members" USING btree ("org_id",lower("username"));--> statement-breakpoint
CREATE UNIQUE INDEX "one_time_tokens_one_open_transfer_per_org" ON "one_time_tokens" USING btree ("org_id") WHERE "one_time_tokens"."purpose" = 'ownership_transfer' and "one_time_tokens"."used_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "totp_recovery_codes_user_code_unique" ON "totp_recovery_codes" USING btree ("user_id","code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_statuses_project_lower_name_unique" ON "workflow_statuses" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_statuses_one_default_per_project" ON "workflow_statuses" USING btree ("project_id") WHERE "workflow_statuses"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "priorities_project_lower_name_unique" ON "priorities" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "priorities_one_default_per_project" ON "priorities" USING btree ("project_id") WHERE "priorities"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "issue_types_project_lower_name_unique" ON "issue_types" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "issue_types_one_default_per_project" ON "issue_types" USING btree ("project_id") WHERE "issue_types"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "work_types_project_lower_name_unique" ON "work_types" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "work_types_one_default_per_project" ON "work_types" USING btree ("project_id") WHERE "work_types"."is_default";--> statement-breakpoint
CREATE INDEX "issues_search_tsv_gin" ON "issues" USING gin ("search_tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_one_active_per_project" ON "sprints" USING btree ("project_id") WHERE "sprints"."state" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_project_lower_name_unique" ON "sprints" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "boards_project_lower_name_unique" ON "boards" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "custom_fields_project_lower_name_unique" ON "custom_fields" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_options_field_lower_name_unique" ON "custom_field_options" USING btree ("field_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_attributes_project_lower_name_unique" ON "work_item_attributes" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_attribute_values_attribute_lower_name_unique" ON "work_item_attribute_values" USING btree ("attribute_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "articles_project_slug_lower_unique" ON "articles" USING btree ("project_id",lower("slug")) WHERE "articles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "articles_search_tsv_gin" ON "articles" USING gin ("search_tsv");--> statement-breakpoint
CREATE UNIQUE INDEX "export_jobs_one_pending_per_org" ON "export_jobs" USING btree ("org_id") WHERE "export_jobs"."status" in ('queued', 'running');--> statement-breakpoint
-- Hand-edited from here: drizzle-kit does not generate extensions or grants.
-- log_min_duration_statement is a server setting: docker-compose.yml sets it; Neon does not expose it.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'nothingleft_app') THEN
    REVOKE UPDATE, DELETE ON org_activity FROM nothingleft_app;
  END IF;
END $$;

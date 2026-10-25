CREATE TABLE "automations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "automations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"name" text NOT NULL,
	"trigger" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action" text NOT NULL,
	"action_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automations_id_org_unique" UNIQUE("id","org_id")
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "automation_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"automation_id" bigint NOT NULL,
	"issue_id" bigint NOT NULL,
	"trigger_ref" jsonb NOT NULL,
	"caused_by" bigint,
	"result" text NOT NULL,
	"reason" text,
	"changes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_runs_result_check" CHECK ("automation_runs"."result" in ('applied','skipped','failed'))
);
--> statement-breakpoint
ALTER TABLE "org_activity" DROP CONSTRAINT "org_activity_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "notification_preferences" DROP CONSTRAINT "notification_preferences_kind_check";--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "last_automation_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD COLUMN "automation_run_id" bigint;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automations" ADD CONSTRAINT "automations_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_caused_by_users_id_fk" FOREIGN KEY ("caused_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_automation_org_fk" FOREIGN KEY ("automation_id","org_id") REFERENCES "public"."automations"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automations_project_lower_name_unique" ON "automations" USING btree ("project_id",lower("name"));--> statement-breakpoint
ALTER TABLE "org_activity" ADD CONSTRAINT "org_activity_kind_check" CHECK ("org_activity"."kind" in ('member_invited','member_joined','member_removed','role_changed','invite_created','invite_revoked','project_created','project_archived','project_deleted','schema_changed','custom_field_changed','storage_connected','storage_disconnected','ownership_transferred','org_settings_changed','export_requested','token_created','token_revoked','project_updated','project_unarchived','invite_rotated','username_changed','deletion_scheduled','deletion_cancelled','storage_updated','tag_renamed','tag_merged','tag_deleted','git_connection_created','git_connection_removed','git_connection_error','repository_linked','repository_unlinked','automation_changed'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('assigned','unassigned','mentioned','commented','status_changed','resolved','linked','due_soon','overdue','time_logged','sprint_started','sprint_finished','article_published','article_updated','reaction','pull_request_merged','ci_failed'));--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_kind_check" CHECK ("notification_preferences"."kind" in ('assigned','unassigned','mentioned','commented','status_changed','resolved','linked','due_soon','overdue','time_logged','sprint_started','sprint_finished','article_published','article_updated','reaction','pull_request_merged','ci_failed'));
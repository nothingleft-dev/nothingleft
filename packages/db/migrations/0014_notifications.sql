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
ALTER TABLE "notification_digests" ADD CONSTRAINT "notification_digests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
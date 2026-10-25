CREATE TABLE "git_branches" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "git_branches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"name" text NOT NULL,
	"head_sha" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "git_branches_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "git_branches_repository_name_unique" UNIQUE("repository_id","name")
);
--> statement-breakpoint
CREATE TABLE "git_commits" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "git_commits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"sha" text NOT NULL,
	"message_subject" text NOT NULL,
	"message_full" text,
	"author_name" text NOT NULL,
	"author_email" text NOT NULL,
	"author_login" text,
	"author_provider_id" text,
	"author_user_id" bigint,
	"committed_at" timestamp with time zone NOT NULL,
	"html_url" text NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "git_commits_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "git_commits_repository_sha_unique" UNIQUE("repository_id","sha")
);
--> statement-breakpoint
CREATE TABLE "git_pull_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "git_pull_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"state" text NOT NULL,
	"author_login" text,
	"author_provider_id" text,
	"author_avatar_url" text,
	"author_user_id" bigint,
	"head_repo_full_name" text,
	"head_ref" text NOT NULL,
	"head_sha" text NOT NULL,
	"base_ref" text NOT NULL,
	"merge_commit_sha" text,
	"merged_by_login" text,
	"merged_by_user_id" bigint,
	"is_revert" boolean DEFAULT false NOT NULL,
	"html_url" text NOT NULL,
	"review_state" text DEFAULT 'none' NOT NULL,
	"reviewers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ci_state" text DEFAULT 'none' NOT NULL,
	"ci_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"commits_fetched_for_sha" text,
	"commits_total" integer,
	"additions" integer,
	"deletions" integer,
	"changed_files" integer,
	"provider_updated_at" timestamp with time zone NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"merged_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "git_pull_requests_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "git_pull_requests_repository_number_unique" UNIQUE("repository_id","number"),
	CONSTRAINT "git_pull_requests_state_check" CHECK ("git_pull_requests"."state" in ('draft','open','merged','closed')),
	CONSTRAINT "git_pull_requests_review_state_check" CHECK ("git_pull_requests"."review_state" in ('none','review_requested','approved','changes_requested')),
	CONSTRAINT "git_pull_requests_ci_state_check" CHECK ("git_pull_requests"."ci_state" in ('none','running','passing','failing'))
);
--> statement-breakpoint
CREATE TABLE "git_pull_request_commits" (
	"pull_request_id" bigint NOT NULL,
	"commit_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	CONSTRAINT "git_pull_request_commits_pull_request_id_commit_id_pk" PRIMARY KEY("pull_request_id","commit_id")
);
--> statement-breakpoint
CREATE TABLE "git_checks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "git_checks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"sha" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"details_url" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "git_checks_repository_sha_external_unique" UNIQUE("repository_id","sha","external_id"),
	CONSTRAINT "git_checks_status_check" CHECK ("git_checks"."status" in ('queued','in_progress','completed')),
	CONSTRAINT "git_checks_conclusion_check" CHECK ("git_checks"."conclusion" in ('success','failure','neutral','cancelled','skipped','timed_out','action_required','stale'))
);
--> statement-breakpoint
CREATE TABLE "issue_git_links" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "issue_git_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"issue_id" bigint NOT NULL,
	"repository_id" bigint NOT NULL,
	"target_type" text NOT NULL,
	"target_id" bigint NOT NULL,
	"sources" text[] NOT NULL,
	"intent" text DEFAULT 'mention' NOT NULL,
	"removed_sources" text[] DEFAULT '{}' NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by" bigint,
	CONSTRAINT "issue_git_links_issue_target_unique" UNIQUE("issue_id","target_type","target_id"),
	CONSTRAINT "issue_git_links_target_type_check" CHECK ("issue_git_links"."target_type" in ('branch','commit','pull_request')),
	CONSTRAINT "issue_git_links_intent_check" CHECK ("issue_git_links"."intent" in ('mention','closes','revert'))
);
--> statement-breakpoint
CREATE TABLE "git_identities" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "git_identities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"base_url" text NOT NULL,
	"provider_user_id" text,
	"login" text,
	"email" text,
	"verified_by" text NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "git_identities_verified_by_check" CHECK ("git_identities"."verified_by" in ('provider','email','claim')),
	CONSTRAINT "git_identities_one_handle_check" CHECK (num_nonnulls("git_identities"."provider_user_id", "git_identities"."login", "git_identities"."email") >= 1)
);
--> statement-breakpoint
ALTER TABLE "issue_activity" DROP CONSTRAINT "issue_activity_kind_check";--> statement-breakpoint
ALTER TABLE "issue_activity" ALTER COLUMN "actor_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "git_branches" ADD CONSTRAINT "git_branches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_branches" ADD CONSTRAINT "git_branches_repository_org_fk" FOREIGN KEY ("repository_id","org_id") REFERENCES "public"."git_repositories"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_commits" ADD CONSTRAINT "git_commits_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_commits" ADD CONSTRAINT "git_commits_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_commits" ADD CONSTRAINT "git_commits_repository_org_fk" FOREIGN KEY ("repository_id","org_id") REFERENCES "public"."git_repositories"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_pull_requests" ADD CONSTRAINT "git_pull_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_pull_requests" ADD CONSTRAINT "git_pull_requests_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_pull_requests" ADD CONSTRAINT "git_pull_requests_merged_by_user_id_users_id_fk" FOREIGN KEY ("merged_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_pull_requests" ADD CONSTRAINT "git_pull_requests_repository_org_fk" FOREIGN KEY ("repository_id","org_id") REFERENCES "public"."git_repositories"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_pull_request_commits" ADD CONSTRAINT "git_pull_request_commits_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_pull_request_commits" ADD CONSTRAINT "git_pull_request_commits_pull_request_org_fk" FOREIGN KEY ("pull_request_id","org_id") REFERENCES "public"."git_pull_requests"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_pull_request_commits" ADD CONSTRAINT "git_pull_request_commits_commit_org_fk" FOREIGN KEY ("commit_id","org_id") REFERENCES "public"."git_commits"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_checks" ADD CONSTRAINT "git_checks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_checks" ADD CONSTRAINT "git_checks_repository_org_fk" FOREIGN KEY ("repository_id","org_id") REFERENCES "public"."git_repositories"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_git_links" ADD CONSTRAINT "issue_git_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_git_links" ADD CONSTRAINT "issue_git_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_git_links" ADD CONSTRAINT "issue_git_links_removed_by_users_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_git_links" ADD CONSTRAINT "issue_git_links_issue_org_fk" FOREIGN KEY ("issue_id","org_id") REFERENCES "public"."issues"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_git_links" ADD CONSTRAINT "issue_git_links_repository_org_fk" FOREIGN KEY ("repository_id","org_id") REFERENCES "public"."git_repositories"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_identities" ADD CONSTRAINT "git_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "git_identities_provider_user_unique" ON "git_identities" USING btree ("provider","base_url","provider_user_id") WHERE "git_identities"."provider_user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "git_identities_provider_login_unique" ON "git_identities" USING btree ("provider","base_url",lower("login")) WHERE "git_identities"."login" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "git_identities_email_unique" ON "git_identities" USING btree (lower("email")) WHERE "git_identities"."email" is not null and "git_identities"."verified_at" is not null;--> statement-breakpoint
ALTER TABLE "issue_activity" ADD CONSTRAINT "issue_activity_kind_check" CHECK ("issue_activity"."kind" in ('created','field_changed','commented','comment_edited','comment_deleted','linked','unlinked','attached','detached','time_logged','tagged','untagged','sprint_changed','parent_changed','deleted','restored','git_linked','git_unlinked','git_pr_changed'));
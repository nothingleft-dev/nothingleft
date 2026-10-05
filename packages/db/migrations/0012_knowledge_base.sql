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
	CONSTRAINT "articles_status_check" CHECK ("articles"."status" in ('draft','published'))
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
ALTER TABLE "comments" ADD COLUMN "article_id" bigint;--> statement-breakpoint
ALTER TABLE "mentions" ADD COLUMN "article_id" bigint;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "article_id" bigint;--> statement-breakpoint
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
CREATE UNIQUE INDEX "articles_project_slug_lower_unique" ON "articles" USING btree ("project_id",lower("slug")) WHERE "articles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "articles_search_tsv_gin" ON "articles" USING gin ("search_tsv");--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_article_org_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "public"."articles"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_article_org_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "public"."articles"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_article_org_fk" FOREIGN KEY ("article_id","org_id") REFERENCES "public"."articles"("id","org_id") ON DELETE cascade ON UPDATE no action;
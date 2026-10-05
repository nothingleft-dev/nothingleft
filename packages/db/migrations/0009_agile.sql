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
	CONSTRAINT "sprints_state_check" CHECK ("sprints"."state" in ('planned','active','completed'))
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
	CONSTRAINT "sprint_snapshots_sprint_id_snapshot_date_pk" PRIMARY KEY("sprint_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "boards" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "boards_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"swimlane_by" text DEFAULT 'none' NOT NULL,
	"swimlane_field" text,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boards_org_slug_unique" UNIQUE("org_id","slug"),
	CONSTRAINT "boards_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "boards_id_project_unique" UNIQUE("id","project_id"),
	CONSTRAINT "boards_swimlane_by_check" CHECK ("boards"."swimlane_by" in ('none','values','issues')),
	CONSTRAINT "boards_swimlane_field_check" CHECK ("boards"."swimlane_field" in ('assignee','priority','type'))
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
	CONSTRAINT "board_columns_id_board_unique" UNIQUE("id","board_id")
);
--> statement-breakpoint
CREATE TABLE "board_column_statuses" (
	"column_id" bigint NOT NULL,
	"status_id" bigint NOT NULL,
	"board_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	CONSTRAINT "board_column_statuses_column_id_status_id_pk" PRIMARY KEY("column_id","status_id"),
	CONSTRAINT "board_column_statuses_board_status_unique" UNIQUE("board_id","status_id")
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
ALTER TABLE "issues" ADD COLUMN "sprint_id" bigint;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "rank" double precision;--> statement-breakpoint
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
ALTER TABLE "board_column_statuses" ADD CONSTRAINT "board_column_statuses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_statuses" ADD CONSTRAINT "board_column_statuses_column_board_fk" FOREIGN KEY ("column_id","board_id") REFERENCES "public"."board_columns"("id","board_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_statuses" ADD CONSTRAINT "board_column_statuses_board_project_fk" FOREIGN KEY ("board_id","project_id") REFERENCES "public"."boards"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_statuses" ADD CONSTRAINT "board_column_statuses_status_project_fk" FOREIGN KEY ("status_id","project_id") REFERENCES "public"."workflow_statuses"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_swimlane_types" ADD CONSTRAINT "board_swimlane_types_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_swimlane_types" ADD CONSTRAINT "board_swimlane_types_board_project_fk" FOREIGN KEY ("board_id","project_id") REFERENCES "public"."boards"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_swimlane_types" ADD CONSTRAINT "board_swimlane_types_type_project_fk" FOREIGN KEY ("type_id","project_id") REFERENCES "public"."issue_types"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_one_active_per_project" ON "sprints" USING btree ("project_id") WHERE "sprints"."state" = 'active';--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_sprint_project_fk" FOREIGN KEY ("sprint_id","project_id") REFERENCES "public"."sprints"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Data: every existing project gets the default board that new projects are seeded with — a
-- frozen copy of SEED_BOARD_COLUMNS in packages/types as of 26 Sep 2026. Named after the
-- project, slugged by its key, which is unique in the organisation.
INSERT INTO "boards" ("org_id", "project_id", "name", "slug", "swimlane_by", "created_by")
SELECT p."org_id", p."id", p."name", lower(p."key"),
       CASE WHEN EXISTS (SELECT 1 FROM "issue_types" t WHERE t."project_id" = p."id" AND lower(t."name") = 'epic') THEN 'issues' ELSE 'none' END,
       p."created_by"
FROM "projects" p;
--> statement-breakpoint
INSERT INTO "board_columns" ("org_id", "board_id", "name", "position")
SELECT b."org_id", b."id", c."name", c."position"
FROM "boards" b
CROSS JOIN (VALUES ('To do', 0), ('In progress', 1), ('Done', 2)) AS c("name", "position");
--> statement-breakpoint
INSERT INTO "board_column_statuses" ("column_id", "status_id", "board_id", "project_id", "org_id")
SELECT c."id", s."id", b."id", b."project_id", b."org_id"
FROM "boards" b
JOIN "board_columns" c ON c."board_id" = b."id"
JOIN "workflow_statuses" s ON s."project_id" = b."project_id"
WHERE (c."position" = 0 AND s."category" IN ('backlog', 'unstarted'))
   OR (c."position" = 1 AND s."category" = 'started')
   OR (c."position" = 2 AND s."category" IN ('done', 'cancelled'));
--> statement-breakpoint
INSERT INTO "board_swimlane_types" ("board_id", "type_id", "project_id", "org_id")
SELECT b."id", t."id", b."project_id", b."org_id"
FROM "boards" b
JOIN "issue_types" t ON t."project_id" = b."project_id" AND lower(t."name") = 'epic'
WHERE b."swimlane_by" = 'issues';

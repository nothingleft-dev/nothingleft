CREATE TABLE "personal_access_token_projects" (
	"token_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	CONSTRAINT "personal_access_token_projects_token_id_project_id_pk" PRIMARY KEY("token_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "personal_access_tokens" ADD COLUMN "restricted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_access_token_projects" ADD CONSTRAINT "personal_access_token_projects_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_access_token_projects" ADD CONSTRAINT "personal_access_token_projects_token_fk" FOREIGN KEY ("token_id") REFERENCES "public"."personal_access_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_access_token_projects" ADD CONSTRAINT "personal_access_token_projects_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-edited: a token carrying any list, even an empty one, was restricted and stays so; ids
-- that name no project, duplicates and NULLs are dropped. The column goes only after the copy.
UPDATE "personal_access_tokens" SET "restricted" = ("project_ids" IS NOT NULL);--> statement-breakpoint
INSERT INTO "personal_access_token_projects" ("token_id", "project_id", "org_id")
SELECT DISTINCT t."id", p."id", p."org_id"
FROM "personal_access_tokens" t
CROSS JOIN LATERAL unnest(t."project_ids") AS u("project_id")
JOIN "projects" p ON p."id" = u."project_id";--> statement-breakpoint
ALTER TABLE "personal_access_tokens" DROP COLUMN "project_ids";

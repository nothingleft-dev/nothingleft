ALTER TABLE "projects" ADD COLUMN "time_tracking_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Hand-edited: existing rows need a label before the column can be NOT NULL.
ALTER TABLE "work_types" ADD COLUMN "short_label" char(1);--> statement-breakpoint
UPDATE "work_types" SET "short_label" = upper(left("name", 1));--> statement-breakpoint
ALTER TABLE "work_types" ALTER COLUMN "short_label" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "work_types" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- A work-type list still exactly as seeded gains Maintenance and Observation, alphabetically.
WITH "untouched" AS (
  SELECT "project_id", min("org_id") AS "org_id"
  FROM "work_types"
  GROUP BY "project_id"
  HAVING string_agg(concat_ws('|', "name", "position", "is_archived"::text), ';' ORDER BY "position") =
    'Development|0|false;Documentation|1|false;Implementation|2|false;Investigation|3|false;Testing|4|false'
), "moved" AS (
  UPDATE "work_types" w SET "position" = 6
  FROM "untouched" u
  WHERE w."project_id" = u."project_id" AND w."name" = 'Testing'
  RETURNING w."project_id"
)
INSERT INTO "work_types" ("project_id", "org_id", "name", "short_label", "position")
SELECT u."project_id", u."org_id", v."name", v."short_label", v."position"
FROM "untouched" u
CROSS JOIN (VALUES ('Maintenance', 'M', 4), ('Observation', 'O', 5)) AS v("name", "short_label", "position");
--> statement-breakpoint
-- Exactly one default per project: Development where it is still offered, else the first live value.
UPDATE "work_types" w
SET "is_default" = true
FROM (
  SELECT DISTINCT ON ("project_id") "id"
  FROM "work_types"
  ORDER BY "project_id", "is_archived", ("name" = 'Development') DESC, "position", "id"
) AS pick
WHERE w."id" = pick."id";

-- Data only. A frozen copy of SEED_* in packages/types as of 24 Sep 2026: projects created
-- before 0003 had nowhere to put their values, so each table is filled only where it is empty.
INSERT INTO "workflow_statuses" ("project_id", "org_id", "name", "category", "color", "short_label", "position", "is_default")
SELECT p."id", p."org_id", s."name", s."category", s."color", s."short_label", s."position", s."is_default"
FROM "projects" p
CROSS JOIN (VALUES
  ('Submitted', 'backlog', 'gray', 'S', 0, false),
  ('Open', 'unstarted', 'blue', 'O', 1, true),
  ('In Progress', 'started', 'amber', 'I', 2, false),
  ('Reopened', 'unstarted', 'orange', 'R', 3, false),
  ('Can''t Reproduce', 'cancelled', 'gray', 'C', 4, false),
  ('Duplicate', 'cancelled', 'gray', 'D', 5, false),
  ('Fixed', 'done', 'green', 'F', 6, false),
  ('Won''t fix', 'cancelled', 'gray', 'W', 7, false),
  ('Obsolete', 'cancelled', 'gray', 'O', 8, false),
  ('Closed', 'done', 'green', 'C', 9, false)
) AS s("name", "category", "color", "short_label", "position", "is_default")
WHERE NOT EXISTS (SELECT 1 FROM "workflow_statuses" w WHERE w."project_id" = p."id");
--> statement-breakpoint
INSERT INTO "priorities" ("project_id", "org_id", "name", "color", "short_label", "position", "is_default")
SELECT p."id", p."org_id", s."name", s."color", s."short_label", s."position", s."is_default"
FROM "projects" p
CROSS JOIN (VALUES
  ('Show-stopper', 'red', 'S', 0, false),
  ('Critical', 'orange', 'C', 1, false),
  ('Major', 'amber', 'M', 2, false),
  ('Normal', 'gray', 'N', 3, true),
  ('Minor', 'gray', 'M', 4, false)
) AS s("name", "color", "short_label", "position", "is_default")
WHERE NOT EXISTS (SELECT 1 FROM "priorities" x WHERE x."project_id" = p."id");
--> statement-breakpoint
INSERT INTO "issue_types" ("project_id", "org_id", "name", "color", "short_label", "position", "is_default")
SELECT p."id", p."org_id", s."name", s."color", s."short_label", s."position", s."is_default"
FROM "projects" p
CROSS JOIN (VALUES
  ('Bug', 'red', 'B', 0, true),
  ('Feature', 'blue', 'F', 1, false),
  ('Task', 'gray', 'T', 2, false),
  ('Epic', 'violet', 'E', 3, false)
) AS s("name", "color", "short_label", "position", "is_default")
WHERE NOT EXISTS (SELECT 1 FROM "issue_types" x WHERE x."project_id" = p."id");
--> statement-breakpoint
INSERT INTO "work_types" ("project_id", "org_id", "name", "position")
SELECT p."id", p."org_id", s."name", s."position"
FROM "projects" p
CROSS JOIN (VALUES
  ('Development', 0),
  ('Documentation', 1),
  ('Implementation', 2),
  ('Investigation', 3),
  ('Testing', 4)
) AS s("name", "position")
WHERE NOT EXISTS (SELECT 1 FROM "work_types" x WHERE x."project_id" = p."id");
--> statement-breakpoint
-- The default moved from Submitted to Open. Only a status list still exactly as seeded moves
-- with it; a project whose admin has touched its statuses keeps what they chose.
UPDATE "workflow_statuses" w
SET "is_default" = (w."name" = 'Open')
WHERE w."project_id" IN (
  SELECT "project_id"
  FROM "workflow_statuses"
  GROUP BY "project_id"
  HAVING string_agg(
      concat_ws('|', "name", "category", "color", "short_label", "position", "is_default"::text, "is_archived"::text),
      ';' ORDER BY "position"
    ) = 'Submitted|backlog|gray|S|0|true|false;Open|unstarted|blue|O|1|false|false;In Progress|started|amber|I|2|false|false;Reopened|unstarted|orange|R|3|false|false;Can''t Reproduce|cancelled|gray|C|4|false|false;Duplicate|cancelled|gray|D|5|false|false;Fixed|done|green|F|6|false|false;Won''t fix|cancelled|gray|W|7|false|false;Obsolete|cancelled|gray|O|8|false|false;Closed|done|green|C|9|false|false'
);

-- Data only: statuses, priorities and types move from the 14 palette hues to the label grid
-- (family-step names; values in design/tokens.css). A value still carrying its old seed colour
-- takes the new seed colour; anything else maps hue by hue.
UPDATE "workflow_statuses" x SET "color" = s."new"
FROM (VALUES
  ('Submitted', 'gray', 'gray-1'),
  ('Open', 'blue', 'blue-2'),
  ('In Progress', 'amber', 'yellow-2'),
  ('Reopened', 'orange', 'orange-2'),
  ('Can''t Reproduce', 'gray', 'gray-2'),
  ('Duplicate', 'gray', 'gray-2'),
  ('Fixed', 'green', 'green-2'),
  ('Won''t fix', 'gray', 'gray-2'),
  ('Obsolete', 'gray', 'gray-2'),
  ('Closed', 'green', 'green-3')
) AS s("name", "old", "new")
WHERE x."name" = s."name" AND x."color" = s."old";
--> statement-breakpoint
UPDATE "priorities" x SET "color" = s."new"
FROM (VALUES
  ('Show-stopper', 'red', 'red-3'),
  ('Critical', 'orange', 'pink-3'),
  ('Major', 'amber', 'yellow-2'),
  ('Normal', 'gray', 'green-1'),
  ('Minor', 'gray', 'gray-4')
) AS s("name", "old", "new")
WHERE x."name" = s."name" AND x."color" = s."old";
--> statement-breakpoint
UPDATE "issue_types" x SET "color" = s."new"
FROM (VALUES
  ('Bug', 'red', 'red-2'),
  ('Feature', 'blue', 'blue-2'),
  ('Task', 'gray', 'gray-2'),
  ('Epic', 'violet', 'pink-2')
) AS s("name", "old", "new")
WHERE x."name" = s."name" AND x."color" = s."old";
--> statement-breakpoint
UPDATE "workflow_statuses" x SET "color" = m."new"
FROM (VALUES
  ('red', 'red-3'),
  ('orange', 'orange-3'),
  ('amber', 'yellow-3'),
  ('yellow', 'yellow-2'),
  ('lime', 'green-2'),
  ('green', 'green-3'),
  ('teal', 'teal-3'),
  ('cyan', 'teal-2'),
  ('blue', 'blue-3'),
  ('indigo', 'blue-4'),
  ('violet', 'pink-4'),
  ('pink', 'pink-3'),
  ('brown', 'orange-5'),
  ('gray', 'gray-2')
) AS m("old", "new")
WHERE x."color" = m."old";
--> statement-breakpoint
UPDATE "priorities" x SET "color" = m."new"
FROM (VALUES
  ('red', 'red-3'),
  ('orange', 'orange-3'),
  ('amber', 'yellow-3'),
  ('yellow', 'yellow-2'),
  ('lime', 'green-2'),
  ('green', 'green-3'),
  ('teal', 'teal-3'),
  ('cyan', 'teal-2'),
  ('blue', 'blue-3'),
  ('indigo', 'blue-4'),
  ('violet', 'pink-4'),
  ('pink', 'pink-3'),
  ('brown', 'orange-5'),
  ('gray', 'gray-2')
) AS m("old", "new")
WHERE x."color" = m."old";
--> statement-breakpoint
UPDATE "issue_types" x SET "color" = m."new"
FROM (VALUES
  ('red', 'red-3'),
  ('orange', 'orange-3'),
  ('amber', 'yellow-3'),
  ('yellow', 'yellow-2'),
  ('lime', 'green-2'),
  ('green', 'green-3'),
  ('teal', 'teal-3'),
  ('cyan', 'teal-2'),
  ('blue', 'blue-3'),
  ('indigo', 'blue-4'),
  ('violet', 'pink-4'),
  ('pink', 'pink-3'),
  ('brown', 'orange-5'),
  ('gray', 'gray-2')
) AS m("old", "new")
WHERE x."color" = m."old";

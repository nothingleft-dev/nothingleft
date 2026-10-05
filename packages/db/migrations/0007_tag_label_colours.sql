-- Data only: tags move from the 14 palette hues to the label grid, hue by hue as 0006 did.
-- A colour that is neither a hue below nor already a label name falls back to gray-2.
UPDATE "tags" x SET "color" = m."new"
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
UPDATE "tags" SET "color" = 'gray-2'
WHERE "color" !~ '^(gray|red|orange|yellow|green|teal|blue|pink)-[1-5]$';

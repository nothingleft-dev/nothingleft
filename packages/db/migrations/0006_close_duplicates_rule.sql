-- Data only: every project gets the Close duplicates rule that new projects start with,
-- pointing at its Duplicate status, else its first cancelled one, else its first done one.
INSERT INTO "automations" ("org_id", "project_id", "name", "trigger", "conditions", "action", "action_params", "is_enabled", "position", "created_by", "updated_by")
SELECT p."org_id", p."id", 'Close duplicates', 'issue.marked_duplicate',
       '{"issue_status_category":["backlog","unstarted","started"]}'::jsonb,
       'issue.set_status', jsonb_build_object('status', s."name"), true,
       (SELECT count(*) FROM "automations" a WHERE a."project_id" = p."id"),
       p."created_by", p."created_by"
FROM "projects" p
CROSS JOIN LATERAL (
  SELECT ws."name"
  FROM "workflow_statuses" ws
  WHERE ws."project_id" = p."id" AND NOT ws."is_archived"
    AND (lower(ws."name") = 'duplicate' OR ws."category" IN ('cancelled', 'done'))
  ORDER BY (lower(ws."name") = 'duplicate') DESC, (ws."category" = 'cancelled') DESC, ws."position"
  LIMIT 1
) s
WHERE NOT EXISTS (
  SELECT 1 FROM "automations" a WHERE a."project_id" = p."id" AND a."trigger" = 'issue.marked_duplicate'
)
ON CONFLICT DO NOTHING;

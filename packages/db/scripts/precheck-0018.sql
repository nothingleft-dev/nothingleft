-- Read-only: what migration 0018 keeps and drops for every token that carries a project list.
SELECT t.id,
       t.user_id,
       t.revoked_at IS NOT NULL AS revoked,
       t.project_ids,
       array(SELECT DISTINCT u FROM unnest(t.project_ids) AS u JOIN projects p ON p.id = u ORDER BY u) AS kept,
       array(SELECT u FROM unnest(t.project_ids) AS u
             WHERE u IS NULL OR NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = u)) AS dropped
FROM personal_access_tokens t
WHERE t.project_ids IS NOT NULL
ORDER BY t.id;

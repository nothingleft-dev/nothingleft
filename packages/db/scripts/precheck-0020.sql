-- Must return no rows before 0020 is applied: a customer-bucket file that no connection in its
-- organisation names has no recorded endpoint, and 0020's CHECK refuses it.
SELECT a.id, a.org_id, a.public_id, a.bucket, a.completed_at, a.deleted_at
FROM attachments a
LEFT JOIN org_storage_configs c ON c.org_id = a.org_id AND c.bucket = a.bucket
WHERE a.storage_target = 'byo' AND c.org_id IS NULL;

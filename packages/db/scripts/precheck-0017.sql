-- Each row is one the named 0017 constraint would refuse. No rows: the migration applies cleanly.

-- Tenant binding
SELECT 'custom_field_applies_to_project_org_fk' AS violates,
       jsonb_build_object('field_id', a.field_id, 'type_id', a.type_id, 'project_id', a.project_id, 'org_id', a.org_id) AS detail
FROM custom_field_applies_to a
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = a.project_id AND p.org_id = a.org_id);

SELECT 'board_swimlane_types_project_org_fk' AS violates,
       jsonb_build_object('board_id', s.board_id, 'type_id', s.type_id, 'project_id', s.project_id, 'org_id', s.org_id) AS detail
FROM board_swimlane_types s
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = s.project_id AND p.org_id = s.org_id);

SELECT 'board_column_values_project_org_fk' AS violates,
       jsonb_build_object('id', v.id, 'board_id', v.board_id, 'project_id', v.project_id, 'org_id', v.org_id) AS detail
FROM board_column_values v
WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = v.project_id AND p.org_id = v.org_id);

-- Case-insensitive names
SELECT 'workflow_statuses_project_lower_name_unique' AS violates,
       jsonb_build_object('project_id', project_id, 'name', lower(name), 'ids', array_agg(id ORDER BY id)) AS detail
FROM workflow_statuses GROUP BY project_id, lower(name) HAVING count(*) > 1;

SELECT 'priorities_project_lower_name_unique' AS violates,
       jsonb_build_object('project_id', project_id, 'name', lower(name), 'ids', array_agg(id ORDER BY id)) AS detail
FROM priorities GROUP BY project_id, lower(name) HAVING count(*) > 1;

SELECT 'issue_types_project_lower_name_unique' AS violates,
       jsonb_build_object('project_id', project_id, 'name', lower(name), 'ids', array_agg(id ORDER BY id)) AS detail
FROM issue_types GROUP BY project_id, lower(name) HAVING count(*) > 1;

SELECT 'work_types_project_lower_name_unique' AS violates,
       jsonb_build_object('project_id', project_id, 'name', lower(name), 'ids', array_agg(id ORDER BY id)) AS detail
FROM work_types GROUP BY project_id, lower(name) HAVING count(*) > 1;

SELECT 'custom_fields_project_lower_name_unique' AS violates,
       jsonb_build_object('project_id', project_id, 'name', lower(name), 'ids', array_agg(id ORDER BY id)) AS detail
FROM custom_fields GROUP BY project_id, lower(name) HAVING count(*) > 1;

SELECT 'work_item_attributes_project_lower_name_unique' AS violates,
       jsonb_build_object('project_id', project_id, 'name', lower(name), 'ids', array_agg(id ORDER BY id)) AS detail
FROM work_item_attributes GROUP BY project_id, lower(name) HAVING count(*) > 1;

SELECT 'custom_field_options_field_lower_name_unique' AS violates,
       jsonb_build_object('field_id', field_id, 'name', lower(name), 'ids', array_agg(id ORDER BY id)) AS detail
FROM custom_field_options GROUP BY field_id, lower(name) HAVING count(*) > 1;

SELECT 'work_item_attribute_values_attribute_lower_name_unique' AS violates,
       jsonb_build_object('attribute_id', attribute_id, 'name', lower(name), 'ids', array_agg(id ORDER BY id)) AS detail
FROM work_item_attribute_values GROUP BY attribute_id, lower(name) HAVING count(*) > 1;

SELECT 'sprints_project_lower_name_unique' AS violates,
       jsonb_build_object('project_id', project_id, 'name', lower(name), 'ids', array_agg(id ORDER BY id)) AS detail
FROM sprints GROUP BY project_id, lower(name) HAVING count(*) > 1;

SELECT 'boards_project_lower_name_unique' AS violates,
       jsonb_build_object('project_id', project_id, 'name', lower(name), 'ids', array_agg(id ORDER BY id)) AS detail
FROM boards GROUP BY project_id, lower(name) HAVING count(*) > 1;

-- One default per project, never archived
SELECT 'workflow_statuses_one_default_per_project' AS violates,
       jsonb_build_object('project_id', project_id, 'ids', array_agg(id ORDER BY position, id)) AS detail
FROM workflow_statuses WHERE is_default GROUP BY project_id HAVING count(*) > 1;

SELECT 'priorities_one_default_per_project' AS violates,
       jsonb_build_object('project_id', project_id, 'ids', array_agg(id ORDER BY position, id)) AS detail
FROM priorities WHERE is_default GROUP BY project_id HAVING count(*) > 1;

SELECT 'issue_types_one_default_per_project' AS violates,
       jsonb_build_object('project_id', project_id, 'ids', array_agg(id ORDER BY position, id)) AS detail
FROM issue_types WHERE is_default GROUP BY project_id HAVING count(*) > 1;

SELECT 'work_types_one_default_per_project' AS violates,
       jsonb_build_object('project_id', project_id, 'ids', array_agg(id ORDER BY position, id)) AS detail
FROM work_types WHERE is_default GROUP BY project_id HAVING count(*) > 1;

SELECT 'workflow_statuses_default_not_archived' AS violates,
       jsonb_build_object('id', id, 'project_id', project_id, 'name', name) AS detail
FROM workflow_statuses WHERE NOT (NOT (is_default AND is_archived));

SELECT 'work_types_default_not_archived' AS violates,
       jsonb_build_object('id', id, 'project_id', project_id, 'name', name) AS detail
FROM work_types WHERE NOT (NOT (is_default AND is_archived));

-- One open ownership transfer per organisation
SELECT 'one_time_tokens_one_open_transfer_per_org' AS violates,
       jsonb_build_object('org_id', org_id, 'ids', array_agg(id ORDER BY id),
                          'expired', count(*) FILTER (WHERE expires_at <= now())) AS detail
FROM one_time_tokens
WHERE purpose = 'ownership_transfer' AND used_at IS NULL AND org_id IS NOT NULL
GROUP BY org_id HAVING count(*) > 1;

-- One mention per source and user
SELECT 'mentions_source_user_unique' AS violates,
       jsonb_build_object('org_id', org_id, 'source_type', source_type, 'source_id', source_id,
                          'mentioned_user_id', mentioned_user_id, 'ids', array_agg(id ORDER BY id)) AS detail
FROM mentions GROUP BY org_id, source_type, source_id, mentioned_user_id HAVING count(*) > 1;

-- Row shapes
SELECT 'saved_views_project_visibility_check' AS violates, jsonb_build_object('id', id) AS detail
FROM saved_views WHERE NOT (visibility <> 'project' OR project_id IS NOT NULL);

SELECT 'one_time_tokens_transfer_fields_check' AS violates, jsonb_build_object('id', id) AS detail
FROM one_time_tokens WHERE NOT (purpose <> 'ownership_transfer' OR (org_id IS NOT NULL AND created_by IS NOT NULL));

SELECT 'one_time_tokens_email_change_check' AS violates, jsonb_build_object('id', id) AS detail
FROM one_time_tokens WHERE NOT (purpose <> 'email_change' OR new_email IS NOT NULL);

SELECT 'boards_swimlane_field_mode_check' AS violates,
       jsonb_build_object('id', id, 'swimlane_by', swimlane_by, 'swimlane_field', swimlane_field) AS detail
FROM boards WHERE NOT ((swimlane_by = 'values') = (swimlane_field IS NOT NULL));

SELECT 'projects_time_fields_distinct_check' AS violates, jsonb_build_object('id', id, 'field_id', estimation_field_id) AS detail
FROM projects
WHERE NOT (estimation_field_id IS NULL OR spent_time_field_id IS NULL OR estimation_field_id <> spent_time_field_id);

SELECT 'attachments_parent_shape_check' AS violates,
       jsonb_build_object('id', id, 'issue_id', issue_id, 'article_id', article_id,
                          'comment_id', comment_id, 'work_item_id', work_item_id) AS detail
FROM attachments
WHERE NOT (NOT (issue_id IS NOT NULL AND article_id IS NOT NULL)
           AND (work_item_id IS NULL OR issue_id IS NOT NULL)
           AND (comment_id IS NULL OR issue_id IS NOT NULL OR article_id IS NOT NULL));

-- Numbers and dates
SELECT 'issues_estimate_minutes_check' AS violates, jsonb_build_object('id', id, 'value', estimate_minutes) AS detail
FROM issues WHERE NOT (estimate_minutes IS NULL OR estimate_minutes >= 0);

SELECT 'issues_spent_minutes_check' AS violates, jsonb_build_object('id', id, 'value', spent_minutes) AS detail
FROM issues WHERE NOT (spent_minutes >= 0);

SELECT 'issues_story_points_check' AS violates, jsonb_build_object('id', id, 'value', story_points) AS detail
FROM issues WHERE NOT (story_points IS NULL OR story_points BETWEEN 0 AND 999);

SELECT 'issues_vote_count_check' AS violates, jsonb_build_object('id', id, 'value', vote_count) AS detail
FROM issues WHERE NOT (vote_count >= 0);

SELECT 'issues_comment_count_check' AS violates, jsonb_build_object('id', id, 'value', comment_count) AS detail
FROM issues WHERE NOT (comment_count >= 0);

SELECT 'issues_parent_id_check' AS violates, jsonb_build_object('id', id) AS detail
FROM issues WHERE NOT (parent_id IS NULL OR parent_id <> id);

SELECT 'issues_start_date_check' AS violates, jsonb_build_object('id', id, 'start_date', start_date, 'due_date', due_date) AS detail
FROM issues WHERE NOT (start_date IS NULL OR due_date IS NULL OR start_date <= due_date);

SELECT 'work_items_duration_minutes_check' AS violates, jsonb_build_object('id', id, 'value', duration_minutes) AS detail
FROM work_items WHERE NOT (duration_minutes > 0);

SELECT 'organizations_workday_minutes_check' AS violates, jsonb_build_object('id', id, 'value', workday_minutes) AS detail
FROM organizations WHERE NOT (workday_minutes BETWEEN 1 AND 1440);

SELECT 'organizations_workweek_days_check' AS violates, jsonb_build_object('id', id, 'value', workweek_days) AS detail
FROM organizations WHERE NOT (workweek_days BETWEEN 1 AND 7);

SELECT 'organizations_storage_used_bytes_check' AS violates, jsonb_build_object('id', id, 'value', storage_used_bytes) AS detail
FROM organizations WHERE NOT (storage_used_bytes >= 0);

SELECT 'projects_issue_counter_check' AS violates, jsonb_build_object('id', id, 'value', issue_counter) AS detail
FROM projects WHERE NOT (issue_counter >= 0);

SELECT 'board_columns_wip_min_check' AS violates, jsonb_build_object('id', id, 'value', wip_min) AS detail
FROM board_columns WHERE NOT (wip_min IS NULL OR wip_min BETWEEN 1 AND 999);

SELECT 'board_columns_wip_max_check' AS violates, jsonb_build_object('id', id, 'value', wip_max) AS detail
FROM board_columns WHERE NOT (wip_max IS NULL OR wip_max BETWEEN 1 AND 999);

SELECT 'board_columns_wip_order_check' AS violates, jsonb_build_object('id', id, 'wip_min', wip_min, 'wip_max', wip_max) AS detail
FROM board_columns WHERE NOT (wip_min IS NULL OR wip_max IS NULL OR wip_min <= wip_max);

SELECT 'sprints_start_date_check' AS violates, jsonb_build_object('id', id, 'start_date', start_date, 'end_date', end_date) AS detail
FROM sprints WHERE NOT (start_date IS NULL OR end_date IS NULL OR start_date <= end_date);

SELECT 'sprint_snapshots_total_points_check' AS violates, jsonb_build_object('sprint_id', sprint_id, 'day', snapshot_date) AS detail
FROM sprint_snapshots WHERE NOT (total_points >= 0);

SELECT 'sprint_snapshots_completed_points_check' AS violates, jsonb_build_object('sprint_id', sprint_id, 'day', snapshot_date) AS detail
FROM sprint_snapshots WHERE NOT (completed_points >= 0 AND completed_points <= total_points);

SELECT 'sprint_snapshots_total_issues_check' AS violates, jsonb_build_object('sprint_id', sprint_id, 'day', snapshot_date) AS detail
FROM sprint_snapshots WHERE NOT (total_issues >= 0);

SELECT 'sprint_snapshots_completed_issues_check' AS violates, jsonb_build_object('sprint_id', sprint_id, 'day', snapshot_date) AS detail
FROM sprint_snapshots WHERE NOT (completed_issues >= 0 AND completed_issues <= total_issues);

SELECT 'sprint_snapshots_remaining_estimate_minutes_check' AS violates, jsonb_build_object('sprint_id', sprint_id, 'day', snapshot_date) AS detail
FROM sprint_snapshots WHERE NOT (remaining_estimate_minutes >= 0);

SELECT 'sprint_snapshots_total_estimate_minutes_check' AS violates, jsonb_build_object('sprint_id', sprint_id, 'day', snapshot_date) AS detail
FROM sprint_snapshots WHERE NOT (total_estimate_minutes IS NULL OR total_estimate_minutes >= 0);

SELECT 'issue_links_from_issue_id_check' AS violates, jsonb_build_object('id', id) AS detail
FROM issue_links WHERE NOT (from_issue_id <> to_issue_id);

SELECT 'attachments_size_bytes_check' AS violates, jsonb_build_object('id', id, 'value', size_bytes) AS detail
FROM attachments WHERE NOT (size_bytes >= 0);

SELECT 'attachments_width_check' AS violates, jsonb_build_object('id', id, 'value', width) AS detail
FROM attachments WHERE NOT (width IS NULL OR width > 0);

SELECT 'attachments_height_check' AS violates, jsonb_build_object('id', id, 'value', height) AS detail
FROM attachments WHERE NOT (height IS NULL OR height > 0);

SELECT 'articles_parent_id_check' AS violates, jsonb_build_object('id', id) AS detail
FROM articles WHERE NOT (parent_id IS NULL OR parent_id <> id);

-- work_items_work_type_project_fk: a work type from another project than the issue
SELECT w.id AS work_item_id, w.issue_id, i.project_id AS issue_project_id, t.project_id AS work_type_project_id
FROM work_items w
JOIN issues i ON i.id = w.issue_id AND i.org_id = w.org_id
JOIN work_types t ON t.id = w.work_type_id
WHERE t.project_id <> i.project_id;

-- work_item_values_attribute_project_fk: an attribute from another project than the work item's issue
SELECT v.work_item_id, v.attribute_id, i.project_id AS issue_project_id, a.project_id AS attribute_project_id
FROM work_item_values v
JOIN work_items w ON w.id = v.work_item_id AND w.org_id = v.org_id
JOIN issues i ON i.id = w.issue_id AND i.org_id = w.org_id
JOIN work_item_attributes a ON a.id = v.attribute_id
WHERE a.project_id <> i.project_id;

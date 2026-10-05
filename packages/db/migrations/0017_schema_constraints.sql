-- Hand-edited: data fixes run before the constraints below are added.
DELETE FROM "one_time_tokens" t
WHERE t."purpose" = 'ownership_transfer' AND t."used_at" IS NULL
  AND EXISTS (SELECT 1 FROM "one_time_tokens" n
              WHERE n."purpose" = 'ownership_transfer' AND n."used_at" IS NULL
                AND n."org_id" = t."org_id" AND n."id" > t."id");--> statement-breakpoint
UPDATE "work_types" d SET "name" = d."name" || ' (' || d."id" || ')' WHERE EXISTS (SELECT 1 FROM "work_types" k WHERE k."project_id" = d."project_id" AND lower(k."name") = lower(d."name") AND k."id" < d."id");--> statement-breakpoint
ALTER TABLE "board_swimlane_types" ADD CONSTRAINT "board_swimlane_types_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_field_applies_to" ADD CONSTRAINT "custom_field_applies_to_project_org_fk" FOREIGN KEY ("project_id","org_id") REFERENCES "public"."projects"("id","org_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_time_tokens_one_open_transfer_per_org" ON "one_time_tokens" USING btree ("org_id") WHERE "one_time_tokens"."purpose" = 'ownership_transfer' and "one_time_tokens"."used_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_statuses_project_lower_name_unique" ON "workflow_statuses" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_statuses_one_default_per_project" ON "workflow_statuses" USING btree ("project_id") WHERE "workflow_statuses"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "priorities_project_lower_name_unique" ON "priorities" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "priorities_one_default_per_project" ON "priorities" USING btree ("project_id") WHERE "priorities"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "issue_types_project_lower_name_unique" ON "issue_types" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "issue_types_one_default_per_project" ON "issue_types" USING btree ("project_id") WHERE "issue_types"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "work_types_project_lower_name_unique" ON "work_types" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "work_types_one_default_per_project" ON "work_types" USING btree ("project_id") WHERE "work_types"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_project_lower_name_unique" ON "sprints" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "boards_project_lower_name_unique" ON "boards" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "custom_fields_project_lower_name_unique" ON "custom_fields" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "custom_field_options_field_lower_name_unique" ON "custom_field_options" USING btree ("field_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_attributes_project_lower_name_unique" ON "work_item_attributes" USING btree ("project_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_attribute_values_attribute_lower_name_unique" ON "work_item_attribute_values" USING btree ("attribute_id",lower("name"));--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_source_user_unique" UNIQUE("org_id","source_type","source_id","mentioned_user_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_workday_minutes_check" CHECK ("organizations"."workday_minutes" between 1 and 1440);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_workweek_days_check" CHECK ("organizations"."workweek_days" between 1 and 7);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_storage_used_bytes_check" CHECK ("organizations"."storage_used_bytes" >= 0);--> statement-breakpoint
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_transfer_fields_check" CHECK ("one_time_tokens"."purpose" <> 'ownership_transfer' or ("one_time_tokens"."org_id" is not null and "one_time_tokens"."created_by" is not null));--> statement-breakpoint
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_email_change_check" CHECK ("one_time_tokens"."purpose" <> 'email_change' or "one_time_tokens"."new_email" is not null);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_issue_counter_check" CHECK ("projects"."issue_counter" >= 0);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_time_fields_distinct_check" CHECK ("projects"."estimation_field_id" is null or "projects"."spent_time_field_id" is null or "projects"."estimation_field_id" <> "projects"."spent_time_field_id");--> statement-breakpoint
ALTER TABLE "workflow_statuses" ADD CONSTRAINT "workflow_statuses_default_not_archived" CHECK (not ("workflow_statuses"."is_default" and "workflow_statuses"."is_archived"));--> statement-breakpoint
ALTER TABLE "work_types" ADD CONSTRAINT "work_types_default_not_archived" CHECK (not ("work_types"."is_default" and "work_types"."is_archived"));--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_estimate_minutes_check" CHECK ("issues"."estimate_minutes" is null or "issues"."estimate_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_spent_minutes_check" CHECK ("issues"."spent_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_story_points_check" CHECK ("issues"."story_points" is null or "issues"."story_points" between 0 and 999);--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_vote_count_check" CHECK ("issues"."vote_count" >= 0);--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_comment_count_check" CHECK ("issues"."comment_count" >= 0);--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_parent_id_check" CHECK ("issues"."parent_id" is null or "issues"."parent_id" <> "issues"."id");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_start_date_check" CHECK ("issues"."start_date" is null or "issues"."due_date" is null or "issues"."start_date" <= "issues"."due_date");--> statement-breakpoint
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_from_issue_id_check" CHECK ("issue_links"."from_issue_id" <> "issue_links"."to_issue_id");--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_duration_minutes_check" CHECK ("work_items"."duration_minutes" > 0);--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_size_bytes_check" CHECK ("attachments"."size_bytes" >= 0);--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_width_check" CHECK ("attachments"."width" is null or "attachments"."width" > 0);--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_height_check" CHECK ("attachments"."height" is null or "attachments"."height" > 0);--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_parent_shape_check" CHECK (not ("attachments"."issue_id" is not null and "attachments"."article_id" is not null)
        and ("attachments"."work_item_id" is null or "attachments"."issue_id" is not null)
        and ("attachments"."comment_id" is null or "attachments"."issue_id" is not null or "attachments"."article_id" is not null));--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_project_visibility_check" CHECK ("saved_views"."visibility" <> 'project' or "saved_views"."project_id" is not null);--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_start_date_check" CHECK ("sprints"."start_date" is null or "sprints"."end_date" is null or "sprints"."start_date" <= "sprints"."end_date");--> statement-breakpoint
ALTER TABLE "sprint_snapshots" ADD CONSTRAINT "sprint_snapshots_total_points_check" CHECK ("sprint_snapshots"."total_points" >= 0);--> statement-breakpoint
ALTER TABLE "sprint_snapshots" ADD CONSTRAINT "sprint_snapshots_completed_points_check" CHECK ("sprint_snapshots"."completed_points" >= 0 and "sprint_snapshots"."completed_points" <= "sprint_snapshots"."total_points");--> statement-breakpoint
ALTER TABLE "sprint_snapshots" ADD CONSTRAINT "sprint_snapshots_total_issues_check" CHECK ("sprint_snapshots"."total_issues" >= 0);--> statement-breakpoint
ALTER TABLE "sprint_snapshots" ADD CONSTRAINT "sprint_snapshots_completed_issues_check" CHECK ("sprint_snapshots"."completed_issues" >= 0 and "sprint_snapshots"."completed_issues" <= "sprint_snapshots"."total_issues");--> statement-breakpoint
ALTER TABLE "sprint_snapshots" ADD CONSTRAINT "sprint_snapshots_remaining_estimate_minutes_check" CHECK ("sprint_snapshots"."remaining_estimate_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "sprint_snapshots" ADD CONSTRAINT "sprint_snapshots_total_estimate_minutes_check" CHECK ("sprint_snapshots"."total_estimate_minutes" is null or "sprint_snapshots"."total_estimate_minutes" >= 0);--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_swimlane_field_mode_check" CHECK (("boards"."swimlane_by" = 'values') = ("boards"."swimlane_field" is not null));--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_wip_min_check" CHECK ("board_columns"."wip_min" is null or "board_columns"."wip_min" between 1 and 999);--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_wip_max_check" CHECK ("board_columns"."wip_max" is null or "board_columns"."wip_max" between 1 and 999);--> statement-breakpoint
ALTER TABLE "board_columns" ADD CONSTRAINT "board_columns_wip_order_check" CHECK ("board_columns"."wip_min" is null or "board_columns"."wip_max" is null or "board_columns"."wip_min" <= "board_columns"."wip_max");--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_parent_id_check" CHECK ("articles"."parent_id" is null or "articles"."parent_id" <> "articles"."id");
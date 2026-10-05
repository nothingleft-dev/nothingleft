-- Hand-edited: project_id is backfilled from the parent row before it becomes NOT NULL, and each
-- referenced UNIQUE key exists before the foreign key that needs it.
ALTER TABLE "work_types" ADD CONSTRAINT "work_types_id_project_unique" UNIQUE("id","project_id");--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "project_id" bigint;--> statement-breakpoint
ALTER TABLE "work_item_values" ADD COLUMN "project_id" bigint;--> statement-breakpoint
UPDATE "work_items" w SET "project_id" = i."project_id" FROM "issues" i WHERE i."id" = w."issue_id" AND i."org_id" = w."org_id";--> statement-breakpoint
UPDATE "work_item_values" v SET "project_id" = w."project_id" FROM "work_items" w WHERE w."id" = v."work_item_id" AND w."org_id" = v."org_id";--> statement-breakpoint
ALTER TABLE "work_items" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "work_item_values" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_id_project_unique" UNIQUE("id","project_id");--> statement-breakpoint
ALTER TABLE "work_items" DROP CONSTRAINT "work_items_work_type_org_fk";--> statement-breakpoint
ALTER TABLE "work_item_values" DROP CONSTRAINT "work_item_values_attribute_org_fk";--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_issue_project_fk" FOREIGN KEY ("issue_id","project_id") REFERENCES "public"."issues"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_work_type_project_fk" FOREIGN KEY ("work_type_id","project_id") REFERENCES "public"."work_types"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_values" ADD CONSTRAINT "work_item_values_work_item_project_fk" FOREIGN KEY ("work_item_id","project_id") REFERENCES "public"."work_items"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_values" ADD CONSTRAINT "work_item_values_attribute_project_fk" FOREIGN KEY ("attribute_id","project_id") REFERENCES "public"."work_item_attributes"("id","project_id") ON DELETE cascade ON UPDATE no action;

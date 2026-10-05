ALTER TABLE "organizations" ADD COLUMN "storage_notice_level" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_storage_notice_level_check" CHECK ("organizations"."storage_notice_level" in (0,95,100));
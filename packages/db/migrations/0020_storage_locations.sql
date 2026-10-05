CREATE TABLE "org_storage_locations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "org_storage_locations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"org_id" bigint NOT NULL,
	"provider" text NOT NULL,
	"endpoint" text NOT NULL,
	"region" text NOT NULL,
	"bucket" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_storage_locations_identity_unique" UNIQUE("org_id","provider","endpoint","bucket"),
	CONSTRAINT "org_storage_locations_id_org_unique" UNIQUE("id","org_id"),
	CONSTRAINT "org_storage_locations_provider_check" CHECK ("org_storage_locations"."provider" in ('r2','s3'))
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "storage_location_id" bigint;--> statement-breakpoint
ALTER TABLE "org_storage_configs" ADD COLUMN "location_id" bigint;--> statement-breakpoint
ALTER TABLE "org_storage_locations" ADD CONSTRAINT "org_storage_locations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_storage_location_org_fk" FOREIGN KEY ("storage_location_id","org_id") REFERENCES "public"."org_storage_locations"("id","org_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_storage_configs" ADD CONSTRAINT "org_storage_configs_location_org_fk" FOREIGN KEY ("location_id","org_id") REFERENCES "public"."org_storage_locations"("id","org_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Hand-edited: one location per existing connection, then each customer-bucket file points at its
-- organisation's location for the bucket it names. A file no connection names fails the CHECK below.
INSERT INTO "org_storage_locations" ("org_id", "provider", "endpoint", "region", "bucket", "created_at")
SELECT c."org_id", c."provider", c."endpoint", c."region", c."bucket", c."created_at"
FROM "org_storage_configs" c;
--> statement-breakpoint
UPDATE "org_storage_configs" c
SET "location_id" = l."id"
FROM "org_storage_locations" l
WHERE l."org_id" = c."org_id"
  AND l."provider" = c."provider"
  AND l."endpoint" = c."endpoint"
  AND l."bucket" = c."bucket";
--> statement-breakpoint
UPDATE "attachments" a
SET "storage_location_id" = c."location_id"
FROM "org_storage_configs" c
WHERE a."storage_target" = 'byo'
  AND c."org_id" = a."org_id"
  AND c."bucket" = a."bucket";
--> statement-breakpoint
ALTER TABLE "org_storage_configs" DROP CONSTRAINT "org_storage_configs_provider_check";--> statement-breakpoint
ALTER TABLE "org_storage_configs" ALTER COLUMN "location_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "org_storage_configs" DROP COLUMN "provider";--> statement-breakpoint
ALTER TABLE "org_storage_configs" DROP COLUMN "endpoint";--> statement-breakpoint
ALTER TABLE "org_storage_configs" DROP COLUMN "region";--> statement-breakpoint
ALTER TABLE "org_storage_configs" DROP COLUMN "bucket";--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_storage_location_check" CHECK (("attachments"."storage_target" = 'byo') = ("attachments"."storage_location_id" is not null));
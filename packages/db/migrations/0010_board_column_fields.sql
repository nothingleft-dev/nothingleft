CREATE TABLE "board_column_values" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "board_column_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"column_id" bigint NOT NULL,
	"board_id" bigint NOT NULL,
	"project_id" bigint NOT NULL,
	"org_id" bigint NOT NULL,
	"status_id" bigint,
	"priority_id" bigint,
	"type_id" bigint,
	CONSTRAINT "board_column_values_board_status_unique" UNIQUE("board_id","status_id"),
	CONSTRAINT "board_column_values_board_priority_unique" UNIQUE("board_id","priority_id"),
	CONSTRAINT "board_column_values_board_type_unique" UNIQUE("board_id","type_id"),
	CONSTRAINT "board_column_values_one_value_check" CHECK (num_nonnulls("board_column_values"."status_id", "board_column_values"."priority_id", "board_column_values"."type_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "column_field" text DEFAULT 'status' NOT NULL;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_column_board_fk" FOREIGN KEY ("column_id","board_id") REFERENCES "public"."board_columns"("id","board_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_board_project_fk" FOREIGN KEY ("board_id","project_id") REFERENCES "public"."boards"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_status_project_fk" FOREIGN KEY ("status_id","project_id") REFERENCES "public"."workflow_statuses"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_priority_project_fk" FOREIGN KEY ("priority_id","project_id") REFERENCES "public"."priorities"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "board_column_values" ADD CONSTRAINT "board_column_values_type_project_fk" FOREIGN KEY ("type_id","project_id") REFERENCES "public"."issue_types"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_column_field_check" CHECK ("boards"."column_field" in ('status','priority','type'));
--> statement-breakpoint
-- Data: every status mapping moves over; boards stay columned by status.
INSERT INTO "board_column_values" ("column_id", "board_id", "project_id", "org_id", "status_id")
SELECT "column_id", "board_id", "project_id", "org_id", "status_id" FROM "board_column_statuses";
--> statement-breakpoint
DROP TABLE "board_column_statuses" CASCADE;

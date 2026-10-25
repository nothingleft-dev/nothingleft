ALTER TABLE "one_time_tokens" DROP CONSTRAINT "one_time_tokens_purpose_check";--> statement-breakpoint
ALTER TABLE "one_time_tokens" DROP CONSTRAINT "one_time_tokens_email_change_check";--> statement-breakpoint
ALTER TABLE "git_connections" ADD COLUMN "token_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_purpose_check" CHECK ("one_time_tokens"."purpose" in ('password_reset','email_verify','email_change','ownership_transfer','git_identity_email'));--> statement-breakpoint
ALTER TABLE "one_time_tokens" ADD CONSTRAINT "one_time_tokens_email_change_check" CHECK ("one_time_tokens"."purpose" not in ('email_change','git_identity_email') or "one_time_tokens"."new_email" is not null);
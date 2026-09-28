DROP INDEX "snapshot_ws_cycle_day";--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_snapshot" ADD CONSTRAINT "snapshot_ws_cycle_day" UNIQUE NULLS NOT DISTINCT("workspace_id","cycle_id","day");
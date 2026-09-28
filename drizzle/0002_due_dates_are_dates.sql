ALTER TABLE "container" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "milestone" ADD COLUMN "due_on" date;--> statement-breakpoint
-- Preserve existing values. Rows written by earlier clients stored local noon
-- as a UTC instant, so the UTC date is the date the user picked.
UPDATE "container" SET "due_on" = ("due_at" AT TIME ZONE 'UTC')::date WHERE "due_at" IS NOT NULL;--> statement-breakpoint
UPDATE "item" SET "due_on" = ("due_at" AT TIME ZONE 'UTC')::date WHERE "due_at" IS NOT NULL;--> statement-breakpoint
UPDATE "milestone" SET "due_on" = ("due_at" AT TIME ZONE 'UTC')::date WHERE "due_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "container" DROP COLUMN "due_at";--> statement-breakpoint
ALTER TABLE "item" DROP COLUMN "due_at";--> statement-breakpoint
ALTER TABLE "milestone" DROP COLUMN "due_at";

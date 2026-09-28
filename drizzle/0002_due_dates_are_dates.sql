ALTER TABLE "container" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "item" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "milestone" ADD COLUMN "due_on" date;--> statement-breakpoint
-- Preserve existing values. due_at is timestamp WITHOUT time zone holding the
-- UTC wall time earlier clients wrote (local noon via toISOString()). A plain
-- ::date cast truncates with no session-zone involvement. For users west of
-- UTC through UTC+11 this is the day they picked; for UTC+12 and beyond their
-- local noon was stored as the previous UTC day and cannot be recovered.
UPDATE "container" SET "due_on" = "due_at"::date WHERE "due_at" IS NOT NULL;--> statement-breakpoint
UPDATE "item" SET "due_on" = "due_at"::date WHERE "due_at" IS NOT NULL;--> statement-breakpoint
UPDATE "milestone" SET "due_on" = "due_at"::date WHERE "due_at" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "container" DROP COLUMN "due_at";--> statement-breakpoint
ALTER TABLE "item" DROP COLUMN "due_at";--> statement-breakpoint
ALTER TABLE "milestone" DROP COLUMN "due_at";

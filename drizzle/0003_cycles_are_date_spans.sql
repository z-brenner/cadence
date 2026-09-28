ALTER TABLE "cycle" ADD COLUMN "starts_on" date;--> statement-breakpoint
ALTER TABLE "cycle" ADD COLUMN "ends_on" date;--> statement-breakpoint
-- Plain ::date truncation of the UTC wall time; no session-zone involvement.
UPDATE "cycle" SET "starts_on" = "starts_at"::date, "ends_on" = "ends_at"::date;--> statement-breakpoint
ALTER TABLE "cycle" ALTER COLUMN "starts_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cycle" ALTER COLUMN "ends_on" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cycle" DROP COLUMN "starts_at";--> statement-breakpoint
ALTER TABLE "cycle" DROP COLUMN "ends_at";

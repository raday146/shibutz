ALTER TABLE "jobs" ADD COLUMN "title" text;--> statement-breakpoint
UPDATE "jobs" SET "title" = 'Job ' || "id";--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "address" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "address" DROP DEFAULT;

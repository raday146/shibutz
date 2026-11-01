ALTER TYPE "public"."technician_change_action" ADD VALUE 'deleted';--> statement-breakpoint
ALTER TABLE "technician_changes" ALTER COLUMN "technician_id" DROP NOT NULL;--> statement-breakpoint
-- Rows of technicians deleted before this migration refer to nothing; keep them, with no technician.
UPDATE "technician_changes" SET "technician_id" = NULL WHERE "technician_id" NOT IN (SELECT "id" FROM "technicians");--> statement-breakpoint
ALTER TABLE "technician_changes" ADD CONSTRAINT "technician_changes_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE set null ON UPDATE no action;
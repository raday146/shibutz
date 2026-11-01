ALTER TABLE "technicians" ALTER COLUMN "color" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "technicians" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "technicians" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Existing rows stay active with their color; the old least-used rule could repeat a color past 8 technicians, so later repeats become inactive.
UPDATE "technicians" SET "active" = false, "color" = NULL WHERE "id" IN (SELECT "id" FROM (SELECT "id", row_number() OVER (PARTITION BY "color" ORDER BY "id") AS rn FROM "technicians") d WHERE d.rn > 1);--> statement-breakpoint
CREATE UNIQUE INDEX "technicians_active_color_key" ON "technicians" USING btree ("color") WHERE "technicians"."active";--> statement-breakpoint
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_active_color" CHECK ("technicians"."active" = ("technicians"."color" IS NOT NULL));
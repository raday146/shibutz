ALTER TABLE "technicians" ALTER COLUMN "color" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "technicians" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "technicians" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- A repeat-color technician with assigned or in_progress stops cannot be deactivated without breaking the "inactive has no unfinished stops" rule: stop here, nothing is applied.
DO $$
DECLARE busy text;
BEGIN
  SELECT string_agg(DISTINCT t."id"::text, ', ') INTO busy
  FROM "technicians" t
  JOIN "routes" r ON r."technician_id" = t."id"
  JOIN "route_stops" s ON s."route_id" = r."id"
  JOIN "jobs" j ON j."id" = s."job_id"
  WHERE j."status" IN ('assigned', 'in_progress')
    AND t."id" IN (SELECT "id" FROM (SELECT "id", row_number() OVER (PARTITION BY "color" ORDER BY "id") AS rn FROM "technicians") d WHERE d.rn > 1);
  IF busy IS NOT NULL THEN
    RAISE EXCEPTION 'Migration 0010 refused: technician(s) % repeat a route color and have unfinished stops; unassign or finish those jobs, or give them distinct colors, then migrate again', busy;
  END IF;
END $$;--> statement-breakpoint
-- Existing rows stay active with their color; the old least-used rule could repeat a color past 8 technicians, so later repeats become inactive.
UPDATE "technicians" SET "active" = false, "color" = NULL WHERE "id" IN (SELECT "id" FROM (SELECT "id", row_number() OVER (PARTITION BY "color" ORDER BY "id") AS rn FROM "technicians") d WHERE d.rn > 1);--> statement-breakpoint
CREATE UNIQUE INDEX "technicians_active_color_key" ON "technicians" USING btree ("color") WHERE "technicians"."active";--> statement-breakpoint
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_active_color" CHECK ("technicians"."active" = ("technicians"."color" IS NOT NULL));
ALTER TABLE "skills" RENAME COLUMN "name" TO "name_en";--> statement-breakpoint
ALTER TABLE "skills" ADD COLUMN "name_he" text;--> statement-breakpoint
UPDATE "skills" SET "name_he" = "name_en";--> statement-breakpoint
ALTER TABLE "skills" ALTER COLUMN "name_he" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "technicians" ADD COLUMN "color" integer;--> statement-breakpoint
UPDATE "technicians" t SET "color" = (n.rn - 1) % 8 + 1 FROM (SELECT "id", row_number() OVER (ORDER BY "id") AS rn FROM "technicians") n WHERE t."id" = n."id";--> statement-breakpoint
ALTER TABLE "technicians" ALTER COLUMN "color" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_color_range" CHECK ("technicians"."color" BETWEEN 1 AND 8);

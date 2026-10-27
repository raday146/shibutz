CREATE TYPE "public"."unassigned_reason" AS ENUM('NO_SKILLED_TECHNICIAN', 'WINDOW_OUTSIDE_ALL_SHIFTS', 'UNREACHABLE', 'NOT_FEASIBLE_IN_PLAN');--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "unassigned_reason" "unassigned_reason";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "unassigned_at" timestamp with time zone;
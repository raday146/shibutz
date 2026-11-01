CREATE TYPE "public"."technician_change_action" AS ENUM('created', 'updated', 'deactivated', 'reactivated');--> statement-breakpoint
CREATE TABLE "technician_changes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "technician_changes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"technician_id" integer NOT NULL,
	"action" "technician_change_action" NOT NULL,
	"name" text NOT NULL,
	"before" jsonb,
	"after" jsonb
);

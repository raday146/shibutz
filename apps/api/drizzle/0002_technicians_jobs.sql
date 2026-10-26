CREATE TYPE "public"."job_status" AS ENUM('unassigned', 'assigned', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "job_skills" (
	"job_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	CONSTRAINT "job_skills_job_id_skill_id_pk" PRIMARY KEY("job_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"location" geography(Point,4326) NOT NULL,
	"service_duration_s" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"day" date GENERATED ALWAYS AS ((window_start AT TIME ZONE 'Asia/Jerusalem')::date) STORED NOT NULL,
	"priority" integer NOT NULL,
	"status" "job_status" DEFAULT 'unassigned' NOT NULL,
	CONSTRAINT "jobs_window_order" CHECK ("jobs"."window_end" > "jobs"."window_start"),
	CONSTRAINT "jobs_window_same_local_day" CHECK ((window_start AT TIME ZONE 'Asia/Jerusalem')::date = (window_end AT TIME ZONE 'Asia/Jerusalem')::date),
	CONSTRAINT "jobs_service_positive" CHECK ("jobs"."service_duration_s" > 0),
	CONSTRAINT "jobs_priority_range" CHECK ("jobs"."priority" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "technician_skills" (
	"technician_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	CONSTRAINT "technician_skills_technician_id_skill_id_pk" PRIMARY KEY("technician_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "technicians" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "technicians_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"home" geography(Point,4326) NOT NULL,
	"shift_start" time NOT NULL,
	"shift_end" time NOT NULL,
	CONSTRAINT "technicians_shift_order" CHECK ("technicians"."shift_end" > "technicians"."shift_start")
);
--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_skills" ADD CONSTRAINT "job_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_skills" ADD CONSTRAINT "technician_skills_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_skills" ADD CONSTRAINT "technician_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE no action ON UPDATE no action;
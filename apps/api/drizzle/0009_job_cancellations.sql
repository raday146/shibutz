CREATE TABLE "job_cancellations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_cancellations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job_id" integer NOT NULL,
	"technician_id" integer,
	"date" date NOT NULL,
	"previous_status" "job_status" NOT NULL,
	"actual_arrival" timestamp with time zone,
	"actual_departure" timestamp with time zone,
	"cancelled_at" timestamp with time zone NOT NULL,
	"reason" text,
	CONSTRAINT "job_cancellations_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
ALTER TABLE "job_cancellations" ADD CONSTRAINT "job_cancellations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cancellations" ADD CONSTRAINT "job_cancellations_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE set null ON UPDATE no action;
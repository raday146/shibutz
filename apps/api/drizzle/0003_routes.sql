CREATE TABLE "route_stops" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "route_stops_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"route_id" integer NOT NULL,
	"job_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"eta" timestamp with time zone NOT NULL,
	"etd" timestamp with time zone NOT NULL,
	"actual_arrival" timestamp with time zone,
	"actual_departure" timestamp with time zone,
	CONSTRAINT "route_stops_job_id_unique" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "routes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "routes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"technician_id" integer NOT NULL,
	"date" date NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "routes_technician_date" UNIQUE("technician_id","date")
);
--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routes" ADD CONSTRAINT "routes_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE cascade ON UPDATE no action;
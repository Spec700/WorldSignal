CREATE TYPE "public"."flight_assignment_status" AS ENUM('planned', 'onboard_confirmed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."flight_tracking_status" AS ENUM('scheduled', 'match_required', 'tracking', 'possible_arrival', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "flight_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"flight_instance_id" uuid NOT NULL,
	"protectee_id" uuid NOT NULL,
	"status" "flight_assignment_status" DEFAULT 'planned' NOT NULL,
	"assigned_by_operator_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"onboard_confirmed_by_operator_id" uuid,
	"onboard_confirmed_at" timestamp with time zone,
	"completed_by_operator_id" uuid,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flight_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"passenger_flight_number" text NOT NULL,
	"adsb_callsign" text NOT NULL,
	"origin_iata" text NOT NULL,
	"origin_name" text NOT NULL,
	"origin_latitude" double precision NOT NULL,
	"origin_longitude" double precision NOT NULL,
	"destination_iata" text NOT NULL,
	"destination_name" text NOT NULL,
	"destination_latitude" double precision NOT NULL,
	"destination_longitude" double precision NOT NULL,
	"scheduled_departure_at" timestamp with time zone NOT NULL,
	"scheduled_arrival_at" timestamp with time zone,
	"tracking_status" "flight_tracking_status" DEFAULT 'scheduled' NOT NULL,
	"aircraft_icao_hex" text,
	"aircraft_registration" text,
	"aircraft_type" text,
	"aircraft_confirmed_by_operator_id" uuid,
	"aircraft_confirmed_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"last_successful_poll_at" timestamp with time zone,
	"last_source_error" text,
	"notes" text,
	"created_by_operator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_instances_origin_latitude_bounds" CHECK ("flight_instances"."origin_latitude" between -90 and 90),
	CONSTRAINT "flight_instances_origin_longitude_bounds" CHECK ("flight_instances"."origin_longitude" between -180 and 180),
	CONSTRAINT "flight_instances_destination_latitude_bounds" CHECK ("flight_instances"."destination_latitude" between -90 and 90),
	CONSTRAINT "flight_instances_destination_longitude_bounds" CHECK ("flight_instances"."destination_longitude" between -180 and 180),
	CONSTRAINT "flight_instances_distinct_airports" CHECK ("flight_instances"."origin_iata" <> "flight_instances"."destination_iata"),
	CONSTRAINT "flight_instances_arrival_after_departure" CHECK ("flight_instances"."scheduled_arrival_at" is null or "flight_instances"."scheduled_arrival_at" > "flight_instances"."scheduled_departure_at")
);
--> statement-breakpoint
CREATE TABLE "flight_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flight_instance_id" uuid NOT NULL,
	"source" text DEFAULT 'adsb.lol' NOT NULL,
	"aircraft_icao_hex" text NOT NULL,
	"callsign" text,
	"registration" text,
	"aircraft_type" text,
	"latitude" double precision,
	"longitude" double precision,
	"barometric_altitude_feet" double precision,
	"geometric_altitude_feet" double precision,
	"ground_speed_knots" double precision,
	"track_degrees" double precision,
	"vertical_rate_feet_per_minute" double precision,
	"squawk" text,
	"on_ground" boolean DEFAULT false NOT NULL,
	"source_observed_at" timestamp with time zone NOT NULL,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_observations_latitude_bounds" CHECK ("flight_observations"."latitude" is null or "flight_observations"."latitude" between -90 and 90),
	CONSTRAINT "flight_observations_longitude_bounds" CHECK ("flight_observations"."longitude" is null or "flight_observations"."longitude" between -180 and 180)
);
--> statement-breakpoint
ALTER TABLE "flight_assignments" ADD CONSTRAINT "flight_assignments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_assignments" ADD CONSTRAINT "flight_assignments_flight_instance_id_flight_instances_id_fk" FOREIGN KEY ("flight_instance_id") REFERENCES "public"."flight_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_assignments" ADD CONSTRAINT "flight_assignments_protectee_id_protectees_id_fk" FOREIGN KEY ("protectee_id") REFERENCES "public"."protectees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_assignments" ADD CONSTRAINT "flight_assignments_assigned_by_operator_id_operators_id_fk" FOREIGN KEY ("assigned_by_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_assignments" ADD CONSTRAINT "flight_assignments_onboard_confirmed_by_operator_id_operators_id_fk" FOREIGN KEY ("onboard_confirmed_by_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_assignments" ADD CONSTRAINT "flight_assignments_completed_by_operator_id_operators_id_fk" FOREIGN KEY ("completed_by_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD CONSTRAINT "flight_instances_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD CONSTRAINT "flight_instances_aircraft_confirmed_by_operator_id_operators_id_fk" FOREIGN KEY ("aircraft_confirmed_by_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD CONSTRAINT "flight_instances_created_by_operator_id_operators_id_fk" FOREIGN KEY ("created_by_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flight_observations" ADD CONSTRAINT "flight_observations_flight_instance_id_flight_instances_id_fk" FOREIGN KEY ("flight_instance_id") REFERENCES "public"."flight_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flight_assignments_flight_person_unique" ON "flight_assignments" USING btree ("flight_instance_id","protectee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flight_assignments_one_active_travel_per_person_unique" ON "flight_assignments" USING btree ("protectee_id") WHERE "flight_assignments"."status" = 'onboard_confirmed';--> statement-breakpoint
CREATE INDEX "flight_assignments_workspace_status_idx" ON "flight_assignments" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "flight_assignments_person_idx" ON "flight_assignments" USING btree ("protectee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flight_instances_workspace_flight_departure_unique" ON "flight_instances" USING btree ("workspace_id","passenger_flight_number","scheduled_departure_at","origin_iata","destination_iata");--> statement-breakpoint
CREATE INDEX "flight_instances_workspace_status_departure_idx" ON "flight_instances" USING btree ("workspace_id","tracking_status","scheduled_departure_at");--> statement-breakpoint
CREATE INDEX "flight_instances_aircraft_idx" ON "flight_instances" USING btree ("aircraft_icao_hex");--> statement-breakpoint
CREATE INDEX "flight_observations_flight_observed_idx" ON "flight_observations" USING btree ("flight_instance_id","source_observed_at");--> statement-breakpoint
CREATE INDEX "flight_observations_aircraft_observed_idx" ON "flight_observations" USING btree ("aircraft_icao_hex","source_observed_at");
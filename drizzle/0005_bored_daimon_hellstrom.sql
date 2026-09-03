CREATE TABLE "flight_source_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"key_fingerprint" text NOT NULL,
	"provider_key_id" integer,
	"plan_type" text,
	"provider_expires_at" timestamp with time zone,
	"provider_monthly_limit" integer,
	"provider_monthly_used" integer,
	"provider_monthly_remaining" integer,
	"cycle_started_at" timestamp with time zone NOT NULL,
	"cycle_ends_at" timestamp with time zone NOT NULL,
	"automation_request_count" integer DEFAULT 0 NOT NULL,
	"interactive_request_count" integer DEFAULT 0 NOT NULL,
	"paused_at" timestamp with time zone,
	"pause_code" text,
	"pause_reason" text,
	"last_request_at" timestamp with time zone,
	"last_successful_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flight_source_states_request_counts_nonnegative" CHECK ("flight_source_states"."automation_request_count" >= 0 and "flight_source_states"."interactive_request_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "flight_observations" ALTER COLUMN "source" SET DEFAULT 'airlabs';--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "provider_flight_icao" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "airline_iata" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "airline_icao" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "airline_name" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "origin_icao" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "destination_icao" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "estimated_departure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "actual_departure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "estimated_arrival_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "actual_arrival_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "departure_terminal" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "departure_gate" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "destination_terminal" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "destination_gate" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "destination_baggage" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "departure_delay_minutes" integer;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "arrival_delay_minutes" integer;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "progress_percent" double precision;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "eta_minutes" integer;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "provider_status" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "aircraft_model" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "aircraft_manufacturer" text;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "aircraft_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "next_poll_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "consecutive_source_errors" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "flight_instances" ADD COLUMN "source_error_code" text;--> statement-breakpoint
ALTER TABLE "flight_source_states" ADD CONSTRAINT "flight_source_states_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "flight_source_states_workspace_provider_unique" ON "flight_source_states" USING btree ("workspace_id","provider");--> statement-breakpoint
CREATE INDEX "flight_instances_next_poll_idx" ON "flight_instances" USING btree ("tracking_status","next_poll_at");
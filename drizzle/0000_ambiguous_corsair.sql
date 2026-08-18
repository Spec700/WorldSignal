CREATE TYPE "public"."case_status" AS ENUM('open', 'investigating', 'notifying', 'remediating', 'monitoring', 'closed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."communication_channel" AS ENUM('email', 'phone', 'chat', 'in_person', 'other');--> statement-breakpoint
CREATE TYPE "public"."communication_status" AS ENUM('draft', 'planned', 'sent', 'acknowledged', 'failed');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('low', 'medium', 'high', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."credential_kind" AS ENUM('password', 'password_hash', 'session_token', 'session_cookie', 'api_key', 'other');--> statement-breakpoint
CREATE TYPE "public"."exposure_source_type" AS ENUM('breach', 'infostealer', 'phishing', 'combolist', 'paste', 'internal_report', 'other');--> statement-breakpoint
CREATE TYPE "public"."exposure_status" AS ENUM('new', 'triaged', 'in_case', 'remediated', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."exposure_verification" AS ENUM('unverified', 'confirmed', 'false_positive');--> statement-breakpoint
CREATE TYPE "public"."identity_type" AS ENUM('work_email', 'personal_email', 'username', 'phone', 'domain', 'other');--> statement-breakpoint
CREATE TYPE "public"."location_precision" AS ENUM('exact', 'city', 'region', 'country');--> statement-breakpoint
CREATE TYPE "public"."match_method" AS ENUM('exact', 'manual');--> statement-breakpoint
CREATE TYPE "public"."operator_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."protectee_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."protectee_tier" AS ENUM('standard', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('todo', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_type" AS ENUM('verify', 'notify', 'password_reset', 'revoke_sessions', 'enable_mfa', 'check_reuse', 'investigate_device', 'other');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_operator_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_exposures" (
	"case_id" uuid NOT NULL,
	"exposure_id" uuid NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attached_by_operator_id" uuid,
	CONSTRAINT "case_exposures_case_id_exposure_id_pk" PRIMARY KEY("case_id","exposure_id")
);
--> statement-breakpoint
CREATE TABLE "case_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"type" "task_type" NOT NULL,
	"title" text NOT NULL,
	"status" "task_status" DEFAULT 'todo' NOT NULL,
	"assignee_operator_id" uuid,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"channel" "communication_channel" NOT NULL,
	"status" "communication_status" DEFAULT 'draft' NOT NULL,
	"recipient_label" text NOT NULL,
	"subject" text,
	"body" text,
	"sent_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"created_by_operator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential_exposures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"exposed_identity_type" "identity_type" NOT NULL,
	"exposed_identity_display" text NOT NULL,
	"exposed_identity_normalized" text NOT NULL,
	"service" text,
	"service_domain" text,
	"credential_kind" "credential_kind" NOT NULL,
	"credential_ciphertext" text,
	"credential_iv" text,
	"credential_auth_tag" text,
	"credential_key_version" text,
	"credential_fingerprint" text,
	"credential_length" integer,
	"dedupe_key" text NOT NULL,
	"exposed_at" timestamp with time zone,
	"observed_at" timestamp with time zone NOT NULL,
	"severity" "priority" NOT NULL,
	"confidence" "confidence" DEFAULT 'medium' NOT NULL,
	"verification" "exposure_verification" DEFAULT 'unverified' NOT NULL,
	"status" "exposure_status" DEFAULT 'new' NOT NULL,
	"notes" text,
	"created_by_operator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credential_exposures_length_nonnegative" CHECK ("credential_exposures"."credential_length" is null or "credential_exposures"."credential_length" >= 0)
);
--> statement-breakpoint
CREATE TABLE "exposure_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exposure_id" uuid NOT NULL,
	"protectee_id" uuid NOT NULL,
	"identity_id" uuid,
	"method" "match_method" NOT NULL,
	"confidence" "confidence" NOT NULL,
	"confirmed_by_operator_id" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exposure_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"type" "exposure_source_type" NOT NULL,
	"name" text NOT NULL,
	"reference_url" text,
	"source_record_id" text,
	"breach_occurred_at" timestamp with time zone,
	"observed_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confidence" "confidence" DEFAULT 'medium' NOT NULL,
	"notes" text,
	"created_by_operator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_roles" (
	"operator_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operator_roles_operator_id_role_id_pk" PRIMARY KEY("operator_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"status" "operator_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protectee_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"protectee_id" uuid NOT NULL,
	"type" "identity_type" NOT NULL,
	"display_value" text NOT NULL,
	"normalized_value" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protectee_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protectee_id" uuid NOT NULL,
	"label" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"precision" "location_precision" DEFAULT 'city' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "protectees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"title" text,
	"organization" text,
	"tier" "protectee_tier" DEFAULT 'standard' NOT NULL,
	"status" "protectee_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"protectee_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" "case_status" DEFAULT 'open' NOT NULL,
	"priority" "priority" NOT NULL,
	"assignee_operator_id" uuid,
	"due_at" timestamp with time zone,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_operator_id_operators_id_fk" FOREIGN KEY ("actor_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_exposures" ADD CONSTRAINT "case_exposures_case_id_response_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."response_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_exposures" ADD CONSTRAINT "case_exposures_exposure_id_credential_exposures_id_fk" FOREIGN KEY ("exposure_id") REFERENCES "public"."credential_exposures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_exposures" ADD CONSTRAINT "case_exposures_attached_by_operator_id_operators_id_fk" FOREIGN KEY ("attached_by_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_case_id_response_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."response_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_tasks" ADD CONSTRAINT "case_tasks_assignee_operator_id_operators_id_fk" FOREIGN KEY ("assignee_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_case_id_response_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."response_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_created_by_operator_id_operators_id_fk" FOREIGN KEY ("created_by_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_exposures" ADD CONSTRAINT "credential_exposures_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_exposures" ADD CONSTRAINT "credential_exposures_source_id_exposure_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."exposure_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_exposures" ADD CONSTRAINT "credential_exposures_created_by_operator_id_operators_id_fk" FOREIGN KEY ("created_by_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_matches" ADD CONSTRAINT "exposure_matches_exposure_id_credential_exposures_id_fk" FOREIGN KEY ("exposure_id") REFERENCES "public"."credential_exposures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_matches" ADD CONSTRAINT "exposure_matches_protectee_id_protectees_id_fk" FOREIGN KEY ("protectee_id") REFERENCES "public"."protectees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_matches" ADD CONSTRAINT "exposure_matches_identity_id_protectee_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."protectee_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_matches" ADD CONSTRAINT "exposure_matches_confirmed_by_operator_id_operators_id_fk" FOREIGN KEY ("confirmed_by_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_sources" ADD CONSTRAINT "exposure_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_sources" ADD CONSTRAINT "exposure_sources_created_by_operator_id_operators_id_fk" FOREIGN KEY ("created_by_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_roles" ADD CONSTRAINT "operator_roles_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_roles" ADD CONSTRAINT "operator_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operators" ADD CONSTRAINT "operators_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protectee_identities" ADD CONSTRAINT "protectee_identities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protectee_identities" ADD CONSTRAINT "protectee_identities_protectee_id_protectees_id_fk" FOREIGN KEY ("protectee_id") REFERENCES "public"."protectees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protectee_locations" ADD CONSTRAINT "protectee_locations_protectee_id_protectees_id_fk" FOREIGN KEY ("protectee_id") REFERENCES "public"."protectees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "protectees" ADD CONSTRAINT "protectees_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_cases" ADD CONSTRAINT "response_cases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_cases" ADD CONSTRAINT "response_cases_protectee_id_protectees_id_fk" FOREIGN KEY ("protectee_id") REFERENCES "public"."protectees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_cases" ADD CONSTRAINT "response_cases_assignee_operator_id_operators_id_fk" FOREIGN KEY ("assignee_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_workspace_occurred_idx" ON "activity_log" USING btree ("workspace_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_log_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "case_tasks_case_status_idx" ON "case_tasks" USING btree ("case_id","status");--> statement-breakpoint
CREATE INDEX "communications_case_status_idx" ON "communications" USING btree ("case_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "credential_exposures_workspace_dedupe_unique" ON "credential_exposures" USING btree ("workspace_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "credential_exposures_workspace_status_priority_idx" ON "credential_exposures" USING btree ("workspace_id","status","severity");--> statement-breakpoint
CREATE INDEX "credential_exposures_identity_idx" ON "credential_exposures" USING btree ("workspace_id","exposed_identity_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "exposure_matches_exposure_protectee_unique" ON "exposure_matches" USING btree ("exposure_id","protectee_id");--> statement-breakpoint
CREATE INDEX "exposure_matches_protectee_idx" ON "exposure_matches" USING btree ("protectee_id");--> statement-breakpoint
CREATE INDEX "exposure_sources_workspace_observed_idx" ON "exposure_sources" USING btree ("workspace_id","observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operators_workspace_email_unique" ON "operators" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "operators_workspace_status_idx" ON "operators" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "protectee_identities_workspace_type_value_unique" ON "protectee_identities" USING btree ("workspace_id","type","normalized_value");--> statement-breakpoint
CREATE INDEX "protectee_identities_protectee_idx" ON "protectee_identities" USING btree ("protectee_id");--> statement-breakpoint
CREATE INDEX "protectee_locations_active_idx" ON "protectee_locations" USING btree ("protectee_id","is_active");--> statement-breakpoint
CREATE INDEX "protectees_workspace_status_idx" ON "protectees" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "protectees_workspace_name_idx" ON "protectees" USING btree ("workspace_id","display_name");--> statement-breakpoint
CREATE INDEX "response_cases_workspace_status_priority_idx" ON "response_cases" USING btree ("workspace_id","status","priority");--> statement-breakpoint
CREATE INDEX "response_cases_protectee_idx" ON "response_cases" USING btree ("protectee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_workspace_slug_unique" ON "roles" USING btree ("workspace_id","slug");
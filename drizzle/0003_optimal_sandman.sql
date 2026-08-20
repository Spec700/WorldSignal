CREATE TYPE "public"."credential_asset_status" AS ENUM('active', 'rotating', 'revoked', 'retired');--> statement-breakpoint
CREATE TYPE "public"."credential_version_status" AS ENUM('active', 'superseded', 'revoked');--> statement-breakpoint
CREATE TABLE "credential_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"protectee_id" uuid NOT NULL,
	"identity_id" uuid,
	"account_identifier" text NOT NULL,
	"service" text NOT NULL,
	"service_domain" text,
	"credential_kind" "credential_kind" NOT NULL,
	"status" "credential_asset_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_by_operator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credential_assets_managed_kind" CHECK ("credential_assets"."credential_kind" <> 'password_hash')
);
--> statement-breakpoint
CREATE TABLE "credential_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credential_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"credential_ciphertext" text NOT NULL,
	"credential_iv" text NOT NULL,
	"credential_auth_tag" text NOT NULL,
	"credential_key_version" text NOT NULL,
	"credential_fingerprint" text NOT NULL,
	"credential_length" integer NOT NULL,
	"status" "credential_version_status" DEFAULT 'active' NOT NULL,
	"activated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"created_by_operator_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credential_versions_version_positive" CHECK ("credential_versions"."version" > 0),
	CONSTRAINT "credential_versions_length_positive" CHECK ("credential_versions"."credential_length" > 0)
);
--> statement-breakpoint
ALTER TABLE "exposure_matches" ADD COLUMN "credential_id" uuid;--> statement-breakpoint
ALTER TABLE "credential_assets" ADD CONSTRAINT "credential_assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_assets" ADD CONSTRAINT "credential_assets_protectee_id_protectees_id_fk" FOREIGN KEY ("protectee_id") REFERENCES "public"."protectees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_assets" ADD CONSTRAINT "credential_assets_identity_id_protectee_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."protectee_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_assets" ADD CONSTRAINT "credential_assets_created_by_operator_id_operators_id_fk" FOREIGN KEY ("created_by_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_versions" ADD CONSTRAINT "credential_versions_credential_id_credential_assets_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credential_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_versions" ADD CONSTRAINT "credential_versions_created_by_operator_id_operators_id_fk" FOREIGN KEY ("created_by_operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credential_assets_workspace_owner_service_unique" ON "credential_assets" USING btree ("workspace_id","protectee_id","account_identifier","service","credential_kind");--> statement-breakpoint
CREATE INDEX "credential_assets_workspace_status_idx" ON "credential_assets" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "credential_assets_protectee_idx" ON "credential_assets" USING btree ("protectee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credential_versions_credential_version_unique" ON "credential_versions" USING btree ("credential_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "credential_versions_one_active_unique" ON "credential_versions" USING btree ("credential_id") WHERE "credential_versions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "credential_versions_credential_status_idx" ON "credential_versions" USING btree ("credential_id","status");--> statement-breakpoint
ALTER TABLE "exposure_matches" ADD CONSTRAINT "exposure_matches_credential_id_credential_assets_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credential_assets"("id") ON DELETE set null ON UPDATE no action;
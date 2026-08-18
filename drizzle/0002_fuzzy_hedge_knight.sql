DROP INDEX "exposure_matches_exposure_protectee_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "exposure_matches_exposure_unique" ON "exposure_matches" USING btree ("exposure_id");
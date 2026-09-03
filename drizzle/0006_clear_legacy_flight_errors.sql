UPDATE "flight_instances"
SET
  "consecutive_source_errors" = 0,
  "last_source_error" = NULL,
  "source_error_code" = NULL
WHERE "provider_status" IS NULL;

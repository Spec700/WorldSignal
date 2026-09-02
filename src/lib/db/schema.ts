import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const operatorStatusEnum = pgEnum("operator_status", [
  "active",
  "inactive",
]);
export const protecteeStatusEnum = pgEnum("protectee_status", [
  "active",
  "paused",
  "archived",
]);
export const protecteeTierEnum = pgEnum("protectee_tier", [
  "standard",
  "high",
  "critical",
]);
export const identityTypeEnum = pgEnum("identity_type", [
  "work_email",
  "personal_email",
  "username",
  "phone",
  "domain",
  "other",
]);
export const locationPrecisionEnum = pgEnum("location_precision", [
  "exact",
  "city",
  "region",
  "country",
]);
export const exposureSourceTypeEnum = pgEnum("exposure_source_type", [
  "breach",
  "infostealer",
  "phishing",
  "combolist",
  "paste",
  "internal_report",
  "other",
]);
export const credentialKindEnum = pgEnum("credential_kind", [
  "password",
  "password_hash",
  "session_token",
  "session_cookie",
  "api_key",
  "other",
]);
export const credentialAssetStatusEnum = pgEnum("credential_asset_status", [
  "active",
  "rotating",
  "revoked",
  "retired",
]);
export const credentialVersionStatusEnum = pgEnum("credential_version_status", [
  "active",
  "superseded",
  "revoked",
]);
export const priorityEnum = pgEnum("priority", [
  "low",
  "medium",
  "high",
  "critical",
]);
export const confidenceEnum = pgEnum("confidence", [
  "low",
  "medium",
  "high",
  "confirmed",
]);
export const exposureVerificationEnum = pgEnum("exposure_verification", [
  "unverified",
  "confirmed",
  "false_positive",
]);
export const exposureStatusEnum = pgEnum("exposure_status", [
  "new",
  "triaged",
  "in_case",
  "remediated",
  "dismissed",
]);
export const matchMethodEnum = pgEnum("match_method", ["exact", "manual"]);
export const caseStatusEnum = pgEnum("case_status", [
  "open",
  "investigating",
  "notifying",
  "remediating",
  "monitoring",
  "closed",
  "dismissed",
]);
export const taskTypeEnum = pgEnum("task_type", [
  "verify",
  "notify",
  "password_reset",
  "revoke_sessions",
  "enable_mfa",
  "check_reuse",
  "investigate_device",
  "other",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "completed",
  "cancelled",
]);
export const communicationChannelEnum = pgEnum("communication_channel", [
  "email",
  "phone",
  "chat",
  "in_person",
  "other",
]);
export const communicationStatusEnum = pgEnum("communication_status", [
  "draft",
  "planned",
  "sent",
  "acknowledged",
  "failed",
]);
export const flightTrackingStatusEnum = pgEnum("flight_tracking_status", [
  "scheduled",
  "match_required",
  "tracking",
  "possible_arrival",
  "completed",
  "cancelled",
]);
export const flightAssignmentStatusEnum = pgEnum("flight_assignment_status", [
  "planned",
  "onboard_confirmed",
  "completed",
  "cancelled",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ...timestamps,
});

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("roles_workspace_slug_unique").on(
      table.workspaceId,
      table.slug,
    ),
  ],
);

export const operators = pgTable(
  "operators",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    status: operatorStatusEnum("status").default("active").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("operators_workspace_email_unique").on(
      table.workspaceId,
      table.email,
    ),
    index("operators_workspace_status_idx").on(table.workspaceId, table.status),
  ],
);

export const operatorRoles = pgTable(
  "operator_roles",
  {
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => operators.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.operatorId, table.roleId] })],
);

export const protectees = pgTable(
  "protectees",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    title: text("title"),
    organization: text("organization"),
    tier: protecteeTierEnum("tier").default("standard").notNull(),
    status: protecteeStatusEnum("status").default("active").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("protectees_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("protectees_workspace_name_idx").on(
      table.workspaceId,
      table.displayName,
    ),
  ],
);

export const protecteeIdentities = pgTable(
  "protectee_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    protecteeId: uuid("protectee_id")
      .notNull()
      .references(() => protectees.id, { onDelete: "cascade" }),
    type: identityTypeEnum("type").notNull(),
    displayValue: text("display_value").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("protectee_identities_workspace_type_value_unique").on(
      table.workspaceId,
      table.type,
      table.normalizedValue,
    ),
    index("protectee_identities_protectee_idx").on(table.protecteeId),
  ],
);

export const protecteeLocations = pgTable(
  "protectee_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    protecteeId: uuid("protectee_id")
      .notNull()
      .references(() => protectees.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    precision: locationPrecisionEnum("precision").default("city").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .defaultNow()
      .notNull(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("protectee_locations_active_idx").on(
      table.protecteeId,
      table.isActive,
    ),
  ],
);

export const flightInstances = pgTable(
  "flight_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    passengerFlightNumber: text("passenger_flight_number").notNull(),
    adsbCallsign: text("adsb_callsign").notNull(),
    originIata: text("origin_iata").notNull(),
    originName: text("origin_name").notNull(),
    originLatitude: doublePrecision("origin_latitude").notNull(),
    originLongitude: doublePrecision("origin_longitude").notNull(),
    destinationIata: text("destination_iata").notNull(),
    destinationName: text("destination_name").notNull(),
    destinationLatitude: doublePrecision("destination_latitude").notNull(),
    destinationLongitude: doublePrecision("destination_longitude").notNull(),
    scheduledDepartureAt: timestamp("scheduled_departure_at", {
      withTimezone: true,
    }).notNull(),
    scheduledArrivalAt: timestamp("scheduled_arrival_at", {
      withTimezone: true,
    }),
    trackingStatus: flightTrackingStatusEnum("tracking_status")
      .default("scheduled")
      .notNull(),
    aircraftIcaoHex: text("aircraft_icao_hex"),
    aircraftRegistration: text("aircraft_registration"),
    aircraftType: text("aircraft_type"),
    aircraftConfirmedByOperatorId: uuid(
      "aircraft_confirmed_by_operator_id",
    ).references(() => operators.id, { onDelete: "set null" }),
    aircraftConfirmedAt: timestamp("aircraft_confirmed_at", {
      withTimezone: true,
    }),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    lastSuccessfulPollAt: timestamp("last_successful_poll_at", {
      withTimezone: true,
    }),
    lastSourceError: text("last_source_error"),
    notes: text("notes"),
    createdByOperatorId: uuid("created_by_operator_id").references(
      () => operators.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("flight_instances_workspace_flight_departure_unique").on(
      table.workspaceId,
      table.passengerFlightNumber,
      table.scheduledDepartureAt,
      table.originIata,
      table.destinationIata,
    ),
    index("flight_instances_workspace_status_departure_idx").on(
      table.workspaceId,
      table.trackingStatus,
      table.scheduledDepartureAt,
    ),
    index("flight_instances_aircraft_idx").on(table.aircraftIcaoHex),
    check(
      "flight_instances_origin_latitude_bounds",
      sql`${table.originLatitude} between -90 and 90`,
    ),
    check(
      "flight_instances_origin_longitude_bounds",
      sql`${table.originLongitude} between -180 and 180`,
    ),
    check(
      "flight_instances_destination_latitude_bounds",
      sql`${table.destinationLatitude} between -90 and 90`,
    ),
    check(
      "flight_instances_destination_longitude_bounds",
      sql`${table.destinationLongitude} between -180 and 180`,
    ),
    check(
      "flight_instances_distinct_airports",
      sql`${table.originIata} <> ${table.destinationIata}`,
    ),
    check(
      "flight_instances_arrival_after_departure",
      sql`${table.scheduledArrivalAt} is null or ${table.scheduledArrivalAt} > ${table.scheduledDepartureAt}`,
    ),
  ],
);

export const flightAssignments = pgTable(
  "flight_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    flightInstanceId: uuid("flight_instance_id")
      .notNull()
      .references(() => flightInstances.id, { onDelete: "cascade" }),
    protecteeId: uuid("protectee_id")
      .notNull()
      .references(() => protectees.id, { onDelete: "restrict" }),
    status: flightAssignmentStatusEnum("status").default("planned").notNull(),
    assignedByOperatorId: uuid("assigned_by_operator_id").references(
      () => operators.id,
      { onDelete: "set null" },
    ),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    onboardConfirmedByOperatorId: uuid(
      "onboard_confirmed_by_operator_id",
    ).references(() => operators.id, { onDelete: "set null" }),
    onboardConfirmedAt: timestamp("onboard_confirmed_at", {
      withTimezone: true,
    }),
    completedByOperatorId: uuid("completed_by_operator_id").references(
      () => operators.id,
      { onDelete: "set null" },
    ),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("flight_assignments_flight_person_unique").on(
      table.flightInstanceId,
      table.protecteeId,
    ),
    uniqueIndex("flight_assignments_one_active_travel_per_person_unique")
      .on(table.protecteeId)
      .where(sql`${table.status} = 'onboard_confirmed'`),
    index("flight_assignments_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("flight_assignments_person_idx").on(table.protecteeId),
  ],
);

export const flightObservations = pgTable(
  "flight_observations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flightInstanceId: uuid("flight_instance_id")
      .notNull()
      .references(() => flightInstances.id, { onDelete: "cascade" }),
    source: text("source").default("adsb.lol").notNull(),
    aircraftIcaoHex: text("aircraft_icao_hex").notNull(),
    callsign: text("callsign"),
    registration: text("registration"),
    aircraftType: text("aircraft_type"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    barometricAltitudeFeet: doublePrecision("barometric_altitude_feet"),
    geometricAltitudeFeet: doublePrecision("geometric_altitude_feet"),
    groundSpeedKnots: doublePrecision("ground_speed_knots"),
    trackDegrees: doublePrecision("track_degrees"),
    verticalRateFeetPerMinute: doublePrecision("vertical_rate_feet_per_minute"),
    squawk: text("squawk"),
    onGround: boolean("on_ground").default(false).notNull(),
    sourceObservedAt: timestamp("source_observed_at", {
      withTimezone: true,
    }).notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("flight_observations_flight_observed_idx").on(
      table.flightInstanceId,
      table.sourceObservedAt,
    ),
    index("flight_observations_aircraft_observed_idx").on(
      table.aircraftIcaoHex,
      table.sourceObservedAt,
    ),
    check(
      "flight_observations_latitude_bounds",
      sql`${table.latitude} is null or ${table.latitude} between -90 and 90`,
    ),
    check(
      "flight_observations_longitude_bounds",
      sql`${table.longitude} is null or ${table.longitude} between -180 and 180`,
    ),
  ],
);

export const credentialAssets = pgTable(
  "credential_assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    protecteeId: uuid("protectee_id")
      .notNull()
      .references(() => protectees.id, { onDelete: "cascade" }),
    identityId: uuid("identity_id").references(() => protecteeIdentities.id, {
      onDelete: "set null",
    }),
    accountIdentifier: text("account_identifier").notNull(),
    service: text("service").notNull(),
    serviceDomain: text("service_domain"),
    credentialKind: credentialKindEnum("credential_kind").notNull(),
    status: credentialAssetStatusEnum("status").default("active").notNull(),
    notes: text("notes"),
    createdByOperatorId: uuid("created_by_operator_id").references(
      () => operators.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("credential_assets_workspace_owner_service_unique").on(
      table.workspaceId,
      table.protecteeId,
      table.accountIdentifier,
      table.service,
      table.credentialKind,
    ),
    index("credential_assets_workspace_status_idx").on(
      table.workspaceId,
      table.status,
    ),
    index("credential_assets_protectee_idx").on(table.protecteeId),
    check(
      "credential_assets_managed_kind",
      sql`${table.credentialKind} <> 'password_hash'`,
    ),
  ],
);

export const credentialVersions = pgTable(
  "credential_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    credentialId: uuid("credential_id")
      .notNull()
      .references(() => credentialAssets.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    credentialCiphertext: text("credential_ciphertext").notNull(),
    credentialIv: text("credential_iv").notNull(),
    credentialAuthTag: text("credential_auth_tag").notNull(),
    credentialKeyVersion: text("credential_key_version").notNull(),
    credentialFingerprint: text("credential_fingerprint").notNull(),
    credentialLength: integer("credential_length").notNull(),
    status: credentialVersionStatusEnum("status").default("active").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    createdByOperatorId: uuid("created_by_operator_id").references(
      () => operators.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("credential_versions_credential_version_unique").on(
      table.credentialId,
      table.version,
    ),
    uniqueIndex("credential_versions_one_active_unique")
      .on(table.credentialId)
      .where(sql`${table.status} = 'active'`),
    index("credential_versions_credential_status_idx").on(
      table.credentialId,
      table.status,
    ),
    check("credential_versions_version_positive", sql`${table.version} > 0`),
    check(
      "credential_versions_length_positive",
      sql`${table.credentialLength} > 0`,
    ),
  ],
);

export const exposureSources = pgTable(
  "exposure_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    type: exposureSourceTypeEnum("type").notNull(),
    name: text("name").notNull(),
    referenceUrl: text("reference_url"),
    sourceRecordId: text("source_record_id"),
    breachOccurredAt: timestamp("breach_occurred_at", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    confidence: confidenceEnum("confidence").default("medium").notNull(),
    notes: text("notes"),
    createdByOperatorId: uuid("created_by_operator_id").references(
      () => operators.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    index("exposure_sources_workspace_observed_idx").on(
      table.workspaceId,
      table.observedAt,
    ),
  ],
);

export const credentialExposures = pgTable(
  "credential_exposures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => exposureSources.id, { onDelete: "restrict" }),
    exposedIdentityType: identityTypeEnum("exposed_identity_type").notNull(),
    exposedIdentityDisplay: text("exposed_identity_display").notNull(),
    exposedIdentityNormalized: text("exposed_identity_normalized").notNull(),
    service: text("service"),
    serviceDomain: text("service_domain"),
    credentialKind: credentialKindEnum("credential_kind").notNull(),
    credentialCiphertext: text("credential_ciphertext"),
    credentialIv: text("credential_iv"),
    credentialAuthTag: text("credential_auth_tag"),
    credentialKeyVersion: text("credential_key_version"),
    credentialFingerprint: text("credential_fingerprint"),
    credentialLength: integer("credential_length"),
    dedupeKey: text("dedupe_key").notNull(),
    exposedAt: timestamp("exposed_at", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    severity: priorityEnum("severity").notNull(),
    confidence: confidenceEnum("confidence").default("medium").notNull(),
    verification: exposureVerificationEnum("verification")
      .default("unverified")
      .notNull(),
    status: exposureStatusEnum("status").default("new").notNull(),
    notes: text("notes"),
    createdByOperatorId: uuid("created_by_operator_id").references(
      () => operators.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("credential_exposures_workspace_dedupe_unique").on(
      table.workspaceId,
      table.dedupeKey,
    ),
    index("credential_exposures_workspace_status_priority_idx").on(
      table.workspaceId,
      table.status,
      table.severity,
    ),
    index("credential_exposures_identity_idx").on(
      table.workspaceId,
      table.exposedIdentityNormalized,
    ),
    check(
      "credential_exposures_length_nonnegative",
      sql`${table.credentialLength} is null or ${table.credentialLength} >= 0`,
    ),
  ],
);

export const exposureMatches = pgTable(
  "exposure_matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    exposureId: uuid("exposure_id")
      .notNull()
      .references(() => credentialExposures.id, { onDelete: "cascade" }),
    protecteeId: uuid("protectee_id")
      .notNull()
      .references(() => protectees.id, { onDelete: "cascade" }),
    identityId: uuid("identity_id").references(() => protecteeIdentities.id, {
      onDelete: "set null",
    }),
    credentialId: uuid("credential_id").references(() => credentialAssets.id, {
      onDelete: "set null",
    }),
    method: matchMethodEnum("method").notNull(),
    confidence: confidenceEnum("confidence").notNull(),
    confirmedByOperatorId: uuid("confirmed_by_operator_id").references(
      () => operators.id,
      { onDelete: "set null" },
    ),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("exposure_matches_exposure_unique").on(table.exposureId),
    index("exposure_matches_protectee_idx").on(table.protecteeId),
  ],
);

export const responseCases = pgTable(
  "response_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    protecteeId: uuid("protectee_id")
      .notNull()
      .references(() => protectees.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    status: caseStatusEnum("status").default("open").notNull(),
    priority: priorityEnum("priority").notNull(),
    assigneeOperatorId: uuid("assignee_operator_id").references(
      () => operators.id,
      { onDelete: "set null" },
    ),
    dueAt: timestamp("due_at", { withTimezone: true }),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    resolution: text("resolution"),
    ...timestamps,
  },
  (table) => [
    index("response_cases_workspace_status_priority_idx").on(
      table.workspaceId,
      table.status,
      table.priority,
    ),
    index("response_cases_protectee_idx").on(table.protecteeId),
  ],
);

export const caseExposures = pgTable(
  "case_exposures",
  {
    caseId: uuid("case_id")
      .notNull()
      .references(() => responseCases.id, { onDelete: "cascade" }),
    exposureId: uuid("exposure_id")
      .notNull()
      .references(() => credentialExposures.id, { onDelete: "restrict" }),
    attachedAt: timestamp("attached_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    attachedByOperatorId: uuid("attached_by_operator_id").references(
      () => operators.id,
      { onDelete: "set null" },
    ),
  },
  (table) => [primaryKey({ columns: [table.caseId, table.exposureId] })],
);

export const caseTasks = pgTable(
  "case_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => responseCases.id, { onDelete: "cascade" }),
    type: taskTypeEnum("type").notNull(),
    title: text("title").notNull(),
    status: taskStatusEnum("status").default("todo").notNull(),
    assigneeOperatorId: uuid("assignee_operator_id").references(
      () => operators.id,
      { onDelete: "set null" },
    ),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("case_tasks_case_status_idx").on(table.caseId, table.status),
  ],
);

export const communications = pgTable(
  "communications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => responseCases.id, { onDelete: "cascade" }),
    channel: communicationChannelEnum("channel").notNull(),
    status: communicationStatusEnum("status").default("draft").notNull(),
    recipientLabel: text("recipient_label").notNull(),
    subject: text("subject"),
    body: text("body"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdByOperatorId: uuid("created_by_operator_id").references(
      () => operators.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    index("communications_case_status_idx").on(table.caseId, table.status),
  ],
);

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    actorOperatorId: uuid("actor_operator_id").references(() => operators.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("activity_log_workspace_occurred_idx").on(
      table.workspaceId,
      table.occurredAt,
    ),
    index("activity_log_entity_idx").on(table.entityType, table.entityId),
  ],
);

export type Workspace = typeof workspaces.$inferSelect;
export type Operator = typeof operators.$inferSelect;
export type Protectee = typeof protectees.$inferSelect;
export type ProtecteeIdentity = typeof protecteeIdentities.$inferSelect;
export type ProtecteeLocation = typeof protecteeLocations.$inferSelect;
export type FlightInstance = typeof flightInstances.$inferSelect;
export type FlightAssignment = typeof flightAssignments.$inferSelect;
export type FlightObservation = typeof flightObservations.$inferSelect;
export type CredentialAsset = typeof credentialAssets.$inferSelect;
export type CredentialVersion = typeof credentialVersions.$inferSelect;
export type CredentialExposure = typeof credentialExposures.$inferSelect;
export type ResponseCase = typeof responseCases.$inferSelect;

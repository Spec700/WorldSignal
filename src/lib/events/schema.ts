import type { Geometry } from "geojson";
import { z } from "zod";

const utcTimestampSchema = z
  .string()
  .datetime({ offset: false, precision: 3 })
  .refine((value) => value.endsWith("Z"), "Timestamp must be UTC");

const longitudeSchema = z.number().finite().min(-180).max(180);
const latitudeSchema = z.number().finite().min(-90).max(90);

const positionSchema = z
  .tuple([longitudeSchema, latitudeSchema])
  .rest(z.number().finite());

const lineStringCoordinatesSchema = z.array(positionSchema).min(2);

const linearRingSchema = z
  .array(positionSchema)
  .min(4)
  .refine((ring) => {
    const first = ring[0];
    const last = ring.at(-1);

    return first?.[0] === last?.[0] && first?.[1] === last?.[1];
  }, "A polygon ring must be closed");

export const geometrySchema: z.ZodType<Geometry> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("Point"), coordinates: positionSchema }),
    z.object({
      type: z.literal("MultiPoint"),
      coordinates: z.array(positionSchema),
    }),
    z.object({
      type: z.literal("LineString"),
      coordinates: lineStringCoordinatesSchema,
    }),
    z.object({
      type: z.literal("MultiLineString"),
      coordinates: z.array(lineStringCoordinatesSchema),
    }),
    z.object({
      type: z.literal("Polygon"),
      coordinates: z.array(linearRingSchema).min(1),
    }),
    z.object({
      type: z.literal("MultiPolygon"),
      coordinates: z.array(z.array(linearRingSchema).min(1)),
    }),
    z.object({
      type: z.literal("GeometryCollection"),
      geometries: z.array(geometrySchema),
    }),
  ]),
);

export const moduleIdSchema = z.enum(["natural-hazards", "incident-signals"]);

export const eventCategorySchema = z.enum([
  "earthquake",
  "tropical-cyclone",
  "flood",
  "drought",
  "tornado",
  "volcano",
  "wildfire",
  "mass-attack",
  "bombing",
  "hostage-event",
  "terrorism",
  "major-violent-incident",
  "unknown",
]);

export const eventLifecycleSchema = z.enum([
  "ongoing",
  "occurred",
  "ended",
  "unknown",
]);

export const displayPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const verificationStatusSchema = z.enum([
  "authoritative-source",
  "multi-source-signal",
  "single-source-signal",
  "machine-detected",
]);

export const sourceIdSchema = z.enum(["usgs", "gdacs", "spc", "gdelt"]);

export const sourceReferenceSchema = z.object({
  source: sourceIdSchema,
  sourceEventId: z.string().trim().min(1),
  label: z.string().trim().min(1),
  url: z.url().refine((value) => value.startsWith("https://"), {
    message: "Source URLs must use HTTPS",
  }),
  retrievedAt: utcTimestampSchema,
  sourceUpdatedAt: utcTimestampSchema.optional(),
});

export const nativeSeveritySchema = z.object({
  label: z.string().trim().min(1),
  value: z.number().finite().optional(),
  unit: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).optional(),
});

export const eventFactSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  value: z.union([z.string(), z.number().finite(), z.boolean()]),
  unit: z.string().trim().min(1).optional(),
});

export const worldEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().trim().min(1),
    module: moduleIdSchema,
    category: eventCategorySchema,
    subtype: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1),
    summary: z.string().trim().min(1).optional(),
    locationLabel: z.string().trim().min(1),
    countryCodes: z.array(z.string().trim().toUpperCase().min(2).max(3)),
    lifecycle: eventLifecycleSchema,
    occurredAt: utcTimestampSchema.optional(),
    startAt: utcTimestampSchema.optional(),
    updatedAt: utcTimestampSchema,
    endedAt: utcTimestampSchema.optional(),
    centroid: z.object({
      latitude: latitudeSchema,
      longitude: longitudeSchema,
    }),
    geometry: geometrySchema,
    geometryDetailAvailable: z.boolean(),
    displayPriority: displayPrioritySchema,
    priorityBasis: z.string().trim().min(1),
    nativeSeverity: nativeSeveritySchema,
    verification: verificationStatusSchema,
    facts: z.array(eventFactSchema),
    sources: z.array(sourceReferenceSchema).min(1),
    revisionFingerprint: z.string().trim().min(1),
  })
  .superRefine((event, context) => {
    if (
      event.module === "natural-hazards" &&
      event.verification !== "authoritative-source"
    ) {
      context.addIssue({
        code: "custom",
        path: ["verification"],
        message:
          "Natural-hazard events must use authoritative-source verification",
      });
    }

    if (event.lifecycle === "occurred" && !event.occurredAt) {
      context.addIssue({
        code: "custom",
        path: ["occurredAt"],
        message: "Occurred events require an occurrence timestamp",
      });
    }

    if (
      (event.lifecycle === "ongoing" || event.lifecycle === "ended") &&
      !event.startAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["startAt"],
        message: "Duration events require a start timestamp",
      });
    }

    if (event.lifecycle === "ended" && !event.endedAt) {
      context.addIssue({
        code: "custom",
        path: ["endedAt"],
        message: "Ended events require an end timestamp",
      });
    }
  });

export const sourceHealthSchema = z
  .object({
    source: sourceIdSchema,
    state: z.enum(["ok", "error"]),
    attemptedAt: utcTimestampSchema,
    completedAt: utcTimestampSchema,
    upstreamUpdatedAt: utcTimestampSchema.optional(),
    eventCount: z.number().int().nonnegative().optional(),
    errorCode: z
      .enum(["timeout", "network", "http", "schema", "truncated", "unknown"])
      .optional(),
    safeMessage: z.string().trim().min(1).optional(),
  })
  .superRefine((health, context) => {
    if (health.state === "ok" && health.eventCount === undefined) {
      context.addIssue({
        code: "custom",
        path: ["eventCount"],
        message: "Available sources require an event count",
      });
    }

    if (health.state === "error" && !health.errorCode) {
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "Unavailable sources require an error code",
      });
    }
  });

export const eventBatchSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: utcTimestampSchema,
    requestedRange: z.object({
      from: utcTimestampSchema,
      to: utcTimestampSchema,
    }),
    events: z.array(worldEventSchema),
    sources: z.array(sourceHealthSchema).min(1),
  })
  .superRefine((batch, context) => {
    if (
      new Date(batch.requestedRange.from) > new Date(batch.requestedRange.to)
    ) {
      context.addIssue({
        code: "custom",
        path: ["requestedRange"],
        message: "Requested range start must not follow its end",
      });
    }

    const eventIds = new Set<string>();
    for (const [index, event] of batch.events.entries()) {
      if (eventIds.has(event.id)) {
        context.addIssue({
          code: "custom",
          path: ["events", index, "id"],
          message: "Event IDs must be unique within a batch",
        });
      }
      eventIds.add(event.id);
    }

    const sourceIds = new Set<string>();
    for (const [index, source] of batch.sources.entries()) {
      if (sourceIds.has(source.source)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "source"],
          message: "Source health entries must be unique within a batch",
        });
      }
      sourceIds.add(source.source);
    }
  });

export const hazardWindowSchema = z.enum(["24h", "7d", "30d"]);

export type ModuleId = z.infer<typeof moduleIdSchema>;
export type EventCategory = z.infer<typeof eventCategorySchema>;
export type EventLifecycle = z.infer<typeof eventLifecycleSchema>;
export type DisplayPriority = z.infer<typeof displayPrioritySchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type SourceId = z.infer<typeof sourceIdSchema>;
export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export type NativeSeverity = z.infer<typeof nativeSeveritySchema>;
export type EventFact = z.infer<typeof eventFactSchema>;
export type WorldEvent = z.infer<typeof worldEventSchema>;
export type SourceHealth = z.infer<typeof sourceHealthSchema>;
export type EventBatch = z.infer<typeof eventBatchSchema>;
export type HazardWindow = z.infer<typeof hazardWindowSchema>;

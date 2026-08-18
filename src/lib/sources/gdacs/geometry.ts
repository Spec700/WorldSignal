import { z } from "zod";

import { geometrySchema } from "@/lib/events/schema";
import { SourceFetchError } from "@/lib/sources/errors";
import { fetchJson, type FetchImplementation } from "@/lib/sources/fetch-json";

import type { GdacsEventType } from "./schema";
import { getGdacsGeometryUrl } from "./urls";

const GDACS_GEOMETRY_TIMEOUT_MS = 12_000;
const GDACS_GEOMETRY_MAX_BYTES = 8 * 1_024 * 1_024;

const rawGeometryFeatureSchema = z.object({
  type: z.literal("Feature"),
  geometry: geometrySchema,
  properties: z.record(z.string(), z.unknown()).nullable(),
});

const rawGeometryCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(rawGeometryFeatureSchema),
});

export const gdacsGeometryCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      geometry: geometrySchema,
      properties: z.object({
        semanticClass: z.string().optional(),
        label: z.string().optional(),
        featureType: z.string().optional(),
        observedAt: z.string().optional(),
      }),
    }),
  ),
});

function optionalString(
  properties: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const value = properties?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function fetchGdacsGeometry(
  input: {
    eventType: GdacsEventType;
    eventId: number;
    episodeId: number;
    signal: AbortSignal;
  },
  fetchImplementation?: FetchImplementation,
) {
  const raw = await fetchJson(getGdacsGeometryUrl(input), {
    signal: input.signal,
    timeoutMs: GDACS_GEOMETRY_TIMEOUT_MS,
    maxBytes: GDACS_GEOMETRY_MAX_BYTES,
    sourceLabel: "GDACS geometry",
    fetchImplementation,
  });
  const parsed = rawGeometryCollectionSchema.safeParse(raw);

  if (!parsed.success) {
    throw new SourceFetchError(
      "schema",
      "GDACS returned geometry that does not match the expected GeoJSON schema.",
      { cause: parsed.error },
    );
  }

  return gdacsGeometryCollectionSchema.parse({
    type: "FeatureCollection",
    features: parsed.data.features.map((feature) => ({
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        ...(optionalString(feature.properties, "Class")
          ? { semanticClass: optionalString(feature.properties, "Class") }
          : {}),
        ...(optionalString(feature.properties, "polygonlabel")
          ? { label: optionalString(feature.properties, "polygonlabel") }
          : {}),
        ...(optionalString(feature.properties, "featuretype")
          ? { featureType: optionalString(feature.properties, "featuretype") }
          : {}),
        ...(optionalString(feature.properties, "polygondate")
          ? { observedAt: optionalString(feature.properties, "polygondate") }
          : {}),
      },
    })),
  });
}

export type GdacsGeometryCollection = z.infer<
  typeof gdacsGeometryCollectionSchema
>;

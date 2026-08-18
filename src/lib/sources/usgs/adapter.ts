import type {
  DisplayPriority,
  EventFact,
  WorldEvent,
} from "@/lib/events/types";
import { worldEventSchema } from "@/lib/events/schema";
import type { EventSourceAdapter } from "@/lib/sources/adapter";
import { SourceFetchError } from "@/lib/sources/errors";
import { fetchJson, type FetchImplementation } from "@/lib/sources/fetch-json";
import { createRevisionFingerprint } from "@/lib/sources/fingerprint";

import { usgsFeedSchema, type UsgsAlert, type UsgsFeature } from "./schema";
import { getUsgsFeedUrl } from "./urls";

const USGS_TIMEOUT_MS = 10_000;
const USGS_MAX_RESPONSE_BYTES = 8 * 1_024 * 1_024;

const PAGER_PRIORITY: Record<UsgsAlert, DisplayPriority> = {
  green: "low",
  yellow: "medium",
  orange: "high",
  red: "critical",
};

export function getUsgsPriority(magnitude: number, alert: UsgsAlert | null) {
  if (alert) {
    return {
      displayPriority: PAGER_PRIORITY[alert],
      priorityBasis: "USGS PAGER impact alert",
    } as const;
  }

  if (magnitude >= 7) {
    return {
      displayPriority: "critical",
      priorityBasis: "Derived from earthquake magnitude (M7.0+)",
    } as const;
  }

  if (magnitude >= 6) {
    return {
      displayPriority: "high",
      priorityBasis: "Derived from earthquake magnitude (M6.0–6.9)",
    } as const;
  }

  if (magnitude >= 5) {
    return {
      displayPriority: "medium",
      priorityBasis: "Derived from earthquake magnitude (M5.0–5.9)",
    } as const;
  }

  return {
    displayPriority: "low",
    priorityBasis: "Derived from earthquake magnitude (M4.5–4.9)",
  } as const;
}

function formatMagnitude(magnitude: number): string {
  return Number.isInteger(magnitude) ? magnitude.toFixed(1) : String(magnitude);
}

function getFacts(feature: UsgsFeature): EventFact[] {
  const [longitude, latitude, depth] = feature.geometry.coordinates;
  const facts: EventFact[] = [
    {
      key: "magnitude-type",
      label: "Magnitude type",
      value: feature.properties.magType ?? "Unknown",
    },
    { key: "depth", label: "Depth", value: depth, unit: "km" },
    {
      key: "review-status",
      label: "Review status",
      value: feature.properties.status,
    },
    {
      key: "significance",
      label: "USGS significance",
      value: feature.properties.sig,
    },
    {
      key: "tsunami-flag",
      label: "Tsunami flag",
      value: feature.properties.tsunami === 1,
    },
    {
      key: "coordinates",
      label: "Coordinates",
      value: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    },
  ];

  if (feature.properties.felt !== null) {
    facts.push({
      key: "felt-reports",
      label: "Felt reports",
      value: feature.properties.felt,
    });
  }
  if (feature.properties.cdi !== null) {
    facts.push({
      key: "community-intensity",
      label: "Community intensity",
      value: feature.properties.cdi,
    });
  }
  if (feature.properties.mmi !== null) {
    facts.push({
      key: "instrumental-intensity",
      label: "Instrumental intensity",
      value: feature.properties.mmi,
    });
  }
  if (feature.properties.alert) {
    facts.push({
      key: "pager-alert",
      label: "PAGER alert",
      value: feature.properties.alert,
    });
  }

  return facts;
}

export function normalizeUsgsFeature(
  feature: UsgsFeature,
  retrievedAt: string,
): WorldEvent {
  const [longitude, latitude] = feature.geometry.coordinates;
  const occurredAt = new Date(feature.properties.time).toISOString();
  const updatedAt = new Date(feature.properties.updated).toISOString();
  const magnitudeLabel = formatMagnitude(feature.properties.mag);
  const priority = getUsgsPriority(
    feature.properties.mag,
    feature.properties.alert,
  );

  return worldEventSchema.parse({
    schemaVersion: 1,
    id: `usgs:${feature.id}`,
    module: "natural-hazards",
    category: "earthquake",
    subtype: feature.properties.type,
    title: `M${magnitudeLabel} earthquake — ${feature.properties.place}`,
    locationLabel: feature.properties.place,
    countryCodes: [],
    lifecycle: "occurred",
    occurredAt,
    updatedAt,
    centroid: { latitude, longitude },
    geometry: {
      type: "Point",
      coordinates: [longitude, latitude],
    },
    geometryDetailAvailable: false,
    ...priority,
    nativeSeverity: {
      label: `Magnitude ${magnitudeLabel}`,
      value: feature.properties.mag,
      unit: feature.properties.magType ?? undefined,
    },
    verification: "authoritative-source",
    facts: getFacts(feature),
    sources: [
      {
        source: "usgs",
        sourceEventId: feature.id,
        label: "U.S. Geological Survey",
        url: feature.properties.url,
        retrievedAt,
        sourceUpdatedAt: updatedAt,
      },
    ],
    revisionFingerprint: createRevisionFingerprint({
      id: feature.id,
      updated: feature.properties.updated,
      magnitude: feature.properties.mag,
      alert: feature.properties.alert,
      status: feature.properties.status,
      coordinates: feature.geometry.coordinates,
      tsunami: feature.properties.tsunami,
    }),
  });
}

interface UsgsAdapterOptions {
  fetchImplementation?: FetchImplementation;
  now?: () => Date;
}

export class UsgsAdapter implements EventSourceAdapter {
  readonly source = "usgs" as const;
  private readonly fetchImplementation?: FetchImplementation;
  private readonly now: () => Date;

  constructor(options: UsgsAdapterOptions = {}) {
    this.fetchImplementation = options.fetchImplementation;
    this.now = options.now ?? (() => new Date());
  }

  async fetchAndNormalize({
    from,
    to,
    signal,
  }: Parameters<EventSourceAdapter["fetchAndNormalize"]>[0]) {
    const raw = await fetchJson(getUsgsFeedUrl(from, to), {
      signal,
      timeoutMs: USGS_TIMEOUT_MS,
      maxBytes: USGS_MAX_RESPONSE_BYTES,
      sourceLabel: "USGS",
      fetchImplementation: this.fetchImplementation,
    });
    const parsed = usgsFeedSchema.safeParse(raw);

    if (!parsed.success) {
      throw new SourceFetchError(
        "schema",
        "USGS returned data that does not match the expected feed schema.",
        { cause: parsed.error },
      );
    }

    const retrievedAt = this.now().toISOString();

    return {
      events: parsed.data.features.map((feature) =>
        normalizeUsgsFeature(feature, retrievedAt),
      ),
      upstreamUpdatedAt: new Date(parsed.data.metadata.generated).toISOString(),
    };
  }
}

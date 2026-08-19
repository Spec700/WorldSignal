import { worldEventSchema } from "@/lib/events/schema";
import type {
  DisplayPriority,
  EventCategory,
  EventFact,
  EventLifecycle,
  WorldEvent,
} from "@/lib/events/types";
import type { EventSourceAdapter } from "@/lib/sources/adapter";
import { asSourceFetchError, SourceFetchError } from "@/lib/sources/errors";
import { fetchJson, type FetchImplementation } from "@/lib/sources/fetch-json";
import { createRevisionFingerprint } from "@/lib/sources/fingerprint";
import {
  retryTransientSourceRequest,
  type RetrySleep,
} from "@/lib/sources/retry";

import {
  gdacsSearchResponseSchema,
  type GdacsAlertLevel,
  type GdacsEventType,
  type GdacsFeature,
} from "./schema";
import { getGdacsSearchUrl } from "./urls";

const GDACS_TIMEOUT_MS = 20_000;
const GDACS_MAX_PAGE_BYTES = 2 * 1_024 * 1_024;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 50;
const GDACS_MAX_ATTEMPTS_PER_PAGE = 2;
const GDACS_TOTAL_TIMEOUT_MS = 90_000;

const CATEGORY_BY_EVENT_TYPE: Record<GdacsEventType, EventCategory> = {
  TC: "tropical-cyclone",
  FL: "flood",
  DR: "drought",
  VO: "volcano",
  WF: "wildfire",
};

const PRIORITY_BY_ALERT: Record<GdacsAlertLevel, DisplayPriority> = {
  green: "low",
  orange: "high",
  red: "critical",
};

export function normalizeGdacsTimestamp(value: string): string {
  const withTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
    ? value
    : `${value}Z`;
  return new Date(withTimezone).toISOString();
}

export function getGdacsCategory(eventType: GdacsEventType): EventCategory {
  return CATEGORY_BY_EVENT_TYPE[eventType];
}

export function getGdacsPriority(alertLevel: GdacsAlertLevel) {
  return {
    displayPriority: PRIORITY_BY_ALERT[alertLevel],
    priorityBasis: "GDACS humanitarian-impact alert",
  } as const;
}

function getLifecycle(feature: GdacsFeature): {
  lifecycle: EventLifecycle;
  endedAt?: string;
} {
  if (feature.properties.iscurrent) {
    return { lifecycle: "ongoing" };
  }

  return {
    lifecycle: "ended",
    endedAt: normalizeGdacsTimestamp(feature.properties.todate),
  };
}

function getCountryCodes(feature: GdacsFeature): string[] {
  const codes = feature.properties.affectedcountries.flatMap((country) => {
    if (country.iso2.length === 2) {
      return [country.iso2.toUpperCase()];
    }
    if (country.iso3.length === 3) {
      return [country.iso3.toUpperCase()];
    }
    return [];
  });

  if (codes.length === 0 && feature.properties.iso3.length === 3) {
    codes.push(feature.properties.iso3.toUpperCase());
  }

  return [...new Set(codes)].sort();
}

function getLocationLabel(feature: GdacsFeature): string {
  const country = feature.properties.country.trim();
  if (country) {
    return country;
  }

  const affectedCountries = feature.properties.affectedcountries
    .map((item) => item.countryname)
    .join(", ");

  return affectedCountries || "Location not specified by GDACS";
}

function getFacts(feature: GdacsFeature): EventFact[] {
  const severityUnit = feature.properties.severitydata.severityunit.trim();
  const affectedCountries = feature.properties.affectedcountries
    .map((country) => country.countryname)
    .join(", ");
  const facts: EventFact[] = [
    {
      key: "event-type",
      label: "GDACS event type",
      value: feature.properties.eventtype,
    },
    {
      key: "episode-id",
      label: "Episode",
      value: feature.properties.episodeid,
    },
    {
      key: "alert-score",
      label: "Alert score",
      value: feature.properties.alertscore,
    },
    {
      key: "current",
      label: "Current",
      value: feature.properties.iscurrent,
    },
    {
      key: "source-severity",
      label: "Source severity",
      value: feature.properties.severitydata.severity,
      ...(severityUnit ? { unit: severityUnit } : {}),
    },
  ];

  if (affectedCountries) {
    facts.push({
      key: "affected-countries",
      label: "Affected countries",
      value: affectedCountries,
    });
  }

  const contributingSource = feature.properties.source.trim();
  if (contributingSource) {
    facts.push({
      key: "contributing-source",
      label: "Contributing source",
      value: contributingSource,
    });
  }

  return facts;
}

export function normalizeGdacsFeature(
  feature: GdacsFeature,
  retrievedAt: string,
): WorldEvent {
  const [longitude, latitude] = feature.geometry.coordinates;
  const updatedAt = normalizeGdacsTimestamp(feature.properties.datemodified);
  const startAt = normalizeGdacsTimestamp(feature.properties.fromdate);
  const lifecycle = getLifecycle(feature);
  const severityText = feature.properties.severitydata.severitytext.trim();
  const severityUnit = feature.properties.severitydata.severityunit.trim();
  const description = feature.properties.description.trim();

  return worldEventSchema.parse({
    schemaVersion: 1,
    id: `gdacs:${feature.properties.eventtype}:${feature.properties.eventid}`,
    module: "natural-hazards",
    category: getGdacsCategory(feature.properties.eventtype),
    subtype: feature.properties.eventtype,
    title: feature.properties.name,
    ...(description && description !== feature.properties.name
      ? { summary: description }
      : {}),
    locationLabel: getLocationLabel(feature),
    countryCodes: getCountryCodes(feature),
    ...lifecycle,
    startAt,
    updatedAt,
    centroid: { latitude, longitude },
    geometry: {
      type: "Point",
      coordinates: [longitude, latitude],
    },
    geometryDetailAvailable: true,
    ...getGdacsPriority(feature.properties.alertlevel),
    nativeSeverity: {
      label: severityText || `${feature.properties.alertlevel} alert`,
      value: feature.properties.severitydata.severity,
      ...(severityUnit ? { unit: severityUnit } : {}),
      description: `GDACS ${feature.properties.alertlevel} humanitarian-impact alert`,
    },
    verification: "authoritative-source",
    facts: getFacts(feature),
    sources: [
      {
        source: "gdacs",
        sourceEventId: `${feature.properties.eventtype}:${feature.properties.eventid}`,
        label: "Global Disaster Alert and Coordination System",
        url: feature.properties.url.report,
        retrievedAt,
        sourceUpdatedAt: updatedAt,
      },
    ],
    revisionFingerprint: createRevisionFingerprint({
      eventType: feature.properties.eventtype,
      eventId: feature.properties.eventid,
      episodeId: feature.properties.episodeid,
      modifiedAt: feature.properties.datemodified,
      alertLevel: feature.properties.alertlevel,
      alertScore: feature.properties.alertscore,
      isCurrent: feature.properties.iscurrent,
      severity: feature.properties.severitydata,
      centroid: feature.geometry.coordinates,
      affectedCountries: getCountryCodes(feature),
    }),
  });
}

function featureRevisionSortValue(feature: GdacsFeature): [number, number] {
  return [
    Date.parse(normalizeGdacsTimestamp(feature.properties.datemodified)),
    feature.properties.episodeid,
  ];
}

function isNewerRevision(
  candidate: GdacsFeature,
  current: GdacsFeature,
): boolean {
  const [candidateModified, candidateEpisode] =
    featureRevisionSortValue(candidate);
  const [currentModified, currentEpisode] = featureRevisionSortValue(current);

  return (
    candidateModified > currentModified ||
    (candidateModified === currentModified && candidateEpisode > currentEpisode)
  );
}

export function deduplicateGdacsFeatures(
  features: GdacsFeature[],
): GdacsFeature[] {
  const revisionsById = new Map<string, GdacsFeature>();

  for (const feature of features) {
    const id = `${feature.properties.eventtype}:${feature.properties.eventid}`;
    const current = revisionsById.get(id);

    if (!current || isNewerRevision(feature, current)) {
      revisionsById.set(id, feature);
    }
  }

  return [...revisionsById.values()];
}

interface GdacsAdapterOptions {
  fetchImplementation?: FetchImplementation;
  now?: () => Date;
  pageSize?: number;
  maxPages?: number;
  retrySleep?: RetrySleep;
  totalTimeoutMs?: number;
  clock?: () => number;
}

export class GdacsAdapter implements EventSourceAdapter {
  readonly source = "gdacs" as const;
  private readonly fetchImplementation?: FetchImplementation;
  private readonly now: () => Date;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly retrySleep?: RetrySleep;
  private readonly totalTimeoutMs: number;
  private readonly clock: () => number;

  constructor(options: GdacsAdapterOptions = {}) {
    this.fetchImplementation = options.fetchImplementation;
    this.now = options.now ?? (() => new Date());
    this.pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
    this.maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
    this.retrySleep = options.retrySleep;
    this.totalTimeoutMs = options.totalTimeoutMs ?? GDACS_TOTAL_TIMEOUT_MS;
    this.clock = options.clock ?? Date.now;

    if (
      !Number.isInteger(this.pageSize) ||
      this.pageSize < 1 ||
      this.pageSize > 100
    ) {
      throw new RangeError("GDACS page size must be an integer from 1 to 100");
    }
    if (!Number.isInteger(this.maxPages) || this.maxPages < 1) {
      throw new RangeError("GDACS maximum pages must be a positive integer");
    }
    if (!Number.isFinite(this.totalTimeoutMs) || this.totalTimeoutMs < 1) {
      throw new RangeError("GDACS total timeout must be positive");
    }
  }

  private createNormalizedResult(allFeatures: GdacsFeature[]) {
    const deduplicated = deduplicateGdacsFeatures(allFeatures);
    const retrievedAt = this.now().toISOString();
    const upstreamUpdatedAt = deduplicated
      .map((feature) =>
        normalizeGdacsTimestamp(feature.properties.datemodified),
      )
      .sort()
      .at(-1);

    return {
      events: deduplicated.map((feature) =>
        normalizeGdacsFeature(feature, retrievedAt),
      ),
      ...(upstreamUpdatedAt ? { upstreamUpdatedAt } : {}),
    };
  }

  async fetchAndNormalize({
    from,
    to,
    signal,
  }: Parameters<EventSourceAdapter["fetchAndNormalize"]>[0]) {
    const allFeatures: GdacsFeature[] = [];
    const deadline = this.clock() + this.totalTimeoutMs;

    for (let pageNumber = 1; pageNumber <= this.maxPages; pageNumber += 1) {
      const pageUrl = getGdacsSearchUrl({
        from,
        to,
        pageNumber,
        pageSize: this.pageSize,
      });
      let raw: unknown;

      try {
        raw = await retryTransientSourceRequest(
          () => {
            const remainingMs = Math.floor(deadline - this.clock());
            if (remainingMs < 1) {
              throw new SourceFetchError(
                "timeout",
                "GDACS exceeded the total retrieval time budget.",
              );
            }

            return fetchJson(pageUrl, {
              signal,
              timeoutMs: Math.min(GDACS_TIMEOUT_MS, remainingMs),
              maxBytes: GDACS_MAX_PAGE_BYTES,
              sourceLabel: "GDACS",
              allowNoContent: true,
              fetchImplementation: this.fetchImplementation,
            });
          },
          {
            signal,
            maxAttempts: GDACS_MAX_ATTEMPTS_PER_PAGE,
            ...(this.retrySleep ? { sleep: this.retrySleep } : {}),
          },
        );
      } catch (error) {
        const sourceError = asSourceFetchError(error);
        throw new SourceFetchError(
          sourceError.code,
          `GDACS page ${pageNumber} could not be retrieved. ${sourceError.safeMessage}`,
          { cause: sourceError },
        );
      }

      if (raw === undefined) {
        return this.createNormalizedResult(allFeatures);
      }

      const parsed = gdacsSearchResponseSchema.safeParse(raw);

      if (!parsed.success) {
        throw new SourceFetchError(
          "schema",
          "GDACS returned data that does not match the expected search schema.",
          { cause: parsed.error },
        );
      }

      allFeatures.push(...parsed.data.features);

      if (parsed.data.features.length < this.pageSize) {
        return this.createNormalizedResult(allFeatures);
      }
    }

    throw new SourceFetchError(
      "truncated",
      `GDACS reached the defensive ${this.maxPages}-page limit before pagination completed.`,
    );
  }
}

import { z } from "zod";

import type { WorldEvent } from "@/lib/events/types";
import {
  gdacsGeometryCollectionSchema,
  type GdacsGeometryCollection,
} from "@/lib/sources/gdacs/geometry";
import { gdacsEventTypeSchema } from "@/lib/sources/gdacs/schema";

const geometryErrorResponseSchema = z.object({
  error: z.object({
    message: z.string().trim().min(1),
  }),
});

export interface GdacsGeometryRequest {
  eventType: "TC" | "FL" | "DR" | "VO" | "WF";
  eventId: number;
  episodeId: number;
}

export class GdacsGeometryRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GdacsGeometryRequestError";
  }
}

function positiveInteger(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function getGdacsGeometryRequest(
  event: WorldEvent,
): GdacsGeometryRequest | undefined {
  if (!event.geometryDetailAvailable) {
    return undefined;
  }

  const reference = event.sources.find((source) => source.source === "gdacs");
  if (!reference) {
    return undefined;
  }

  const reportUrl = new URL(reference.url);
  const eventTypeResult = gdacsEventTypeSchema.safeParse(
    reportUrl.searchParams.get("eventtype") ?? event.subtype,
  );
  const eventId = positiveInteger(reportUrl.searchParams.get("eventid"));
  const episodeId = positiveInteger(reportUrl.searchParams.get("episodeid"));

  if (!eventTypeResult.success || !eventId || !episodeId) {
    return undefined;
  }

  return {
    eventType: eventTypeResult.data,
    eventId,
    episodeId,
  };
}

export async function loadGdacsGeometry(
  request: GdacsGeometryRequest,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<GdacsGeometryCollection> {
  const parameters = new URLSearchParams({
    eventType: request.eventType,
    episodeId: String(request.episodeId),
  });
  const response = await fetcher(
    `/api/geometry/gdacs/${request.eventId}?${parameters.toString()}`,
    { cache: "no-store", signal },
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GdacsGeometryRequestError(
      "Detailed geometry returned an unreadable response.",
    );
  }

  if (!response.ok) {
    const errorResult = geometryErrorResponseSchema.safeParse(body);
    throw new GdacsGeometryRequestError(
      errorResult.success
        ? errorResult.data.error.message
        : `Detailed geometry failed with HTTP ${response.status}.`,
    );
  }

  const geometryResult = gdacsGeometryCollectionSchema.safeParse(body);
  if (!geometryResult.success) {
    throw new GdacsGeometryRequestError(
      "WorldSignal rejected invalid detailed geometry.",
    );
  }

  return geometryResult.data;
}

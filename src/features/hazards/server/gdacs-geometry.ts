import { asSourceFetchError } from "@/lib/sources/errors";
import type { FetchImplementation } from "@/lib/sources/fetch-json";
import { fetchGdacsGeometry } from "@/lib/sources/gdacs/geometry";
import { gdacsEventTypeSchema } from "@/lib/sources/gdacs/schema";

interface GeometryRouteContext {
  params: Promise<{ eventId: string }>;
}

interface GeometryDependencies {
  fetchImplementation?: FetchImplementation;
}

function logDevelopmentGeometryError(
  eventType: string,
  eventId: number,
  episodeId: number,
  error: ReturnType<typeof asSourceFetchError>,
) {
  if (process.env.NODE_ENV === "development") {
    console.warn("[WorldSignal] GDACS geometry retrieval failed", {
      eventType,
      eventId,
      episodeId,
      code: error.code,
      message: error.safeMessage,
    });
  }
}

function parseInteger(value: string | null, { allowZero = false } = {}) {
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  const minimum = allowZero ? 0 : 1;
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function handleGdacsGeometryRequest(
  request: Request,
  context: GeometryRouteContext,
  dependencies: GeometryDependencies = {},
): Promise<Response> {
  const { eventId: rawEventId } = await context.params;
  const eventId = parseInteger(rawEventId);
  const url = new URL(request.url);
  const eventTypeResult = gdacsEventTypeSchema.safeParse(
    url.searchParams.get("eventType"),
  );
  const episodeId = parseInteger(url.searchParams.get("episodeId"), {
    allowZero: true,
  });

  if (!eventId || !eventTypeResult.success || episodeId === undefined) {
    return jsonResponse(
      {
        error: {
          code: "invalid_geometry_request",
          message:
            "GDACS geometry requires a supported eventType and numeric eventId and episodeId.",
        },
      },
      400,
    );
  }

  try {
    const geometry = await fetchGdacsGeometry(
      {
        eventType: eventTypeResult.data,
        eventId,
        episodeId,
        signal: request.signal,
      },
      dependencies.fetchImplementation,
    );
    return jsonResponse(geometry);
  } catch (error) {
    const sourceError = asSourceFetchError(error);
    logDevelopmentGeometryError(
      eventTypeResult.data,
      eventId,
      episodeId,
      sourceError,
    );
    return jsonResponse(
      {
        error: {
          code: "geometry_unavailable",
          message: sourceError.safeMessage,
          sourceErrorCode: sourceError.code,
        },
      },
      sourceError.code === "timeout" ? 504 : 502,
    );
  }
}

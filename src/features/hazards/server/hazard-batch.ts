import { eventBatchSchema, hazardWindowSchema } from "@/lib/events/schema";
import type {
  EventBatch,
  HazardWindow,
  SourceHealth,
  WorldEvent,
} from "@/lib/events/types";
import type { EventSourceAdapter } from "@/lib/sources/adapter";
import { asSourceFetchError } from "@/lib/sources/errors";
import { GdacsAdapter } from "@/lib/sources/gdacs/adapter";
import { SpcTornadoAdapter } from "@/lib/sources/spc/adapter";
import { UsgsAdapter } from "@/lib/sources/usgs/adapter";

const WINDOW_MILLISECONDS: Record<HazardWindow, number> = {
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

interface HazardBatchDependencies {
  adapters?: EventSourceAdapter[];
  now?: () => Date;
}

interface SourceAttempt {
  adapter: EventSourceAdapter;
  attemptedAt: string;
}

function logDevelopmentSourceError(
  source: SourceHealth["source"],
  error: ReturnType<typeof asSourceFetchError>,
) {
  if (process.env.NODE_ENV === "development") {
    console.warn("[WorldSignal] Hazard source retrieval failed", {
      source,
      code: error.code,
      message: error.safeMessage,
    });
  }
}

export function deriveHazardRange(window: HazardWindow, to: Date) {
  return {
    from: new Date(to.getTime() - WINDOW_MILLISECONDS[window]),
    to,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function handleHazardBatchRequest(
  request: Request,
  dependencies: HazardBatchDependencies = {},
): Promise<Response> {
  const now = dependencies.now ?? (() => new Date());
  const url = new URL(request.url);
  const windowResult = hazardWindowSchema.safeParse(
    url.searchParams.get("window") ?? "7d",
  );

  if (!windowResult.success) {
    return jsonResponse(
      {
        error: {
          code: "invalid_window",
          message: "Window must be one of 24h, 7d, or 30d.",
        },
      },
      400,
    );
  }

  const requestedRange = deriveHazardRange(windowResult.data, now());
  const adapters = dependencies.adapters ?? [
    new UsgsAdapter({ now }),
    new GdacsAdapter({ now }),
    new SpcTornadoAdapter({ now }),
  ];
  const attempts: SourceAttempt[] = adapters.map((adapter) => ({
    adapter,
    attemptedAt: now().toISOString(),
  }));
  const settled = await Promise.allSettled(
    attempts.map(({ adapter }) =>
      adapter.fetchAndNormalize({
        ...requestedRange,
        signal: request.signal,
      }),
    ),
  );
  const events: WorldEvent[] = [];
  const sources: SourceHealth[] = [];

  for (const [index, result] of settled.entries()) {
    const attempt = attempts[index];
    const completedAt = now().toISOString();

    if (result.status === "fulfilled") {
      events.push(...result.value.events);
      sources.push({
        source: attempt.adapter.source,
        state: "ok",
        attemptedAt: attempt.attemptedAt,
        completedAt,
        ...(result.value.upstreamUpdatedAt
          ? { upstreamUpdatedAt: result.value.upstreamUpdatedAt }
          : {}),
        eventCount: result.value.events.length,
      });
      continue;
    }

    const sourceError = asSourceFetchError(result.reason);
    logDevelopmentSourceError(attempt.adapter.source, sourceError);
    sources.push({
      source: attempt.adapter.source,
      state: "error",
      attemptedAt: attempt.attemptedAt,
      completedAt,
      errorCode: sourceError.code,
      safeMessage: sourceError.safeMessage,
    });
  }

  if (sources.every((source) => source.state === "error")) {
    return jsonResponse(
      {
        error: {
          code: "all_sources_unavailable",
          message:
            "WorldSignal could not retrieve any requested hazard source.",
          sources,
        },
      },
      502,
    );
  }

  const batch: EventBatch = eventBatchSchema.parse({
    schemaVersion: 1,
    generatedAt: now().toISOString(),
    requestedRange: {
      from: requestedRange.from.toISOString(),
      to: requestedRange.to.toISOString(),
    },
    events,
    sources,
  });

  return jsonResponse(batch);
}

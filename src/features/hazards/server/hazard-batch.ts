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

function getCauseSummary(error: unknown) {
  if (!(error instanceof Error)) {
    return undefined;
  }

  return {
    name: error.name,
    message: error.message,
    ...("code" in error && typeof error.code === "string"
      ? { code: error.code }
      : {}),
  };
}

function logSourceError(
  source: SourceHealth["source"],
  error: ReturnType<typeof asSourceFetchError>,
  attemptedAt: string,
  completedAt: string,
) {
  if (process.env.NODE_ENV !== "test") {
    console.warn("[WorldSignal] Hazard source retrieval failed", {
      source,
      code: error.code,
      message: error.safeMessage,
      durationMs: Math.max(
        0,
        Date.parse(completedAt) - Date.parse(attemptedAt),
      ),
      cause: getCauseSummary(error.cause),
    });
  }
}

async function settleSourceAttempt(
  attempt: SourceAttempt,
  requestedRange: ReturnType<typeof deriveHazardRange>,
  signal: AbortSignal,
  now: () => Date,
): Promise<{ events: WorldEvent[]; health: SourceHealth }> {
  try {
    const result = await attempt.adapter.fetchAndNormalize({
      ...requestedRange,
      signal,
    });
    const completedAt = now().toISOString();

    return {
      events: result.events,
      health: {
        source: attempt.adapter.source,
        state: "ok",
        attemptedAt: attempt.attemptedAt,
        completedAt,
        ...(result.upstreamUpdatedAt
          ? { upstreamUpdatedAt: result.upstreamUpdatedAt }
          : {}),
        eventCount: result.events.length,
      },
    };
  } catch (error) {
    const completedAt = now().toISOString();
    const sourceError = asSourceFetchError(error);
    logSourceError(
      attempt.adapter.source,
      sourceError,
      attempt.attemptedAt,
      completedAt,
    );

    return {
      events: [],
      health: {
        source: attempt.adapter.source,
        state: "error",
        attemptedAt: attempt.attemptedAt,
        completedAt,
        errorCode: sourceError.code,
        safeMessage: sourceError.safeMessage,
      },
    };
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
  const settled = await Promise.all(
    attempts.map((attempt) =>
      settleSourceAttempt(attempt, requestedRange, request.signal, now),
    ),
  );
  const events = settled.flatMap((result) => result.events);
  const sources = settled.map((result) => result.health);

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

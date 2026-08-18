import { z } from "zod";

import { eventBatchSchema, sourceHealthSchema } from "@/lib/events/schema";
import type {
  EventBatch,
  HazardWindow,
  SourceHealth,
} from "@/lib/events/types";

const hazardErrorResponseSchema = z.object({
  error: z.object({
    message: z.string().trim().min(1),
    sources: z.array(sourceHealthSchema).optional(),
  }),
});

export class HazardBatchRequestError extends Error {
  readonly sources?: SourceHealth[];

  constructor(message: string, sources?: SourceHealth[]) {
    super(message);
    this.name = "HazardBatchRequestError";
    this.sources = sources;
  }
}

export async function loadHazardBatch(
  window: HazardWindow,
  fetcher: typeof fetch = fetch,
): Promise<EventBatch> {
  const response = await fetcher(
    `/api/events/hazards?window=${encodeURIComponent(window)}`,
    { cache: "no-store" },
  );

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new HazardBatchRequestError(
      "WorldSignal received an unreadable response from the local hazard route.",
    );
  }

  if (!response.ok) {
    const errorResult = hazardErrorResponseSchema.safeParse(body);
    if (errorResult.success) {
      throw new HazardBatchRequestError(
        errorResult.data.error.message,
        errorResult.data.error.sources,
      );
    }

    throw new HazardBatchRequestError(
      `The local hazard route failed with HTTP ${response.status}.`,
    );
  }

  const batchResult = eventBatchSchema.safeParse(body);
  if (!batchResult.success) {
    throw new HazardBatchRequestError(
      "WorldSignal rejected an invalid response from the local hazard route.",
    );
  }

  return batchResult.data;
}

import { describe, expect, it, vi } from "vitest";

import {
  HazardBatchRequestError,
  loadHazardBatch,
} from "@/features/hazards/client/load-hazard-batch";
import { eventBatchFixture } from "../../fixtures/events";

describe("loadHazardBatch", () => {
  it("requests the selected window without caching and validates the batch", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(eventBatchFixture));

    await expect(loadHazardBatch("24h", fetcher)).resolves.toEqual(
      eventBatchFixture,
    );
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api/events/hazards?window=24h", {
      cache: "no-store",
    });
  });

  it("preserves structured source failures from an all-source error", async () => {
    const failedSources = eventBatchFixture.sources.map((source) => ({
      source: source.source,
      state: "error" as const,
      attemptedAt: "2026-08-18T11:00:00.000Z",
      completedAt: "2026-08-18T11:00:02.000Z",
      errorCode: "timeout" as const,
      safeMessage: `${source.source.toUpperCase()} timed out.`,
    }));
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "all_sources_unavailable",
            message: "No hazard source could be retrieved.",
            sources: failedSources,
          },
        },
        { status: 502 },
      ),
    );

    const error = await loadHazardBatch("7d", fetcher).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(HazardBatchRequestError);
    expect(error).toMatchObject({
      message: "No hazard source could be retrieved.",
      sources: failedSources,
    });
  });

  it("rejects a malformed successful payload", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ events: "invalid" }));

    await expect(loadHazardBatch("30d", fetcher)).rejects.toThrow(
      /invalid response/i,
    );
  });
});

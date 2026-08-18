import { describe, expect, it } from "vitest";

import { handleHazardBatchRequest } from "@/features/hazards/server/hazard-batch";
import { eventBatchSchema } from "@/lib/events/schema";
import type { EventSourceAdapter } from "@/lib/sources/adapter";
import { SourceFetchError } from "@/lib/sources/errors";
import { cycloneFixture, earthquakeFixture } from "../fixtures/events";

const fixedNow = () => new Date("2026-08-18T10:00:00.000Z");

function createAdapter(
  source: "usgs" | "gdacs",
  implementation: EventSourceAdapter["fetchAndNormalize"],
): EventSourceAdapter {
  return { source, fetchAndNormalize: implementation };
}

function successAdapter(source: "usgs" | "gdacs"): EventSourceAdapter {
  const event = source === "usgs" ? earthquakeFixture : cycloneFixture;
  return createAdapter(source, async () => ({
    events: [event],
    upstreamUpdatedAt: event.updatedAt,
  }));
}

function failedAdapter(
  source: "usgs" | "gdacs",
  code: "timeout" | "network" | "schema",
): EventSourceAdapter {
  return createAdapter(source, async () => {
    throw new SourceFetchError(
      code,
      `${source.toUpperCase()} fixture failure.`,
    );
  });
}

describe("GET /api/events/hazards", () => {
  it("returns one validated EventBatch when both sources succeed", async () => {
    const response = await handleHazardBatchRequest(
      new Request("http://localhost/api/events/hazards?window=7d"),
      {
        adapters: [successAdapter("usgs"), successAdapter("gdacs")],
        now: fixedNow,
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(eventBatchSchema.safeParse(body).success).toBe(true);
    expect(body.events.map((event: { id: string }) => event.id)).toEqual([
      earthquakeFixture.id,
      cycloneFixture.id,
    ]);
    expect(body.requestedRange).toEqual({
      from: "2026-08-11T10:00:00.000Z",
      to: "2026-08-18T10:00:00.000Z",
    });
  });

  it.each([
    ["usgs", "gdacs"],
    ["gdacs", "usgs"],
  ] as const)(
    "returns successful %s events while making %s failure explicit",
    async (successfulSource, failedSource) => {
      const response = await handleHazardBatchRequest(
        new Request("http://localhost/api/events/hazards"),
        {
          adapters: [
            successAdapter(successfulSource),
            failedAdapter(failedSource, "network"),
          ],
          now: fixedNow,
        },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.events).toHaveLength(1);
      expect(body.sources).toContainEqual(
        expect.objectContaining({
          source: failedSource,
          state: "error",
          errorCode: "network",
        }),
      );
    },
  );

  it("returns a structured 502 when all sources fail", async () => {
    const response = await handleHazardBatchRequest(
      new Request("http://localhost/api/events/hazards"),
      {
        adapters: [
          failedAdapter("usgs", "timeout"),
          failedAdapter("gdacs", "schema"),
        ],
        now: fixedNow,
      },
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe("all_sources_unavailable");
    expect(body.error.sources).toEqual([
      expect.objectContaining({ source: "usgs", errorCode: "timeout" }),
      expect.objectContaining({ source: "gdacs", errorCode: "schema" }),
    ]);
  });

  it("rejects unsupported windows before contacting a source", async () => {
    const response = await handleHazardBatchRequest(
      new Request("http://localhost/api/events/hazards?window=90d"),
      { adapters: [], now: fixedNow },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_window" },
    });
  });
});

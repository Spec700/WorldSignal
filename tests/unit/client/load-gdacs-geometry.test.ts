import { describe, expect, it, vi } from "vitest";

import {
  getGdacsGeometryRequest,
  loadGdacsGeometry,
} from "@/features/hazards/client/load-gdacs-geometry";
import { cycloneFixture, earthquakeFixture } from "../../fixtures/events";
import { gdacsGeometryFixture } from "../../fixtures/gdacs-geometry";

describe("GDACS selected geometry client", () => {
  it("derives fixed route parameters from the validated source report URL", () => {
    expect(getGdacsGeometryRequest(cycloneFixture)).toEqual({
      eventType: "TC",
      eventId: 1001234,
      episodeId: 7,
    });
    expect(getGdacsGeometryRequest(earthquakeFixture)).toBeUndefined();
  });

  it("returns no request when a detail URL is missing required fixed parameters", () => {
    expect(
      getGdacsGeometryRequest({
        ...cycloneFixture,
        sources: [
          {
            ...cycloneFixture.sources[0],
            url: "https://www.gdacs.org/report.aspx?eventid=1001234&eventtype=TC",
          },
        ],
      }),
    ).toBeUndefined();
  });

  it("requests, validates, and returns selection-scoped geometry", async () => {
    const controller = new AbortController();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(gdacsGeometryFixture));

    await expect(
      loadGdacsGeometry(
        { eventType: "TC", eventId: 1001234, episodeId: 7 },
        controller.signal,
        fetcher,
      ),
    ).resolves.toEqual(gdacsGeometryFixture);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/geometry/gdacs/1001234?eventType=TC&episodeId=7",
      { cache: "no-store", signal: controller.signal },
    );
  });

  it("rejects malformed geometry and preserves a safe route error", async () => {
    const controller = new AbortController();
    const malformedFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ type: "FeatureCollection" }));
    const failedFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { message: "GDACS geometry could not be retrieved." } },
          { status: 502 },
        ),
      );

    await expect(
      loadGdacsGeometry(
        { eventType: "TC", eventId: 1001234, episodeId: 7 },
        controller.signal,
        malformedFetcher,
      ),
    ).rejects.toThrow(/invalid detailed geometry/i);
    await expect(
      loadGdacsGeometry(
        { eventType: "TC", eventId: 1001234, episodeId: 7 },
        controller.signal,
        failedFetcher,
      ),
    ).rejects.toThrow("GDACS geometry could not be retrieved.");
  });
});

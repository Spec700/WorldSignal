import { describe, expect, it, vi } from "vitest";

import {
  deduplicateGdacsFeatures,
  GdacsAdapter,
  getGdacsCategory,
  getGdacsPriority,
  normalizeGdacsFeature,
  normalizeGdacsTimestamp,
} from "@/lib/sources/gdacs/adapter";
import { gdacsSearchResponseSchema } from "@/lib/sources/gdacs/schema";
import { getGdacsSearchUrl } from "@/lib/sources/gdacs/urls";
import { createGdacsFeature, gdacsSearchFixture } from "../../fixtures/gdacs";

describe("GDACS URL construction", () => {
  it("uses only fixed source parameters and the requested UTC range", () => {
    const url = getGdacsSearchUrl({
      from: new Date("2026-08-11T10:00:00.000Z"),
      to: new Date("2026-08-18T10:00:00.000Z"),
      pageNumber: 2,
      pageSize: 100,
    });

    expect(url.origin).toBe("https://www.gdacs.org");
    expect(url.searchParams.get("eventlist")).toBe("TC;FL;DR;VO;WF");
    expect(url.searchParams.get("alertlevel")).toBe("green;orange;red");
    expect(url.searchParams.get("pageNumber")).toBe("2");
    expect(url.searchParams.get("caller")).toBe("WorldSignal");
  });
});

describe("GDACS mappings", () => {
  it.each([
    ["TC", "tropical-cyclone"],
    ["FL", "flood"],
    ["DR", "drought"],
    ["VO", "volcano"],
    ["WF", "wildfire"],
  ] as const)("maps %s to %s", (eventType, category) => {
    expect(getGdacsCategory(eventType)).toBe(category);
  });

  it.each([
    ["green", "low"],
    ["orange", "high"],
    ["red", "critical"],
  ] as const)(
    "maps %s alerts to %s without inventing medium",
    (alert, priority) => {
      expect(getGdacsPriority(alert)).toEqual({
        displayPriority: priority,
        priorityBasis: "GDACS humanitarian-impact alert",
      });
    },
  );

  it("interprets timezone-less GDACS timestamps as UTC", () => {
    expect(normalizeGdacsTimestamp("2026-08-18T17:51:19")).toBe(
      "2026-08-18T17:51:19.000Z",
    );
  });
});

describe("GDACS schema and normalization", () => {
  it("accepts sanitized live search data including string booleans", () => {
    const rawFixture = structuredClone(gdacsSearchFixture) as unknown as {
      features: Array<{ properties: { iscurrent: string } }>;
    };
    rawFixture.features[0].properties.iscurrent = "true";

    const result = gdacsSearchResponseSchema.safeParse(rawFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.features[0].properties.iscurrent).toBe(true);
    }
  });

  it("rejects an invalid centroid at the raw boundary", () => {
    const fixture = structuredClone(gdacsSearchFixture);
    fixture.features[0].geometry.coordinates = [20.5, -167.2];

    expect(gdacsSearchResponseSchema.safeParse(fixture).success).toBe(false);
  });

  it("normalizes an ongoing event with source-native severity and geometry evidence", () => {
    const event = normalizeGdacsFeature(
      createGdacsFeature(),
      "2026-08-18T18:02:35.000Z",
    );

    expect(event).toMatchObject({
      id: "gdacs:TC:1001303",
      category: "tropical-cyclone",
      lifecycle: "ongoing",
      startAt: "2026-08-12T15:00:00.000Z",
      updatedAt: "2026-08-18T17:51:19.000Z",
      countryCodes: ["US"],
      geometryDetailAvailable: true,
      nativeSeverity: { value: 157.4064, unit: "km/h" },
    });
  });

  it("maps an explicitly non-current duration event to ended", () => {
    const event = normalizeGdacsFeature(
      createGdacsFeature({ iscurrent: false }),
      "2026-08-18T18:02:35.000Z",
    );

    expect(event.lifecycle).toBe("ended");
    expect(event.endedAt).toBe("2026-08-18T15:00:00.000Z");
  });

  it("keeps retrieval time out of the revision fingerprint", () => {
    const feature = createGdacsFeature();
    const original = normalizeGdacsFeature(feature, "2026-08-18T18:02:35.000Z");
    const retrievedLater = normalizeGdacsFeature(
      feature,
      "2026-08-18T19:02:35.000Z",
    );
    const revised = normalizeGdacsFeature(
      createGdacsFeature({ alertlevel: "orange", episodeid: 26 }),
      "2026-08-18T19:02:35.000Z",
    );

    expect(retrievedLater.revisionFingerprint).toBe(
      original.revisionFingerprint,
    );
    expect(revised.revisionFingerprint).not.toBe(original.revisionFingerprint);
  });
});

describe("GDACS pagination and deduplication", () => {
  it("retains the newest event revision", () => {
    const older = createGdacsFeature({
      episodeid: 24,
      datemodified: "2026-08-18T16:51:19",
    });
    const newer = createGdacsFeature({
      episodeid: 25,
      datemodified: "2026-08-18T17:51:19",
    });

    expect(deduplicateGdacsFeatures([newer, older])).toEqual([newer]);
  });

  it("continues until a short page and deduplicates across pages", async () => {
    const older = createGdacsFeature({
      episodeid: 24,
      datemodified: "2026-08-18T16:51:19",
    });
    const newer = createGdacsFeature({
      episodeid: 25,
      datemodified: "2026-08-18T17:51:19",
    });
    const flood = createGdacsFeature({
      eventtype: "FL",
      eventid: 1_104_099,
      episodeid: 1,
      name: "Flood in Mexico",
      country: "Mexico",
      iso3: "MEX",
      affectedcountries: [{ iso2: "MX", iso3: "MEX", countryname: "Mexico" }],
    });
    const fire = createGdacsFeature({
      eventtype: "WF",
      eventid: 1_030_137,
      name: "Forest fires in Russian Federation",
    });
    const pages = [[older, flood], [newer, fire], []];
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const pageNumber = Number(url.searchParams.get("pageNumber"));
      return Response.json(
        { type: "FeatureCollection", features: pages[pageNumber - 1] },
        { headers: { "content-type": "application/json" } },
      );
    });
    const adapter = new GdacsAdapter({
      fetchImplementation,
      pageSize: 2,
      maxPages: 5,
      now: () => new Date("2026-08-18T18:02:35.000Z"),
    });

    const result = await adapter.fetchAndNormalize({
      from: new Date("2026-08-11T18:02:35.000Z"),
      to: new Date("2026-08-18T18:02:35.000Z"),
      signal: new AbortController().signal,
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(result.events.map((event) => event.id).sort()).toEqual([
      "gdacs:FL:1104099",
      "gdacs:TC:1001303",
      "gdacs:WF:1030137",
    ]);
  });

  it("surfaces truncation instead of returning an incomplete success", async () => {
    const fullPage = [
      createGdacsFeature(),
      createGdacsFeature({ eventid: 1_001_304 }),
    ];
    const adapter = new GdacsAdapter({
      pageSize: 2,
      maxPages: 2,
      fetchImplementation: vi.fn(async () =>
        Response.json(
          { type: "FeatureCollection", features: fullPage },
          { headers: { "content-type": "application/json" } },
        ),
      ),
    });

    await expect(
      adapter.fetchAndNormalize({
        from: new Date("2026-08-11T18:02:35.000Z"),
        to: new Date("2026-08-18T18:02:35.000Z"),
        signal: new AbortController().signal,
      }),
    ).rejects.toMatchObject({ code: "truncated" });
  });
});

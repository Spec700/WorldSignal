import { describe, expect, it, vi } from "vitest";

import {
  getUsgsPriority,
  normalizeUsgsFeature,
  UsgsAdapter,
} from "@/lib/sources/usgs/adapter";
import { usgsFeedSchema } from "@/lib/sources/usgs/schema";
import { getUsgsFeedUrl } from "@/lib/sources/usgs/urls";
import { usgsFeedFixture } from "../../fixtures/usgs";

describe("USGS feed selection", () => {
  const to = new Date("2026-08-18T10:00:00.000Z");

  it.each([
    ["24 hours", "2026-08-17T10:00:00.000Z", "4.5_day.geojson"],
    ["7 days", "2026-08-11T10:00:00.000Z", "4.5_week.geojson"],
    ["30 days", "2026-07-19T10:00:00.000Z", "4.5_month.geojson"],
  ])("uses the matching rolling feed for %s", (_label, from, suffix) => {
    expect(getUsgsFeedUrl(new Date(from), to).pathname.endsWith(suffix)).toBe(
      true,
    );
  });
});

describe("USGS priority mapping", () => {
  it.each([
    ["green", "low"],
    ["yellow", "medium"],
    ["orange", "high"],
    ["red", "critical"],
  ] as const)("maps PAGER %s to %s", (alert, expected) => {
    expect(getUsgsPriority(7.5, alert)).toEqual({
      displayPriority: expected,
      priorityBasis: "USGS PAGER impact alert",
    });
  });

  it.each([
    [4.5, "low"],
    [5, "medium"],
    [6, "high"],
    [7, "critical"],
  ] as const)(
    "maps magnitude %s without PAGER to %s",
    (magnitude, expected) => {
      expect(getUsgsPriority(magnitude, null).displayPriority).toBe(expected);
    },
  );
});

describe("USGS schema and normalization", () => {
  it("accepts a sanitized live-feed fixture", () => {
    expect(usgsFeedSchema.safeParse(usgsFeedFixture).success).toBe(true);
  });

  it("accepts a missing upstream place without discarding the feed", () => {
    const fixture = structuredClone(usgsFeedFixture);
    fixture.features[0].properties.place = null;

    const parsed = usgsFeedSchema.parse(fixture);
    const event = normalizeUsgsFeature(
      parsed.features[0],
      "2026-08-18T18:02:00.000Z",
    );

    expect(event.title).toBe("M4.9 earthquake — Location not supplied by USGS");
    expect(event.locationLabel).toBe("Location not supplied by USGS");
  });

  it("rejects invalid coordinate order at the raw boundary", () => {
    const fixture = structuredClone(usgsFeedFixture);
    fixture.features[0].geometry.coordinates = [-7.9051, 120.5751, 36.253];

    expect(usgsFeedSchema.safeParse(fixture).success).toBe(false);
  });

  it("normalizes provenance, times, facts, and longitude-latitude order", () => {
    const event = normalizeUsgsFeature(
      usgsFeedFixture.features[0],
      "2026-08-18T18:02:00.000Z",
    );

    expect(event).toMatchObject({
      id: "usgs:us6000tlnv",
      category: "earthquake",
      lifecycle: "occurred",
      geometry: { type: "Point", coordinates: [120.5751, -7.9051] },
      centroid: { longitude: 120.5751, latitude: -7.9051 },
      nativeSeverity: { value: 4.9, unit: "mb" },
      verification: "authoritative-source",
    });
    expect(event.facts).toContainEqual({
      key: "depth",
      label: "Depth",
      value: 36.253,
      unit: "km",
    });
  });

  it("keeps a stable fingerprint until a meaningful revision changes", () => {
    const original = normalizeUsgsFeature(
      usgsFeedFixture.features[0],
      "2026-08-18T18:02:00.000Z",
    );
    const retrievedLater = normalizeUsgsFeature(
      usgsFeedFixture.features[0],
      "2026-08-18T19:02:00.000Z",
    );
    const revisedFeature = structuredClone(usgsFeedFixture.features[0]);
    revisedFeature.properties.mag = 5;
    const revised = normalizeUsgsFeature(
      revisedFeature,
      "2026-08-18T19:02:00.000Z",
    );

    expect(retrievedLater.revisionFingerprint).toBe(
      original.revisionFingerprint,
    );
    expect(revised.revisionFingerprint).not.toBe(original.revisionFingerprint);
  });

  it("fetches, validates, and normalizes a complete feed", async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json(usgsFeedFixture, {
        headers: { "content-type": "application/geo+json" },
      }),
    );
    const adapter = new UsgsAdapter({
      fetchImplementation,
      now: () => new Date("2026-08-18T18:02:00.000Z"),
    });

    const result = await adapter.fetchAndNormalize({
      from: new Date("2026-08-11T18:02:00.000Z"),
      to: new Date("2026-08-18T18:02:00.000Z"),
      signal: new AbortController().signal,
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(result.events).toHaveLength(1);
    expect(result.upstreamUpdatedAt).toBe("2026-08-18T18:02:00.000Z");
  });
});

import { describe, expect, it } from "vitest";

import { selectVisibleEvents } from "@/lib/events/filtering";
import { sortEventsByPriority } from "@/lib/events/sorting";
import type { EventFilters, WorldEvent } from "@/lib/events/types";
import { cycloneFixture, earthquakeFixture } from "../../fixtures/events";

const DEFAULT_FILTERS: EventFilters = {
  module: "natural-hazards",
  categories: [
    "earthquake",
    "tropical-cyclone",
    "flood",
    "drought",
    "volcano",
    "wildfire",
  ],
  priorities: ["low", "medium", "high", "critical"],
  sources: ["usgs", "gdacs"],
  lifecycle: ["ongoing", "occurred", "ended", "unknown"],
  query: "",
  window: "7d",
  timeCursor: "2026-08-18T10:00:00.000Z",
};

const EVENTS = [earthquakeFixture, cycloneFixture];

describe("selectVisibleEvents", () => {
  it("applies category, priority, source, and lifecycle filters in one selector", () => {
    expect(
      selectVisibleEvents(EVENTS, {
        ...DEFAULT_FILTERS,
        categories: ["earthquake"],
        priorities: ["high"],
        sources: ["usgs"],
        lifecycle: ["occurred"],
      }),
    ).toEqual([earthquakeFixture]);

    expect(
      selectVisibleEvents(EVENTS, {
        ...DEFAULT_FILTERS,
        categories: ["earthquake"],
        sources: ["gdacs"],
      }),
    ).toEqual([]);
  });

  it("searches normalized title, location, country, category, and source label", () => {
    for (const query of ["sendai", "JP", "earthquake", "geological survey"]) {
      expect(
        selectVisibleEvents(EVENTS, { ...DEFAULT_FILTERS, query }),
      ).toContainEqual(earthquakeFixture);
    }

    expect(
      selectVisibleEvents(EVENTS, {
        ...DEFAULT_FILTERS,
        query: "northwest pacific",
      }),
    ).toEqual([cycloneFixture]);
  });

  it("shows instantaneous events only at or after occurrence", () => {
    expect(
      selectVisibleEvents(EVENTS, {
        ...DEFAULT_FILTERS,
        timeCursor: "2026-08-18T08:00:00.000Z",
      }),
    ).not.toContainEqual(earthquakeFixture);
    expect(
      selectVisibleEvents(EVENTS, {
        ...DEFAULT_FILTERS,
        timeCursor: earthquakeFixture.occurredAt!,
      }),
    ).toContainEqual(earthquakeFixture);
  });

  it("shows duration events only while the cursor intersects their interval", () => {
    const endedCyclone: WorldEvent = {
      ...cycloneFixture,
      lifecycle: "ended",
      endedAt: "2026-08-18T09:00:00.000Z",
    };

    expect(
      selectVisibleEvents([endedCyclone], {
        ...DEFAULT_FILTERS,
        timeCursor: "2026-08-18T08:00:00.000Z",
      }),
    ).toEqual([endedCyclone]);
    expect(
      selectVisibleEvents([endedCyclone], {
        ...DEFAULT_FILTERS,
        timeCursor: "2026-08-18T10:00:00.000Z",
      }),
    ).toEqual([]);
  });
});

describe("sortEventsByPriority", () => {
  it("sorts priority first, then update time, title, and stable ID", () => {
    const highOlder = {
      ...earthquakeFixture,
      id: "usgs:older",
      title: "A older high event",
      updatedAt: "2026-08-18T08:00:00.000Z",
    };
    const highNewer = {
      ...earthquakeFixture,
      id: "usgs:newer",
      title: "Z newer high event",
      updatedAt: "2026-08-18T09:00:00.000Z",
    };

    expect(
      sortEventsByPriority([highOlder, highNewer, cycloneFixture]).map(
        (event) => event.id,
      ),
    ).toEqual([cycloneFixture.id, highNewer.id, highOlder.id]);
  });
});

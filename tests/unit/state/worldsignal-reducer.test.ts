import { describe, expect, it } from "vitest";

import {
  createInitialWorldSignalState,
  worldSignalReducer,
} from "@/state/worldsignal-reducer";
import {
  cycloneFixture,
  earthquakeFixture,
  eventBatchFixture,
} from "../../fixtures/events";
import { gdacsGeometryFixture } from "../../fixtures/gdacs-geometry";

describe("WorldSignal reducer refresh flow", () => {
  it("does not mutate state for a duplicate refresh submission", () => {
    const initial = createInitialWorldSignalState();
    const loading = worldSignalReducer(initial, { type: "refresh/started" });

    expect(worldSignalReducer(loading, { type: "refresh/started" })).toBe(
      loading,
    );
  });

  it("marks displayed data as previous while a refresh is active", () => {
    const loaded = worldSignalReducer(createInitialWorldSignalState(), {
      type: "refresh/succeeded",
      batch: eventBatchFixture,
    });
    const refreshing = worldSignalReducer(loaded, { type: "refresh/started" });

    expect(refreshing.batch).toBe(eventBatchFixture);
    expect(refreshing.batchFreshness).toBe("previous");
    expect(refreshing.refreshState).toBe("loading");
  });

  it("replaces the display batch, classifies changes, and resets the time cursor", () => {
    const initial = worldSignalReducer(createInitialWorldSignalState(), {
      type: "refresh/succeeded",
      batch: eventBatchFixture,
    });
    const nextEarthquake = {
      ...earthquakeFixture,
      revisionFingerprint: "next-revision",
    };
    const nextBatch = {
      ...eventBatchFixture,
      generatedAt: "2026-08-18T11:00:00.000Z",
      requestedRange: {
        from: "2026-08-11T11:00:00.000Z",
        to: "2026-08-18T11:00:00.000Z",
      },
      events: [nextEarthquake],
      sources: [
        { ...eventBatchFixture.sources[0], eventCount: 1 },
        {
          source: "gdacs" as const,
          state: "error" as const,
          attemptedAt: "2026-08-18T10:59:58.000Z",
          completedAt: "2026-08-18T11:00:00.000Z",
          errorCode: "network" as const,
          safeMessage: "GDACS could not be reached.",
        },
      ],
    };
    const refreshed = worldSignalReducer(initial, {
      type: "refresh/succeeded",
      batch: nextBatch,
    });

    expect(refreshed.batch?.events).toEqual([nextEarthquake]);
    expect(refreshed.changesByEventId.get(nextEarthquake.id)).toBe("updated");
    expect(refreshed.previousEventsById.get(cycloneFixture.id)).toBe(
      cycloneFixture,
    );
    expect(refreshed.filters.timeCursor).toBe("2026-08-18T11:00:00.000Z");
  });

  it("keeps the previous batch visibly marked after an all-source failure", () => {
    const loaded = worldSignalReducer(createInitialWorldSignalState(), {
      type: "refresh/succeeded",
      batch: eventBatchFixture,
    });
    const failedSources = eventBatchFixture.sources.map((source) => ({
      source: source.source,
      state: "error" as const,
      attemptedAt: "2026-08-18T11:00:00.000Z",
      completedAt: "2026-08-18T11:00:02.000Z",
      errorCode: "network" as const,
      safeMessage: `${source.source.toUpperCase()} could not be reached.`,
    }));
    const failed = worldSignalReducer(loaded, {
      type: "refresh/failed",
      message: "WorldSignal could not retrieve current hazard data.",
      sources: failedSources,
    });

    expect(failed.batch).toBe(eventBatchFixture);
    expect(failed.batchFreshness).toBe("previous");
    expect(failed.refreshState).toBe("error");
    expect(failed.latestSourceHealth).toEqual(failedSources);
  });

  it("clears selection when the event is absent from the next retrieval", () => {
    const loaded = worldSignalReducer(createInitialWorldSignalState(), {
      type: "refresh/succeeded",
      batch: eventBatchFixture,
    });
    const selected = worldSignalReducer(loaded, {
      type: "selection/set",
      eventId: cycloneFixture.id,
    });
    const refreshed = worldSignalReducer(selected, {
      type: "refresh/succeeded",
      batch: { ...eventBatchFixture, events: [earthquakeFixture] },
    });

    expect(refreshed.selectedEventId).toBeUndefined();
    expect(refreshed.selectionNotice).toMatch(/not present/i);
  });
});

describe("WorldSignal reducer geometry flow", () => {
  it("accepts geometry only for the currently selected event", () => {
    const selected = worldSignalReducer(createInitialWorldSignalState(), {
      type: "selection/set",
      eventId: cycloneFixture.id,
    });
    const loading = worldSignalReducer(selected, {
      type: "geometry/requested",
      eventId: cycloneFixture.id,
    });
    const stale = worldSignalReducer(loading, {
      type: "geometry/succeeded",
      eventId: earthquakeFixture.id,
      geometry: gdacsGeometryFixture,
    });
    const ready = worldSignalReducer(stale, {
      type: "geometry/succeeded",
      eventId: cycloneFixture.id,
      geometry: gdacsGeometryFixture,
    });

    expect(loading.geometryState).toBe("loading");
    expect(stale).toBe(loading);
    expect(ready.geometryState).toBe("ready");
    expect(ready.selectedGeometry).toBe(gdacsGeometryFixture);
    expect(
      worldSignalReducer(ready, {
        type: "selection/set",
        eventId: cycloneFixture.id,
      }),
    ).toBe(ready);
  });

  it("records a safe geometry error and enables an explicit retry", () => {
    const selected = worldSignalReducer(createInitialWorldSignalState(), {
      type: "selection/set",
      eventId: cycloneFixture.id,
    });
    const failed = worldSignalReducer(selected, {
      type: "geometry/failed",
      eventId: cycloneFixture.id,
      message: "Detailed geometry is unavailable for this event.",
    });
    const retry = worldSignalReducer(failed, { type: "geometry/retry" });

    expect(failed.geometryState).toBe("error");
    expect(failed.geometryError).toMatch(/unavailable/i);
    expect(retry.geometryState).toBe("idle");
    expect(retry.geometryRequestVersion).toBe(1);
  });

  it("ignores geometry completion after selection is cleared", () => {
    const selected = worldSignalReducer(createInitialWorldSignalState(), {
      type: "selection/set",
      eventId: cycloneFixture.id,
    });
    const cleared = worldSignalReducer(selected, { type: "selection/clear" });
    const stale = worldSignalReducer(cleared, {
      type: "geometry/succeeded",
      eventId: cycloneFixture.id,
      geometry: gdacsGeometryFixture,
    });

    expect(stale).toBe(cleared);
    expect(stale.selectedGeometry).toBeUndefined();
  });
});

describe("WorldSignal reducer filter flow", () => {
  it("toggles every visibility dimension and resets without changing the retrieval window", () => {
    const initial = createInitialWorldSignalState();
    const category = worldSignalReducer(initial, {
      type: "filters/category-toggle",
      category: "earthquake",
    });
    const priority = worldSignalReducer(category, {
      type: "filters/priority-toggle",
      priority: "critical",
    });
    const source = worldSignalReducer(priority, {
      type: "filters/source-toggle",
      source: "gdacs",
    });
    const lifecycle = worldSignalReducer(source, {
      type: "filters/lifecycle-toggle",
      lifecycle: "ended",
    });
    const cursor = worldSignalReducer(lifecycle, {
      type: "filters/time-cursor-set",
      timeCursor: "2026-08-18T08:00:00.000Z",
    });
    const reset = worldSignalReducer(cursor, {
      type: "filters/reset-visibility",
      timeCursor: "2026-08-18T10:00:00.000Z",
    });

    expect(cursor.filters).toMatchObject({
      categories: expect.not.arrayContaining(["earthquake"]),
      priorities: expect.not.arrayContaining(["critical"]),
      sources: ["usgs"],
      lifecycle: expect.not.arrayContaining(["ended"]),
      timeCursor: "2026-08-18T08:00:00.000Z",
    });
    expect(reset.filters).toMatchObject({
      categories: expect.arrayContaining(["earthquake", "wildfire"]),
      priorities: ["low", "medium", "high", "critical"],
      sources: ["usgs", "gdacs"],
      lifecycle: ["ongoing", "occurred", "ended", "unknown"],
      query: "",
      window: "7d",
      timeCursor: "2026-08-18T10:00:00.000Z",
    });
  });

  it("clears a selected event with an explanation when it becomes hidden", () => {
    const selected = worldSignalReducer(createInitialWorldSignalState(), {
      type: "selection/set",
      eventId: earthquakeFixture.id,
    });
    const hidden = worldSignalReducer(selected, {
      type: "selection/hidden",
      eventId: earthquakeFixture.id,
    });

    expect(hidden.selectedEventId).toBeUndefined();
    expect(hidden.selectionNotice).toMatch(/hidden/i);
    expect(hidden.announcement).toMatch(/selection cleared/i);
  });
});

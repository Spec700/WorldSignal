import { describe, expect, it } from "vitest";

import {
  createHazardSnapshot,
  hazardSnapshotSchema,
} from "@/features/hazards/client/hazard-snapshot-store";
import { eventBatchFixture } from "../../fixtures/events";

describe("WorldSignal hazard snapshots", () => {
  it("serializes the validated batch, comparison baseline, and change state", () => {
    const previousEventsById = new Map(
      eventBatchFixture.events.map((event) => [event.id, event]),
    );
    const changesByEventId = new Map(
      eventBatchFixture.events.map((event) => [event.id, "new"] as const),
    );

    const snapshot = createHazardSnapshot({
      window: "7d",
      batch: eventBatchFixture,
      previousEventsById,
      changesByEventId,
      savedAt: "2026-08-18T10:00:01.000Z",
    });

    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      window: "7d",
      savedAt: "2026-08-18T10:00:01.000Z",
      batch: eventBatchFixture,
    });
    expect(snapshot.baselineEvents).toEqual(eventBatchFixture.events);
    expect(snapshot.changes).toEqual([
      [eventBatchFixture.events[0].id, "new"],
      [eventBatchFixture.events[1].id, "new"],
    ]);
  });

  it("rejects corrupt change references at the browser boundary", () => {
    const snapshot = createHazardSnapshot({
      window: "7d",
      batch: eventBatchFixture,
      previousEventsById: new Map(),
      changesByEventId: new Map(),
      savedAt: "2026-08-18T10:00:01.000Z",
    });

    expect(
      hazardSnapshotSchema.safeParse({
        ...snapshot,
        changes: [["missing:event", "new"]],
      }).success,
    ).toBe(false);
  });
});

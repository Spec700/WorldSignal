import { describe, expect, it } from "vitest";

import { createTimelineTicks } from "@/lib/events/timeline";
import { cycloneFixture, earthquakeFixture } from "../../fixtures/events";

describe("createTimelineTicks", () => {
  const requestedRange = {
    from: "2026-08-11T10:00:00.000Z",
    to: "2026-08-18T10:00:00.000Z",
  };

  it("positions filtered events inside the loaded range", () => {
    const ticks = createTimelineTicks(
      [earthquakeFixture, cycloneFixture],
      requestedRange,
    );

    expect(ticks).toHaveLength(2);
    expect(ticks.map((tick) => tick.eventId)).toEqual([
      earthquakeFixture.id,
      cycloneFixture.id,
    ]);
    expect(ticks.every((tick) => tick.positionPercent >= 0)).toBe(true);
    expect(ticks.every((tick) => tick.positionPercent <= 100)).toBe(true);
  });

  it("anchors an overlapping duration at the range start and rejects future ticks", () => {
    const beforeRange = {
      ...cycloneFixture,
      id: "gdacs:TC:before-range",
      startAt: "2026-08-01T00:00:00.000Z",
    };
    const afterRange = {
      ...earthquakeFixture,
      id: "usgs:after-range",
      occurredAt: "2026-08-19T00:00:00.000Z",
    };

    expect(
      createTimelineTicks([beforeRange, afterRange], requestedRange),
    ).toEqual([
      expect.objectContaining({
        eventId: beforeRange.id,
        positionPercent: 0,
      }),
    ]);
  });

  it("returns no ticks for an invalid interval", () => {
    expect(
      createTimelineTicks([earthquakeFixture], {
        from: requestedRange.to,
        to: requestedRange.from,
      }),
    ).toEqual([]);
  });
});

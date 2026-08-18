import {
  eventBatchSchema,
  geometrySchema,
  sourceHealthSchema,
  worldEventSchema,
} from "@/lib/events/schema";
import { earthquakeFixture, eventBatchFixture } from "../../fixtures/events";

describe("WorldEvent schema", () => {
  it("accepts a valid authoritative hazard event", () => {
    expect(worldEventSchema.parse(earthquakeFixture)).toEqual(
      earthquakeFixture,
    );
  });

  it("rejects coordinates outside geographic bounds", () => {
    const invalidEvent = {
      ...earthquakeFixture,
      centroid: { latitude: 95, longitude: 143.248 },
    };

    expect(worldEventSchema.safeParse(invalidEvent).success).toBe(false);
  });

  it("requires occurred events to include occurredAt", () => {
    const invalidEvent = { ...earthquakeFixture };
    delete invalidEvent.occurredAt;

    expect(worldEventSchema.safeParse(invalidEvent).success).toBe(false);
  });

  it("keeps GeoJSON coordinate order as longitude then latitude", () => {
    expect(
      geometrySchema.safeParse({
        type: "Point",
        coordinates: [143.248, 38.322],
      }).success,
    ).toBe(true);

    expect(
      geometrySchema.safeParse({
        type: "Point",
        coordinates: [38.322, 143.248],
      }).success,
    ).toBe(false);
  });

  it("rejects an unclosed polygon ring", () => {
    expect(
      geometrySchema.safeParse({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        ],
      }).success,
    ).toBe(false);
  });
});

describe("SourceHealth schema", () => {
  it("requires an event count for successful sources", () => {
    const result = sourceHealthSchema.safeParse({
      source: "usgs",
      state: "ok",
      attemptedAt: "2026-08-18T09:59:58.000Z",
      completedAt: "2026-08-18T09:59:59.000Z",
    });

    expect(result.success).toBe(false);
  });

  it("requires an error code for unavailable sources", () => {
    const result = sourceHealthSchema.safeParse({
      source: "gdacs",
      state: "error",
      attemptedAt: "2026-08-18T09:59:58.000Z",
      completedAt: "2026-08-18T09:59:59.000Z",
    });

    expect(result.success).toBe(false);
  });
});

describe("EventBatch schema", () => {
  it("accepts a deterministic fixture batch", () => {
    expect(eventBatchSchema.parse(eventBatchFixture)).toEqual(
      eventBatchFixture,
    );
  });

  it("rejects duplicate stable event IDs", () => {
    const result = eventBatchSchema.safeParse({
      ...eventBatchFixture,
      events: [earthquakeFixture, earthquakeFixture],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an inverted requested range", () => {
    const result = eventBatchSchema.safeParse({
      ...eventBatchFixture,
      requestedRange: {
        from: eventBatchFixture.requestedRange.to,
        to: eventBatchFixture.requestedRange.from,
      },
    });

    expect(result.success).toBe(false);
  });
});

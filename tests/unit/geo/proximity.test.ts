import { describe, expect, it } from "vitest";

import {
  distanceBetweenPointsKm,
  distanceToGeometryCollectionKm,
  distanceToGeometryKm,
} from "@/lib/geo/proximity";

describe("geographic proximity", () => {
  it("measures great-circle distance between points", () => {
    const distance = distanceBetweenPointsKm(
      { latitude: 40.7128, longitude: -74.006 },
      { latitude: 51.5072, longitude: -0.1276 },
    );

    expect(distance).toBeGreaterThan(5560);
    expect(distance).toBeLessThan(5580);
  });

  it("uses the nearest position along a path instead of its endpoints", () => {
    const distance = distanceToGeometryKm(
      { latitude: 1, longitude: 5 },
      {
        type: "LineString",
        coordinates: [
          [0, 0],
          [10, 0],
        ],
      },
    );

    expect(distance).toBeGreaterThan(110);
    expect(distance).toBeLessThan(112);
  });

  it("returns zero inside an affected polygon and measures from its boundary outside", () => {
    const polygon = {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    };

    expect(distanceToGeometryKm({ latitude: 5, longitude: 5 }, polygon)).toBe(
      0,
    );
    expect(
      distanceToGeometryKm({ latitude: 5, longitude: 11 }, polygon),
    ).toBeGreaterThan(109);
  });

  it("does not treat a polygon hole as part of the affected area", () => {
    const distance = distanceToGeometryKm(
      { latitude: 5, longitude: 5 },
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
          [
            [4, 4],
            [4, 6],
            [6, 6],
            [6, 4],
            [4, 4],
          ],
        ],
      },
    );

    expect(distance).toBeGreaterThan(110);
    expect(distance).toBeLessThan(112);
  });

  it("handles affected areas that cross the antimeridian", () => {
    const distance = distanceToGeometryKm(
      { latitude: 0, longitude: 180 },
      {
        type: "Polygon",
        coordinates: [
          [
            [170, -10],
            [-170, -10],
            [-170, 10],
            [170, 10],
            [170, -10],
          ],
        ],
      },
    );

    expect(distance).toBe(0);
  });

  it("does not invert a small affected area onto its antipodal region", () => {
    const distance = distanceToGeometryKm(
      { latitude: -5, longitude: -175 },
      {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
        ],
      },
    );

    expect(distance).toBeGreaterThan(10_000);
  });

  it("uses the nearest feature in a detailed geometry collection", () => {
    const distance = distanceToGeometryCollectionKm(
      { latitude: 0, longitude: 5 },
      {
        features: [
          { geometry: { type: "Point", coordinates: [40, 0] } },
          {
            geometry: {
              type: "LineString",
              coordinates: [
                [0, 0],
                [10, 0],
              ],
            },
          },
        ],
      },
    );

    expect(distance).toBe(0);
  });
});

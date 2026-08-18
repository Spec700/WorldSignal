import { describe, expect, it } from "vitest";

import {
  deriveGeometryCameraView,
  toGlobeGeometryLayers,
} from "@/components/globe/geometry-model";
import type { GdacsGeometryCollection } from "@/lib/sources/gdacs/geometry";
import { gdacsGeometryFixture } from "../../fixtures/gdacs-geometry";

describe("selected geometry globe model", () => {
  it("flattens supported lines and polygons while ignoring duplicate point geometry", () => {
    const layers = toGlobeGeometryLayers(gdacsGeometryFixture);

    expect(layers.paths).toHaveLength(1);
    expect(layers.paths[0]).toMatchObject({
      label: "Forecast track",
      color: "#58cddd",
    });
    expect(layers.polygons).toHaveLength(1);
    expect(layers.polygons[0]).toMatchObject({
      kind: "detail",
      label: "PointRadii",
    });
    const outerRing = layers.polygons[0].geometry.coordinates[0];
    const signedArea = outerRing.slice(0, -1).reduce((area, point, index) => {
      const next = outerRing[index + 1];
      return area + point[0] * next[1] - next[0] * point[1];
    }, 0);
    expect(signedArea).toBeLessThan(0);
  });

  it("splits multi-geometries into renderable paths and polygons", () => {
    const collection: GdacsGeometryCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "GeometryCollection",
            geometries: [
              {
                type: "MultiLineString",
                coordinates: [
                  [
                    [1, 2],
                    [3, 4],
                  ],
                  [
                    [5, 6],
                    [7, 8],
                  ],
                ],
              },
              {
                type: "MultiPolygon",
                coordinates: [
                  [
                    [
                      [1, 1],
                      [2, 1],
                      [2, 2],
                      [1, 1],
                    ],
                  ],
                  [
                    [
                      [3, 3],
                      [4, 3],
                      [4, 4],
                      [3, 3],
                    ],
                  ],
                ],
              },
            ],
          },
          properties: { semanticClass: "Poly_Red" },
        },
      ],
    };

    const layers = toGlobeGeometryLayers(collection);
    expect(layers.paths).toHaveLength(2);
    expect(layers.polygons).toHaveLength(2);
    expect(layers.polygons[0].strokeColor).toBe("#ff6b64");
  });

  it("fits antimeridian geometry around the selected anchor instead of zooming out globally", () => {
    const collection: GdacsGeometryCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [179, 10],
              [-179, 12],
            ],
          },
          properties: {},
        },
      ],
    };

    expect(
      deriveGeometryCameraView(collection, {
        latitude: 11,
        longitude: 179.5,
      }),
    ).toEqual({ lat: 11, lng: -180, altitude: 0.95 });
  });
});

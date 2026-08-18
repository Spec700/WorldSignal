export const gdacsMixedGeometryFixture = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-167.2, 20.5] },
      properties: {
        Class: "Point_Centroid",
        polygonlabel: "Centroid",
        htmldescription: "This unsafe source field must not be returned.",
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [-167.2, 20.5],
          [-166.4, 21.1],
        ],
      },
      properties: {
        Class: "Line_Forecast",
        polygonlabel: "Forecast track",
        polygondate: "2026-08-18T15:00:00",
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-168, 20],
            [-166, 20],
            [-166, 22],
            [-168, 20],
          ],
        ],
      },
      properties: {
        Class: "Point_Polygon_Point_0",
        featuretype: "PointRadii",
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [-170, 19],
              [-169, 19],
              [-169, 20],
              [-170, 19],
            ],
          ],
        ],
      },
      properties: { Class: "Poly_Red", polygonlabel: "120 km/h" },
    },
  ],
} as const;

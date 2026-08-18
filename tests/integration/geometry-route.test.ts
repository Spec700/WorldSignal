import { describe, expect, it, vi } from "vitest";

import { handleGdacsGeometryRequest } from "@/features/hazards/server/gdacs-geometry";
import { gdacsGeometryCollectionSchema } from "@/lib/sources/gdacs/geometry";
import { gdacsMixedGeometryFixture } from "../fixtures/gdacs-geometry";

function context(eventId: string) {
  return { params: Promise.resolve({ eventId }) };
}

describe("GET /api/geometry/gdacs/:eventId", () => {
  it.each([
    ["abc", "TC", "25"],
    ["1001303", "EQ", "25"],
    ["1001303", "TC", "episode"],
    ["1001303", "TC", null],
  ])(
    "rejects invalid fixed parameters (%s, %s, %s)",
    async (eventId, eventType, episodeId) => {
      const url = new URL("http://localhost/api/geometry/gdacs/1001303");
      url.searchParams.set("eventType", eventType);
      if (episodeId !== null) {
        url.searchParams.set("episodeId", episodeId);
      }
      const fetchImplementation = vi.fn();

      const response = await handleGdacsGeometryRequest(
        new Request(url),
        context(eventId),
        { fetchImplementation },
      );

      expect(response.status).toBe(400);
      expect(fetchImplementation).not.toHaveBeenCalled();
    },
  );

  it("validates mixed geometry and returns only presentation-safe properties", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      void input;
      return Response.json(gdacsMixedGeometryFixture, {
        headers: { "content-type": "application/geo+json" },
      });
    });
    const response = await handleGdacsGeometryRequest(
      new Request(
        "http://localhost/api/geometry/gdacs/1001303?eventType=TC&episodeId=25",
      ),
      context("1001303"),
      { fetchImplementation },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(gdacsGeometryCollectionSchema.safeParse(body).success).toBe(true);
    expect(
      body.features.map((feature: GeoJSON.Feature) => feature.geometry.type),
    ).toEqual(["Point", "LineString", "Polygon", "MultiPolygon"]);
    expect(body.features[0].properties).toEqual({
      semanticClass: "Point_Centroid",
      label: "Centroid",
    });
    expect(JSON.stringify(body)).not.toContain("htmldescription");

    const requestedUrl = new URL(String(fetchImplementation.mock.calls[0][0]));
    expect(requestedUrl.origin).toBe("https://www.gdacs.org");
    expect(requestedUrl.searchParams.get("eventid")).toBe("1001303");
  });

  it("returns an explicit schema error for malformed upstream geometry", async () => {
    const response = await handleGdacsGeometryRequest(
      new Request(
        "http://localhost/api/geometry/gdacs/1001303?eventType=TC&episodeId=25",
      ),
      context("1001303"),
      {
        fetchImplementation: vi.fn(async () =>
          Response.json(
            {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  geometry: { type: "Point", coordinates: [400, 20] },
                  properties: {},
                },
              ],
            },
            { headers: { "content-type": "application/json" } },
          ),
        ),
      },
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: {
        code: "geometry_unavailable",
        sourceErrorCode: "schema",
      },
    });
  });
});

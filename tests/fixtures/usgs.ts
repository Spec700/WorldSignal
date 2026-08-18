import type { UsgsFeed } from "@/lib/sources/usgs/schema";

export const usgsFeedFixture: UsgsFeed = {
  type: "FeatureCollection",
  metadata: {
    generated: 1_787_076_120_000,
    url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson",
    title: "USGS Magnitude 4.5+ Earthquakes, Past Week",
    status: 200,
    api: "2.7.0",
    count: 1,
  },
  features: [
    {
      type: "Feature",
      id: "us6000tlnv",
      properties: {
        mag: 4.9,
        place: "79 km N of Ruteng, Indonesia",
        time: 1_787_054_630_174,
        updated: 1_787_063_451_040,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us6000tlnv",
        felt: null,
        cdi: null,
        mmi: null,
        alert: null,
        status: "reviewed",
        tsunami: 0,
        sig: 369,
        magType: "mb",
        type: "earthquake",
      },
      geometry: {
        type: "Point",
        coordinates: [120.5751, -7.9051, 36.253],
      },
    },
  ],
};

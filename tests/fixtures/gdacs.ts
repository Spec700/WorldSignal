import type {
  GdacsEventType,
  GdacsFeature,
  GdacsSearchResponse,
} from "@/lib/sources/gdacs/schema";

export function createGdacsFeature(
  overrides: Partial<GdacsFeature["properties"]> & {
    eventtype?: GdacsEventType;
  } = {},
): GdacsFeature {
  const eventtype = overrides.eventtype ?? "TC";
  const eventid = overrides.eventid ?? 1_001_303;
  const episodeid = overrides.episodeid ?? 25;
  const baseProperties: GdacsFeature["properties"] = {
    eventtype,
    eventid,
    episodeid,
    name: "Tropical Cyclone ONE-C-26",
    description: "Tropical Cyclone ONE-C-26",
    url: {
      geometry: `https://www.gdacs.org/gdacsapi/api/polygons/getgeometry?eventtype=${eventtype}&eventid=${eventid}&episodeid=${episodeid}`,
      report: `https://www.gdacs.org/report.aspx?eventid=${eventid}&episodeid=${episodeid}&eventtype=${eventtype}`,
      details: `https://www.gdacs.org/gdacsapi/api/events/geteventdata?eventtype=${eventtype}&eventid=${eventid}`,
    },
    alertlevel: "green",
    alertscore: 1,
    iscurrent: true,
    country: "United States",
    fromdate: "2026-08-12T15:00:00",
    todate: "2026-08-18T15:00:00",
    datemodified: "2026-08-18T17:51:19",
    iso3: "USA",
    source: "NOAA",
    affectedcountries: [
      { iso2: "US", iso3: "USA", countryname: "United States" },
    ],
    severitydata: {
      severity: 157.4064,
      severitytext:
        "Hurricane/Typhoon > 74 mph (maximum wind speed of 157 km/h)",
      severityunit: "km/h",
    },
  };

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [-167.2, 20.5],
    },
    properties: {
      ...baseProperties,
      ...overrides,
      eventtype,
      eventid,
      episodeid,
    },
  };
}

export const gdacsSearchFixture: GdacsSearchResponse = {
  type: "FeatureCollection",
  features: [createGdacsFeature()],
};

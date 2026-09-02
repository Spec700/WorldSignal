import { describe, expect, it, vi } from "vitest";

import {
  AdsbLolAdapter,
  fetchVrsRouteSuggestion,
} from "@/lib/sources/adsb-lol/adapter";
import {
  getAdsbLolCallsignUrl,
  getAdsbLolIcaoUrl,
  getVrsRouteUrl,
} from "@/lib/sources/adsb-lol/urls";

const aircraftResponse = {
  ac: [
    {
      hex: "aa3ae5",
      flight: "UAL2276 ",
      r: "N75854",
      t: "B753",
      alt_baro: 32_000,
      alt_geom: 33_875,
      gs: 452.1,
      track: 271.39,
      baro_rate: 0,
      squawk: "1367",
      lat: 39.137584,
      lon: -82.857544,
      seen: 1.25,
    },
  ],
  msg: "No error",
  now: Date.parse("2026-09-02T22:09:06.001Z"),
  total: 1,
};

describe("ADSB.lol source adapter", () => {
  it("builds HTTPS URLs for callsign, aircraft, and route queries", () => {
    expect(getAdsbLolCallsignUrl("UAL2276").href).toBe(
      "https://api.adsb.lol/v2/callsign/UAL2276",
    );
    expect(getAdsbLolIcaoUrl("aa3ae5").href).toBe(
      "https://api.adsb.lol/v2/icao/aa3ae5",
    );
    expect(getVrsRouteUrl("UAL2276").href).toBe(
      "https://vrs-standing-data.adsb.lol/routes/UA/UAL2276.json",
    );
  });

  it("normalizes live aircraft facts and source freshness", async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json(aircraftResponse),
    );
    const adapter = new AdsbLolAdapter({
      fetchImplementation,
      now: () => new Date("2026-09-02T22:09:06.001Z"),
    });

    const result = await adapter.fetchByCallsign(
      "UAL2276",
      new AbortController().signal,
    );

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(result).toEqual([
      expect.objectContaining({
        aircraftIcaoHex: "aa3ae5",
        callsign: "UAL2276",
        registration: "N75854",
        aircraftType: "B753",
        latitude: 39.137584,
        longitude: -82.857544,
        barometricAltitudeFeet: 32_000,
        groundSpeedKnots: 452.1,
        trackDegrees: 271.39,
        onGround: false,
        sourceObservedAt: "2026-09-02T22:09:04.751Z",
        retrievedAt: "2026-09-02T22:09:06.001Z",
      }),
    ]);
  });

  it("validates and returns a multi-leg route suggestion", async () => {
    const fetchImplementation = vi.fn(async () =>
      Response.json({
        callsign: "UAL2276",
        number: "2276",
        airline_code: "UAL",
        airport_codes: "KORD-KIAD-KLAX",
        _airport_codes_iata: "ORD-IAD-LAX",
        _airports: [
          {
            name: "Chicago O'Hare International Airport",
            icao: "KORD",
            iata: "ORD",
            location: "Chicago",
            countryiso2: "US",
            lat: 41.9786,
            lon: -87.9048,
          },
          {
            name: "Washington Dulles International Airport",
            icao: "KIAD",
            iata: "IAD",
            location: "Washington",
            countryiso2: "US",
            lat: 38.9445,
            lon: -77.455803,
          },
          {
            name: "Los Angeles International Airport",
            icao: "KLAX",
            iata: "LAX",
            location: "Los Angeles",
            countryiso2: "US",
            lat: 33.942501,
            lon: -118.407997,
          },
        ],
      }),
    );

    const result = await fetchVrsRouteSuggestion(
      "UAL2276",
      new AbortController().signal,
      fetchImplementation,
    );

    expect(result._airports.map((airport) => airport.iata)).toEqual([
      "ORD",
      "IAD",
      "LAX",
    ]);
  });
});

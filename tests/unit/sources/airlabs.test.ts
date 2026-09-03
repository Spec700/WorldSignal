import { describe, expect, it, vi } from "vitest";

import { findAirportByIata } from "@/lib/airports/directory";
import {
  AirLabsAdapter,
  normalizeAirLabsPhase,
} from "@/lib/sources/airlabs/adapter";
import { AirLabsSourceError } from "@/lib/sources/airlabs/errors";

const airLabsResponse = {
  request: {
    key: {
      id: 42,
      type: "free",
      expired: "2026-10-02T00:00:00Z",
      limits_by_month: 1000,
      usage_by_month: 12,
    },
  },
  response: {
    hex: "aa6b9f",
    reg_number: "N772AN",
    lat: 47.25,
    lng: -38.75,
    alt: 10_058,
    dir: 301,
    speed: 922,
    squawk: "2171",
    flight_number: "333",
    flight_icao: "AAL333",
    flight_iata: "AA333",
    airline_icao: "AAL",
    airline_iata: "AA",
    airline_name: "American Airlines",
    aircraft_icao: "B772",
    aircraft_model: "777-223ER",
    aircraft_manufacturer: "Boeing",
    dep_icao: "LGAV",
    dep_iata: "ATH",
    dep_name: "Athens International Airport",
    dep_time_ts: 1_788_437_700,
    dep_actual_ts: 1_788_438_180,
    dep_terminal: "A",
    dep_gate: "A12",
    arr_icao: "KJFK",
    arr_iata: "JFK",
    arr_name: "John F. Kennedy International Airport",
    arr_time_ts: 1_788_477_300,
    arr_estimated_ts: 1_788_478_200,
    arr_terminal: "8",
    arr_gate: "14",
    duration: 660,
    updated: 1_788_448_746,
    status: "en-route",
    percent: 28,
    eta: 412,
  },
};

describe("AirLabs source adapter", () => {
  it("resolves airport coordinates from the local directory", () => {
    expect(findAirportByIata(" jfk ")).toMatchObject({
      iata: "JFK",
      icao: "KJFK",
      latitude: 40.63980103,
      longitude: -73.77890015,
    });
  });

  it("uses one targeted request and normalizes operational and live data", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input.toString());
      expect(url.origin).toBe("https://airlabs.co");
      expect(url.pathname).toBe("/api/v9/flight");
      expect(url.searchParams.get("flight_iata")).toBe("AA333");
      expect(url.searchParams.get("api_key")).toBe("test-secret");
      return Response.json(airLabsResponse);
    });
    const adapter = new AirLabsAdapter({
      configuration: {
        apiKey: "test-secret",
        keyFingerprint: "fingerprint",
      },
      fetchImplementation,
      now: () => new Date("2026-09-03T15:20:00.000Z"),
    });

    const result = await adapter.fetchFlight(
      " aa 333 ",
      new AbortController().signal,
    );

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      passengerFlightNumber: "AA333",
      flightIcao: "AAL333",
      airlineName: "American Airlines",
      providerStatus: "en-route",
      phase: "active",
      aircraftIcaoHex: "aa6b9f",
      aircraftRegistration: "N772AN",
      aircraftType: "B772",
      origin: { iata: "ATH", icao: "LGAV" },
      destination: { iata: "JFK", icao: "KJFK" },
      scheduledDepartureAt: "2026-09-03T12:15:00.000Z",
      scheduledArrivalAt: "2026-09-03T23:15:00.000Z",
      actualDepartureAt: "2026-09-03T12:23:00.000Z",
      estimatedArrivalAt: "2026-09-03T23:30:00.000Z",
      durationMinutes: 660,
      progressPercent: 28,
      etaMinutes: 412,
      usage: {
        keyId: 42,
        planType: "free",
        expiresAt: "2026-10-02T00:00:00Z",
        monthlyLimit: 1000,
        monthlyUsed: 12,
        monthlyRemaining: 988,
      },
      observation: {
        latitude: 47.25,
        longitude: -38.75,
        trackDegrees: 301,
        onGround: false,
        sourceObservedAt: "2026-09-03T15:19:06.000Z",
        retrievedAt: "2026-09-03T15:20:00.000Z",
      },
    });
    expect(result.observation?.barometricAltitudeFeet).toBeCloseTo(32_998.7, 0);
    expect(result.observation?.groundSpeedKnots).toBeCloseTo(497.8, 0);
  });

  it("classifies quota responses as a global pause", async () => {
    const adapter = new AirLabsAdapter({
      configuration: {
        apiKey: "test-secret",
        keyFingerprint: "fingerprint",
      },
      fetchImplementation: vi.fn(async () =>
        Response.json({
          error: {
            code: "ERROR_LIMIT_EXCEEDED",
            message: "Monthly API limit exceeded",
          },
        }),
      ),
    });

    await expect(
      adapter.fetchFlight("AA333", new AbortController().signal),
    ).rejects.toMatchObject({
      directive: "pause",
      providerCode: "ERROR_LIMIT_EXCEEDED",
    } satisfies Partial<AirLabsSourceError>);
  });

  it("pauses globally for HTTP quota responses", async () => {
    const adapter = new AirLabsAdapter({
      configuration: {
        apiKey: "test-secret",
        keyFingerprint: "fingerprint",
      },
      fetchImplementation: vi.fn(async () =>
        Promise.resolve(new Response(null, { status: 429 })),
      ),
    });

    await expect(
      adapter.fetchFlight("AA333", new AbortController().signal),
    ).rejects.toMatchObject({
      directive: "pause",
      providerCode: "HTTP_429",
    } satisfies Partial<AirLabsSourceError>);
  });

  it("normalizes terminal provider states", () => {
    expect(normalizeAirLabsPhase("landed")).toBe("landed");
    expect(normalizeAirLabsPhase("cancelled")).toBe("cancelled");
    expect(normalizeAirLabsPhase("delayed")).toBe("scheduled");
  });
});

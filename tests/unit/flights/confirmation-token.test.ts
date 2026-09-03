// @vitest-environment node

import {
  FlightLookupTokenError,
  openFlightLookup,
  sealFlightLookup,
} from "@/features/flights/server/confirmation-token";

const environment: NodeJS.ProcessEnv = {
  ...process.env,
  AIRLABS_API_KEY: "unit-test-secret",
};
const snapshot = {
  passengerFlightNumber: "AA333",
  flightIcao: "AAL333",
  origin: {
    iata: "ATH",
    icao: "LGAV",
    name: "Athens International Airport",
    city: "Athens",
    country: "Greece",
    latitude: 37.9364,
    longitude: 23.9445,
  },
  destination: {
    iata: "JFK",
    icao: "KJFK",
    name: "John F. Kennedy International Airport",
    city: "New York",
    country: "United States",
    latitude: 40.6398,
    longitude: -73.7789,
  },
  scheduledDepartureAt: "2026-09-03T12:15:00.000Z",
  scheduledArrivalAt: "2026-09-03T23:15:00.000Z",
  providerStatus: "scheduled",
  phase: "scheduled" as const,
  usage: {},
  retrievedAt: "2026-09-03T10:00:00.000Z",
};

describe("AirLabs flight confirmation token", () => {
  it("round-trips a server-resolved flight without another provider call", () => {
    const now = new Date("2026-09-03T10:00:00.000Z");
    const sealed = sealFlightLookup(snapshot, { now, environment });

    expect(
      openFlightLookup(sealed.confirmationToken, {
        now: new Date("2026-09-03T10:10:00.000Z"),
        environment,
      }),
    ).toEqual(sealed.flight);
  });

  it("rejects tampering and expired matches", () => {
    const now = new Date("2026-09-03T10:00:00.000Z");
    const sealed = sealFlightLookup(snapshot, { now, environment });
    const tampered = `${sealed.confirmationToken.slice(0, -1)}x`;

    expect(() => openFlightLookup(tampered, { now, environment })).toThrow(
      FlightLookupTokenError,
    );
    expect(() =>
      openFlightLookup(sealed.confirmationToken, {
        now: new Date("2026-09-03T10:16:00.000Z"),
        environment,
      }),
    ).toThrow("expired");
  });
});

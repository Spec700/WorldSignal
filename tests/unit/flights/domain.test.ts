import {
  airLabsResolvedFlightSchema,
  parseFlightDesignator,
  resolveAdsbCallsign,
} from "@/features/flights/domain";

describe("FlightSignal domain rules", () => {
  it("normalizes a passenger flight number and resolves a known ADS-B callsign", () => {
    expect(parseFlightDesignator(" ua 2276 ")).toEqual({
      passengerFlightNumber: "UA2276",
      airlineCode: "UA",
      flightNumber: "2276",
    });
    expect(resolveAdsbCallsign("UA 2276")).toBe("UAL2276");
  });

  it("accepts an explicit ADS-B callsign for an unmapped carrier", () => {
    expect(resolveAdsbCallsign("ZZ 42", "TST42")).toBe("TST42");
  });

  it("requires an explicit ADS-B callsign for an unmapped carrier", () => {
    expect(() => resolveAdsbCallsign("ZZ 42")).toThrow(
      "ZZ is not in the local airline mapping",
    );
  });

  it("rejects coordinates outside globe bounds", () => {
    const result = airLabsResolvedFlightSchema.safeParse({
      passengerFlightNumber: "UA2276",
      origin: {
        iata: "IAD",
        icao: "KIAD",
        name: "Washington Dulles International Airport",
        city: "Washington",
        country: "United States",
        latitude: 138.9445,
        longitude: -77.4558,
      },
      destination: {
        iata: "LAX",
        icao: "KLAX",
        name: "Los Angeles International Airport",
        city: "Los Angeles",
        country: "United States",
        latitude: 33.9425,
        longitude: -118.408,
      },
      scheduledDepartureAt: "2026-09-02T18:00:00.000Z",
      providerStatus: "scheduled",
      phase: "scheduled",
      retrievedAt: "2026-09-02T16:00:00.000Z",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["origin", "latitude"]);
  });
});

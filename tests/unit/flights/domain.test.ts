import {
  createFlightTrackingInputSchema,
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

  it("rejects an impossible itinerary", () => {
    const result = createFlightTrackingInputSchema.safeParse({
      personId: "30000000-0000-4000-8000-000000000006",
      passengerFlightNumber: "UA 2276",
      originIata: "IAD",
      originName: "Washington Dulles International Airport",
      originLatitude: 38.9445,
      originLongitude: -77.4558,
      destinationIata: "IAD",
      destinationName: "Washington Dulles International Airport",
      destinationLatitude: 38.9445,
      destinationLongitude: -77.4558,
      scheduledDepartureAt: "2026-09-02T18:00:00.000Z",
      scheduledArrivalAt: "2026-09-02T17:00:00.000Z",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(["destinationIata", "scheduledArrivalAt"]),
      );
    }
  });
});

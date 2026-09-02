import { shouldPollFlight } from "@/features/flights/server/polling";

type PollableFlight = Parameters<typeof shouldPollFlight>[0];

function flightAt(
  departure: string,
  options: {
    arrival?: string;
    status?: PollableFlight["trackingStatus"];
  } = {},
): PollableFlight {
  return {
    scheduledDepartureAt: new Date(departure),
    scheduledArrivalAt: options.arrival ? new Date(options.arrival) : null,
    trackingStatus: options.status ?? "scheduled",
  } as PollableFlight;
}

describe("FlightSignal polling window", () => {
  const now = new Date("2026-09-02T18:00:00.000Z");

  it("starts acquisition six hours before departure", () => {
    expect(shouldPollFlight(flightAt("2026-09-03T00:00:00.000Z"), now)).toBe(
      true,
    );
    expect(shouldPollFlight(flightAt("2026-09-03T00:00:01.000Z"), now)).toBe(
      false,
    );
  });

  it("uses the supplied arrival time to bound post-arrival monitoring", () => {
    expect(
      shouldPollFlight(
        flightAt("2026-09-01T22:00:00.000Z", {
          arrival: "2026-09-02T12:00:00.000Z",
          status: "tracking",
        }),
        now,
      ),
    ).toBe(true);
    expect(
      shouldPollFlight(
        flightAt("2026-09-01T21:59:59.000Z", {
          arrival: "2026-09-02T11:59:59.000Z",
          status: "tracking",
        }),
        now,
      ),
    ).toBe(false);
  });

  it("never polls a completed or cancelled flight", () => {
    expect(
      shouldPollFlight(
        flightAt("2026-09-02T17:00:00.000Z", { status: "completed" }),
        now,
      ),
    ).toBe(false);
    expect(
      shouldPollFlight(
        flightAt("2026-09-02T17:00:00.000Z", { status: "cancelled" }),
        now,
      ),
    ).toBe(false);
  });
});

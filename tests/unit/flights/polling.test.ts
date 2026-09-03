import {
  activeObservationIntervalMs,
  nextBackoffPollAt,
  nextScheduledPollAt,
} from "@/features/flights/scheduling";

describe("FlightSignal AirLabs polling schedule", () => {
  const now = new Date("2026-09-02T18:00:00.000Z");

  it("waits locally until thirty minutes before departure", () => {
    expect(
      nextScheduledPollAt({
        now,
        phase: "scheduled",
        timing: {
          scheduledDepartureAt: new Date("2026-09-03T00:00:00.000Z"),
        },
      }),
    ).toEqual(new Date("2026-09-02T23:30:00.000Z"));
  });

  it("checks at T-30, T-15, and departure without overshooting", () => {
    const departure = new Date("2026-09-02T18:30:00.000Z");
    const timing = { scheduledDepartureAt: departure };
    const first = nextScheduledPollAt({ now, phase: "scheduled", timing });
    const second = nextScheduledPollAt({
      now: first!,
      phase: "scheduled",
      timing,
    });

    expect(first).toEqual(new Date("2026-09-02T18:15:00.000Z"));
    expect(second).toEqual(departure);
  });

  it.each([
    [120, 1],
    [360, 3],
    [720, 6],
  ])(
    "targets 120 observations across a %i minute flight",
    (duration, minutes) => {
      expect(
        activeObservationIntervalMs({
          scheduledDepartureAt: now,
          durationMinutes: duration,
        }),
      ).toBe(minutes * 60_000);
    },
  );

  it("stops completely for landed and cancelled flights", () => {
    const timing = { scheduledDepartureAt: now, durationMinutes: 120 };
    expect(nextScheduledPollAt({ now, phase: "landed", timing })).toBeNull();
    expect(nextScheduledPollAt({ now, phase: "cancelled", timing })).toBeNull();
  });

  it("backs off exponentially after transient source errors", () => {
    const timing = { scheduledDepartureAt: now, durationMinutes: 120 };
    expect(
      nextBackoffPollAt({
        now,
        phase: "active",
        timing,
        consecutiveErrors: 3,
      }),
    ).toEqual(new Date("2026-09-02T18:04:00.000Z"));
  });
});

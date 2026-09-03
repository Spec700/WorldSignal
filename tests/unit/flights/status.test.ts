import { deriveFlightDisplayStatus } from "@/features/flights/status";

describe("FlightSignal display status", () => {
  const now = new Date("2026-09-02T18:00:00.000Z");
  const base = {
    trackingStatus: "tracking" as const,
    scheduledDepartureAt: "2026-09-02T17:00:00.000Z",
    now,
  };

  it("distinguishes live airborne and on-ground aircraft", () => {
    expect(
      deriveFlightDisplayStatus({
        ...base,
        latestObservation: {
          onGround: false,
          sourceObservedAt: "2026-09-02T17:59:30.000Z",
        },
      }),
    ).toBe("live_airborne");
    expect(
      deriveFlightDisplayStatus({
        ...base,
        latestObservation: {
          onGround: true,
          sourceObservedAt: "2026-09-02T17:59:30.000Z",
        },
      }),
    ).toBe("live_ground");
  });

  it("marks an old aircraft observation as stale", () => {
    expect(
      deriveFlightDisplayStatus({
        ...base,
        latestObservation: {
          onGround: false,
          sourceObservedAt: "2026-09-02T17:55:00.000Z",
        },
      }),
    ).toBe("signal_stale");
  });

  it("shows a failed latest source poll ahead of stale data", () => {
    expect(
      deriveFlightDisplayStatus({
        ...base,
        latestObservation: {
          onGround: false,
          sourceObservedAt: "2026-09-02T17:55:00.000Z",
        },
        lastPolledAt: "2026-09-02T17:59:50.000Z",
        lastSuccessfulPollAt: "2026-09-02T17:58:00.000Z",
        lastSourceError: "AirLabs could not be reached.",
      }),
    ).toBe("source_error");
  });

  it("does not convert possible arrival into a confirmed completion", () => {
    expect(
      deriveFlightDisplayStatus({
        ...base,
        trackingStatus: "possible_arrival",
        latestObservation: {
          onGround: true,
          sourceObservedAt: "2026-09-02T17:59:30.000Z",
        },
      }),
    ).toBe("possible_arrival");
  });

  it("waits until the acquisition window before reporting a missing signal", () => {
    expect(
      deriveFlightDisplayStatus({
        ...base,
        trackingStatus: "scheduled",
        scheduledDepartureAt: "2026-09-03T12:00:00.000Z",
      }),
    ).toBe("scheduled");
    expect(
      deriveFlightDisplayStatus({
        ...base,
        trackingStatus: "scheduled",
        scheduledDepartureAt: "2026-09-02T18:20:00.000Z",
      }),
    ).toBe("awaiting_signal");
  });

  it("allows the planned interval for a long-haul flight before marking data stale", () => {
    expect(
      deriveFlightDisplayStatus({
        ...base,
        durationMinutes: 720,
        latestObservation: {
          onGround: false,
          sourceObservedAt: "2026-09-02T17:50:00.000Z",
        },
      }),
    ).toBe("live_airborne");
  });
});

import type {
  FlightDisplayStatus,
  FlightObservationDto,
  FlightTrackingStatus,
} from "./types";
import { activeObservationIntervalMs } from "./scheduling";

export const FLIGHT_SIGNAL_STALE_AFTER_MS = 2 * 60 * 1_000;
export const FLIGHT_SIGNAL_ACQUISITION_WINDOW_MS = 30 * 60 * 1_000;

export function deriveFlightDisplayStatus(input: {
  trackingStatus: FlightTrackingStatus;
  scheduledDepartureAt: string;
  latestObservation?: Pick<
    FlightObservationDto,
    "onGround" | "sourceObservedAt"
  >;
  lastPolledAt?: string;
  lastSuccessfulPollAt?: string;
  lastSourceError?: string;
  durationMinutes?: number;
  now: Date;
}): FlightDisplayStatus {
  if (input.trackingStatus === "completed") {
    return "completed";
  }
  if (input.trackingStatus === "cancelled") {
    return "cancelled";
  }
  if (input.trackingStatus === "possible_arrival") {
    return "possible_arrival";
  }

  const lastPollFailed =
    input.lastSourceError &&
    input.lastPolledAt &&
    (!input.lastSuccessfulPollAt ||
      Date.parse(input.lastPolledAt) > Date.parse(input.lastSuccessfulPollAt));
  if (lastPollFailed) {
    return "source_error";
  }

  if (input.trackingStatus === "match_required") {
    return "match_required";
  }

  if (!input.latestObservation) {
    const acquisitionStartsAt =
      Date.parse(input.scheduledDepartureAt) -
      FLIGHT_SIGNAL_ACQUISITION_WINDOW_MS;
    return input.now.getTime() >= acquisitionStartsAt
      ? "awaiting_signal"
      : "scheduled";
  }

  const expectedInterval = activeObservationIntervalMs({
    scheduledDepartureAt: new Date(input.scheduledDepartureAt),
    durationMinutes: input.durationMinutes,
  });
  const staleAfterMs = Math.max(
    FLIGHT_SIGNAL_STALE_AFTER_MS,
    expectedInterval * 2.5,
  );
  if (
    input.now.getTime() - Date.parse(input.latestObservation.sourceObservedAt) >
    staleAfterMs
  ) {
    return "signal_stale";
  }

  return input.latestObservation.onGround ? "live_ground" : "live_airborne";
}

import type { AirLabsFlightPhase } from "@/lib/sources/airlabs/adapter";

const MINUTE_MS = 60_000;
const PREDEPARTURE_WINDOW_MS = 30 * MINUTE_MS;
const PREDEPARTURE_INTERVAL_MS = 15 * MINUTE_MS;
const TARGET_ACTIVE_OBSERVATIONS = 120;
const MAX_ACTIVE_INTERVAL_MS = 10 * MINUTE_MS;
const MAX_ACTIVE_BACKOFF_MS = 30 * MINUTE_MS;
const MAX_PREDEPARTURE_BACKOFF_MS = 2 * 60 * MINUTE_MS;

export interface FlightScheduleTiming {
  scheduledDepartureAt: Date;
  scheduledArrivalAt?: Date | null;
  estimatedDepartureAt?: Date | null;
  estimatedArrivalAt?: Date | null;
  durationMinutes?: number | null;
}

function positiveDurationMs(timing: FlightScheduleTiming): number {
  if (timing.durationMinutes && timing.durationMinutes > 0) {
    return timing.durationMinutes * MINUTE_MS;
  }

  const arrival = timing.estimatedArrivalAt ?? timing.scheduledArrivalAt;
  const duration = arrival
    ? arrival.getTime() - timing.scheduledDepartureAt.getTime()
    : 2 * 60 * MINUTE_MS;
  return duration > 0 ? duration : 2 * 60 * MINUTE_MS;
}

export function activeObservationIntervalMs(
  timing: FlightScheduleTiming,
): number {
  const targetInterval =
    positiveDurationMs(timing) / TARGET_ACTIVE_OBSERVATIONS;
  return Math.min(
    MAX_ACTIVE_INTERVAL_MS,
    Math.max(MINUTE_MS, Math.ceil(targetInterval / MINUTE_MS) * MINUTE_MS),
  );
}

export function nextScheduledPollAt(options: {
  now: Date;
  phase: AirLabsFlightPhase;
  timing: FlightScheduleTiming;
}): Date | null {
  if (options.phase === "landed" || options.phase === "cancelled") {
    return null;
  }

  if (options.phase === "active") {
    return new Date(
      options.now.getTime() + activeObservationIntervalMs(options.timing),
    );
  }

  const departure =
    options.timing.estimatedDepartureAt ?? options.timing.scheduledDepartureAt;
  const untilDeparture = departure.getTime() - options.now.getTime();
  if (untilDeparture > PREDEPARTURE_WINDOW_MS) {
    return new Date(departure.getTime() - PREDEPARTURE_WINDOW_MS);
  }
  if (untilDeparture > 0) {
    return new Date(
      Math.min(
        departure.getTime(),
        options.now.getTime() + PREDEPARTURE_INTERVAL_MS,
      ),
    );
  }

  return new Date(options.now.getTime() + PREDEPARTURE_INTERVAL_MS);
}

export function nextBackoffPollAt(options: {
  now: Date;
  phase: AirLabsFlightPhase;
  timing: FlightScheduleTiming;
  consecutiveErrors: number;
}): Date {
  const baseInterval =
    options.phase === "active"
      ? activeObservationIntervalMs(options.timing)
      : PREDEPARTURE_INTERVAL_MS;
  const exponent = Math.max(0, Math.min(6, options.consecutiveErrors - 1));
  const maximum =
    options.phase === "active"
      ? MAX_ACTIVE_BACKOFF_MS
      : MAX_PREDEPARTURE_BACKOFF_MS;
  return new Date(
    options.now.getTime() +
      Math.min(maximum, baseInterval * Math.pow(2, exponent)),
  );
}

export const FLIGHT_MANUAL_REFRESH_COOLDOWN_MS = 60_000;

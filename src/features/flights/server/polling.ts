import { and, desc, eq, inArray } from "drizzle-orm";

import { distanceBetweenPointsKm } from "@/lib/geo/proximity";
import { getDatabase } from "@/lib/db/client";
import { flightInstances, flightObservations } from "@/lib/db/schema";
import {
  AdsbLolAdapter,
  type AdsbLolObservation,
} from "@/lib/sources/adsb-lol/adapter";
import { asSourceFetchError } from "@/lib/sources/errors";

const ACQUISITION_LEAD_MS = 6 * 60 * 60 * 1_000;
const DEFAULT_MONITORING_TAIL_MS = 30 * 60 * 60 * 1_000;
const ARRIVAL_MONITORING_TAIL_MS = 6 * 60 * 60 * 1_000;
const POSSIBLE_ARRIVAL_RADIUS_KM = 10;

type FlightRow = typeof flightInstances.$inferSelect;

export interface FlightPollSummary {
  eligible: number;
  attempted: number;
  successful: number;
  failed: number;
  observationsStored: number;
}

export function shouldPollFlight(flight: FlightRow, now: Date): boolean {
  if (
    flight.trackingStatus === "completed" ||
    flight.trackingStatus === "cancelled"
  ) {
    return false;
  }

  const startsAt = flight.scheduledDepartureAt.getTime() - ACQUISITION_LEAD_MS;
  const endsAt = flight.scheduledArrivalAt
    ? flight.scheduledArrivalAt.getTime() + ARRIVAL_MONITORING_TAIL_MS
    : flight.scheduledDepartureAt.getTime() + DEFAULT_MONITORING_TAIL_MS;
  return now.getTime() >= startsAt && now.getTime() <= endsAt;
}

export async function pollTrackedFlights(options: {
  signal: AbortSignal;
  now?: Date;
  adapter?: AdsbLolAdapter;
}): Promise<FlightPollSummary> {
  const database = getDatabase();
  const now = options.now ?? new Date();
  const adapter = options.adapter ?? new AdsbLolAdapter();
  const flightRows = await database
    .select()
    .from(flightInstances)
    .where(
      inArray(flightInstances.trackingStatus, [
        "scheduled",
        "match_required",
        "tracking",
        "possible_arrival",
      ]),
    );
  const eligibleFlights = flightRows.filter((flight) =>
    shouldPollFlight(flight, now),
  );
  const summary: FlightPollSummary = {
    eligible: eligibleFlights.length,
    attempted: 0,
    successful: 0,
    failed: 0,
    observationsStored: 0,
  };

  for (const flight of eligibleFlights) {
    if (options.signal.aborted) {
      break;
    }

    summary.attempted += 1;
    let observations: AdsbLolObservation[];
    try {
      observations = flight.aircraftIcaoHex
        ? await adapter.fetchByIcao(flight.aircraftIcaoHex, options.signal)
        : await adapter.fetchByCallsign(flight.adsbCallsign, options.signal);
    } catch (error) {
      if (options.signal.aborted) {
        break;
      }
      const sourceError = asSourceFetchError(error);
      await database
        .update(flightInstances)
        .set({
          lastPolledAt: now,
          lastSourceError: sourceError.safeMessage,
          updatedAt: now,
        })
        .where(eq(flightInstances.id, flight.id));
      summary.failed += 1;
      continue;
    }

    const relevantObservations = flight.aircraftIcaoHex
      ? observations.filter(
          (observation) =>
            observation.aircraftIcaoHex === flight.aircraftIcaoHex,
        )
      : observations;
    let observationsStored = 0;

    await database.transaction(async (transaction) => {
      for (const observation of relevantObservations) {
        const [latestStored] = await transaction
          .select({ sourceObservedAt: flightObservations.sourceObservedAt })
          .from(flightObservations)
          .where(
            and(
              eq(flightObservations.flightInstanceId, flight.id),
              eq(
                flightObservations.aircraftIcaoHex,
                observation.aircraftIcaoHex,
              ),
            ),
          )
          .orderBy(desc(flightObservations.sourceObservedAt))
          .limit(1);
        const sourceObservedAt = new Date(observation.sourceObservedAt);
        if (
          latestStored &&
          latestStored.sourceObservedAt.getTime() >= sourceObservedAt.getTime()
        ) {
          continue;
        }

        await transaction.insert(flightObservations).values({
          flightInstanceId: flight.id,
          aircraftIcaoHex: observation.aircraftIcaoHex,
          callsign: observation.callsign,
          registration: observation.registration,
          aircraftType: observation.aircraftType,
          latitude: observation.latitude,
          longitude: observation.longitude,
          barometricAltitudeFeet: observation.barometricAltitudeFeet,
          geometricAltitudeFeet: observation.geometricAltitudeFeet,
          groundSpeedKnots: observation.groundSpeedKnots,
          trackDegrees: observation.trackDegrees,
          verticalRateFeetPerMinute: observation.verticalRateFeetPerMinute,
          squawk: observation.squawk,
          onGround: observation.onGround,
          sourceObservedAt,
          retrievedAt: new Date(observation.retrievedAt),
        });
        observationsStored += 1;
      }

      const confirmedObservation = flight.aircraftIcaoHex
        ? relevantObservations.find(
            (observation) =>
              observation.aircraftIcaoHex === flight.aircraftIcaoHex,
          )
        : undefined;
      const possibleArrival =
        confirmedObservation?.onGround === true &&
        confirmedObservation.latitude !== undefined &&
        confirmedObservation.longitude !== undefined &&
        distanceBetweenPointsKm(
          {
            latitude: confirmedObservation.latitude,
            longitude: confirmedObservation.longitude,
          },
          {
            latitude: flight.destinationLatitude,
            longitude: flight.destinationLongitude,
          },
        ) <= POSSIBLE_ARRIVAL_RADIUS_KM &&
        now.getTime() >= flight.scheduledDepartureAt.getTime();
      const trackingStatus = flight.aircraftIcaoHex
        ? flight.trackingStatus === "possible_arrival" || possibleArrival
          ? "possible_arrival"
          : "tracking"
        : relevantObservations.length > 0
          ? "match_required"
          : flight.trackingStatus;

      await transaction
        .update(flightInstances)
        .set({
          trackingStatus,
          lastPolledAt: now,
          lastSuccessfulPollAt: now,
          lastSourceError: null,
          updatedAt: now,
        })
        .where(eq(flightInstances.id, flight.id));
    });

    summary.successful += 1;
    summary.observationsStored += observationsStored;
  }

  return summary;
}

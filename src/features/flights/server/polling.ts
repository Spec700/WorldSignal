import { and, desc, eq, inArray, isNotNull, lte } from "drizzle-orm";

import {
  FLIGHT_MANUAL_REFRESH_COOLDOWN_MS,
  nextBackoffPollAt,
  nextScheduledPollAt,
} from "@/features/flights/scheduling";
import {
  AirLabsRequestDeniedError,
  fetchAirLabsFlightForWorkspace,
  type AirLabsRequestKind,
} from "@/features/flights/server/airlabs-source";
import {
  FlightSignalNotFoundError,
  FlightSignalWorkflowError,
} from "@/features/flights/server/workflows";
import { getDatabase } from "@/lib/db/client";
import {
  activityLog,
  flightAssignments,
  flightInstances,
  flightObservations,
} from "@/lib/db/schema";
import {
  AirLabsAdapter,
  type AirLabsFlightPhase,
  type AirLabsFlightSnapshot,
} from "@/lib/sources/airlabs/adapter";
import { AirLabsSourceError } from "@/lib/sources/airlabs/errors";

const FLIGHT_MATCH_TOLERANCE_MS = 18 * 60 * 60 * 1_000;
const PAUSED_RECHECK_MS = 15 * 60 * 1_000;

type FlightRow = typeof flightInstances.$inferSelect;
type FlightDatabase = ReturnType<typeof getDatabase>;

export interface FlightPollSummary {
  eligible: number;
  attempted: number;
  successful: number;
  failed: number;
  denied: number;
  observationsStored: number;
}

export function shouldPollFlight(flight: FlightRow, now: Date): boolean {
  return (
    !["completed", "cancelled"].includes(flight.trackingStatus) &&
    flight.providerStatus !== null &&
    flight.nextPollAt !== null &&
    flight.nextPollAt <= now
  );
}

function timingFromFlight(flight: FlightRow) {
  return {
    scheduledDepartureAt: flight.scheduledDepartureAt,
    scheduledArrivalAt: flight.scheduledArrivalAt,
    estimatedDepartureAt: flight.estimatedDepartureAt,
    estimatedArrivalAt: flight.estimatedArrivalAt,
    durationMinutes: flight.durationMinutes,
  };
}

function phaseFromFlight(flight: FlightRow): AirLabsFlightPhase {
  if (flight.trackingStatus === "possible_arrival") {
    return "landed";
  }
  if (flight.trackingStatus === "tracking") {
    return "active";
  }
  return "scheduled";
}

function assertSameDatedFlight(
  flight: FlightRow,
  snapshot: AirLabsFlightSnapshot,
) {
  const departureDifference = Math.abs(
    new Date(snapshot.scheduledDepartureAt).getTime() -
      flight.scheduledDepartureAt.getTime(),
  );
  if (
    snapshot.origin.iata !== flight.originIata ||
    snapshot.destination.iata !== flight.destinationIata ||
    departureDifference > FLIGHT_MATCH_TOLERANCE_MS
  ) {
    throw new AirLabsSourceError(
      "schema",
      "AirLabs returned a different dated itinerary for this flight number. Monitoring backed off without replacing the confirmed trip.",
      "backoff",
      "DATED_FLIGHT_MISMATCH",
    );
  }
}

async function storeObservation(
  transaction: Parameters<Parameters<FlightDatabase["transaction"]>[0]>[0],
  flightId: string,
  snapshot: AirLabsFlightSnapshot,
): Promise<number> {
  const observation = snapshot.observation;
  if (!observation) {
    return 0;
  }

  const sourceObservedAt = new Date(observation.sourceObservedAt);
  const [latestStored] = await transaction
    .select({ sourceObservedAt: flightObservations.sourceObservedAt })
    .from(flightObservations)
    .where(eq(flightObservations.flightInstanceId, flightId))
    .orderBy(desc(flightObservations.sourceObservedAt))
    .limit(1);
  if (
    latestStored &&
    latestStored.sourceObservedAt.getTime() >= sourceObservedAt.getTime()
  ) {
    return 0;
  }

  await transaction.insert(flightObservations).values({
    flightInstanceId: flightId,
    source: "airlabs",
    ...observation,
    sourceObservedAt,
    retrievedAt: new Date(observation.retrievedAt),
  });
  return 1;
}

async function storeSuccessfulPoll(
  database: FlightDatabase,
  flight: FlightRow,
  snapshot: AirLabsFlightSnapshot,
  now: Date,
): Promise<number> {
  assertSameDatedFlight(flight, snapshot);
  const scheduledArrivalAt = snapshot.scheduledArrivalAt
    ? new Date(snapshot.scheduledArrivalAt)
    : flight.scheduledArrivalAt;
  const estimatedDepartureAt = snapshot.estimatedDepartureAt
    ? new Date(snapshot.estimatedDepartureAt)
    : null;
  const estimatedArrivalAt = snapshot.estimatedArrivalAt
    ? new Date(snapshot.estimatedArrivalAt)
    : null;
  const nextPollAt = nextScheduledPollAt({
    now,
    phase: snapshot.phase,
    timing: {
      scheduledDepartureAt: flight.scheduledDepartureAt,
      scheduledArrivalAt,
      estimatedDepartureAt,
      estimatedArrivalAt,
      durationMinutes: snapshot.durationMinutes ?? flight.durationMinutes,
    },
  });
  const trackingStatus =
    snapshot.phase === "cancelled"
      ? ("cancelled" as const)
      : snapshot.phase === "landed"
        ? ("possible_arrival" as const)
        : snapshot.phase === "active"
          ? ("tracking" as const)
          : flight.trackingStatus === "tracking"
            ? ("tracking" as const)
            : ("scheduled" as const);

  return database.transaction(async (transaction) => {
    const observationsStored = await storeObservation(
      transaction,
      flight.id,
      snapshot,
    );
    await transaction
      .update(flightInstances)
      .set({
        providerFlightIcao: snapshot.flightIcao ?? flight.providerFlightIcao,
        airlineIata: snapshot.airlineIata ?? flight.airlineIata,
        airlineIcao: snapshot.airlineIcao ?? flight.airlineIcao,
        airlineName: snapshot.airlineName ?? flight.airlineName,
        originIcao: snapshot.origin.icao,
        originName: snapshot.origin.name,
        originLatitude: snapshot.origin.latitude,
        originLongitude: snapshot.origin.longitude,
        destinationIcao: snapshot.destination.icao,
        destinationName: snapshot.destination.name,
        destinationLatitude: snapshot.destination.latitude,
        destinationLongitude: snapshot.destination.longitude,
        scheduledArrivalAt,
        estimatedDepartureAt,
        actualDepartureAt: snapshot.actualDepartureAt
          ? new Date(snapshot.actualDepartureAt)
          : flight.actualDepartureAt,
        estimatedArrivalAt,
        actualArrivalAt: snapshot.actualArrivalAt
          ? new Date(snapshot.actualArrivalAt)
          : flight.actualArrivalAt,
        departureTerminal:
          snapshot.departureTerminal ?? flight.departureTerminal,
        departureGate: snapshot.departureGate ?? flight.departureGate,
        destinationTerminal:
          snapshot.destinationTerminal ?? flight.destinationTerminal,
        destinationGate: snapshot.destinationGate ?? flight.destinationGate,
        destinationBaggage:
          snapshot.destinationBaggage ?? flight.destinationBaggage,
        departureDelayMinutes:
          snapshot.departureDelayMinutes !== undefined
            ? Math.round(snapshot.departureDelayMinutes)
            : flight.departureDelayMinutes,
        arrivalDelayMinutes:
          snapshot.arrivalDelayMinutes !== undefined
            ? Math.round(snapshot.arrivalDelayMinutes)
            : flight.arrivalDelayMinutes,
        durationMinutes:
          snapshot.durationMinutes !== undefined
            ? Math.round(snapshot.durationMinutes)
            : flight.durationMinutes,
        progressPercent: snapshot.progressPercent ?? flight.progressPercent,
        etaMinutes:
          snapshot.etaMinutes !== undefined
            ? Math.round(snapshot.etaMinutes)
            : flight.etaMinutes,
        providerStatus: snapshot.providerStatus,
        trackingStatus,
        aircraftIcaoHex: snapshot.aircraftIcaoHex ?? flight.aircraftIcaoHex,
        aircraftRegistration:
          snapshot.aircraftRegistration ?? flight.aircraftRegistration,
        aircraftType: snapshot.aircraftType ?? flight.aircraftType,
        aircraftModel: snapshot.aircraftModel ?? flight.aircraftModel,
        aircraftManufacturer:
          snapshot.aircraftManufacturer ?? flight.aircraftManufacturer,
        aircraftResolvedAt:
          snapshot.aircraftIcaoHex && !flight.aircraftResolvedAt
            ? new Date(snapshot.retrievedAt)
            : flight.aircraftResolvedAt,
        lastPolledAt: now,
        lastSuccessfulPollAt: now,
        nextPollAt,
        consecutiveSourceErrors: 0,
        sourceErrorCode: null,
        lastSourceError: null,
        updatedAt: now,
      })
      .where(eq(flightInstances.id, flight.id));

    if (
      snapshot.phase === "landed" &&
      flight.trackingStatus !== "possible_arrival"
    ) {
      await transaction.insert(activityLog).values({
        workspaceId: flight.workspaceId,
        action: "flight.arrival_observed",
        entityType: "flight_instance",
        entityId: flight.id,
        summary: `AirLabs reported ${flight.passengerFlightNumber} landed. Monitoring stopped pending traveler completion.`,
        metadata: {
          provider: "airlabs",
          providerStatus: snapshot.providerStatus,
        },
      });
    }

    if (
      snapshot.phase === "cancelled" &&
      flight.trackingStatus !== "cancelled"
    ) {
      await transaction
        .update(flightAssignments)
        .set({ status: "cancelled", updatedAt: now })
        .where(
          and(
            eq(flightAssignments.flightInstanceId, flight.id),
            inArray(flightAssignments.status, ["planned", "onboard_confirmed"]),
          ),
        );
      await transaction.insert(activityLog).values({
        workspaceId: flight.workspaceId,
        action: "flight.cancelled_by_source",
        entityType: "flight_instance",
        entityId: flight.id,
        summary: `AirLabs reported ${flight.passengerFlightNumber} cancelled. Monitoring and open traveler assignments were closed.`,
        metadata: {
          provider: "airlabs",
          providerStatus: snapshot.providerStatus,
        },
      });
    }

    return observationsStored;
  });
}

async function storeFailedPoll(
  database: FlightDatabase,
  flight: FlightRow,
  error: unknown,
  now: Date,
) {
  const denied = error instanceof AirLabsRequestDeniedError;
  const sourceError = error instanceof AirLabsSourceError ? error : undefined;
  const consecutiveSourceErrors = denied
    ? flight.consecutiveSourceErrors
    : flight.consecutiveSourceErrors + 1;
  const nextPollAt = denied
    ? new Date(now.getTime() + PAUSED_RECHECK_MS)
    : nextBackoffPollAt({
        now,
        phase: phaseFromFlight(flight),
        timing: timingFromFlight(flight),
        consecutiveErrors: consecutiveSourceErrors,
      });
  const safeMessage = denied
    ? error.message
    : (sourceError?.safeMessage ??
      "AirLabs returned an unexpected error. FlightSignal backed off safely.");
  const sourceErrorCode = denied
    ? error.reason
    : (sourceError?.providerCode ?? sourceError?.code ?? "unknown");

  await database
    .update(flightInstances)
    .set({
      lastPolledAt: now,
      nextPollAt,
      consecutiveSourceErrors,
      sourceErrorCode,
      lastSourceError: safeMessage,
      updatedAt: now,
    })
    .where(eq(flightInstances.id, flight.id));
}

async function pollFlight(options: {
  database: FlightDatabase;
  flight: FlightRow;
  kind: AirLabsRequestKind;
  signal: AbortSignal;
  now: Date;
  adapter?: AirLabsAdapter;
}) {
  try {
    const snapshot = await fetchAirLabsFlightForWorkspace({
      workspaceId: options.flight.workspaceId,
      passengerFlightNumber: options.flight.passengerFlightNumber,
      kind: options.kind,
      signal: options.signal,
      now: options.now,
      adapter: options.adapter,
    });
    const observationsStored = await storeSuccessfulPoll(
      options.database,
      options.flight,
      snapshot,
      options.now,
    );
    return { successful: true, denied: false, observationsStored };
  } catch (error) {
    if (options.signal.aborted) {
      throw error;
    }
    await storeFailedPoll(options.database, options.flight, error, options.now);
    return {
      successful: false,
      denied: error instanceof AirLabsRequestDeniedError,
      observationsStored: 0,
    };
  }
}

export async function pollTrackedFlights(options: {
  signal: AbortSignal;
  now?: Date;
  adapter?: AirLabsAdapter;
}): Promise<FlightPollSummary> {
  const database = getDatabase();
  const now = options.now ?? new Date();
  const flightRows = await database
    .select()
    .from(flightInstances)
    .where(
      and(
        inArray(flightInstances.trackingStatus, [
          "scheduled",
          "match_required",
          "tracking",
          "possible_arrival",
        ]),
        isNotNull(flightInstances.providerStatus),
        isNotNull(flightInstances.nextPollAt),
        lte(flightInstances.nextPollAt, now),
      ),
    );
  const eligibleFlights = flightRows.filter((flight) =>
    shouldPollFlight(flight, now),
  );
  const summary: FlightPollSummary = {
    eligible: eligibleFlights.length,
    attempted: 0,
    successful: 0,
    failed: 0,
    denied: 0,
    observationsStored: 0,
  };

  for (const flight of eligibleFlights) {
    if (options.signal.aborted) {
      break;
    }
    summary.attempted += 1;
    const result = await pollFlight({
      database,
      flight,
      kind: "automation",
      signal: options.signal,
      now,
      adapter: options.adapter,
    });
    if (result.successful) {
      summary.successful += 1;
      summary.observationsStored += result.observationsStored;
    } else {
      summary.failed += 1;
      summary.denied += result.denied ? 1 : 0;
    }
  }

  return summary;
}

export async function refreshTrackedFlight(
  flightInstanceId: string,
  options: {
    signal: AbortSignal;
    now?: Date;
    adapter?: AirLabsAdapter;
  },
) {
  const database = getDatabase();
  const now = options.now ?? new Date();
  const [flight] = await database
    .select()
    .from(flightInstances)
    .where(eq(flightInstances.id, flightInstanceId))
    .limit(1);
  if (!flight) {
    throw new FlightSignalNotFoundError(
      "The selected tracked flight no longer exists.",
    );
  }
  if (["completed", "cancelled"].includes(flight.trackingStatus)) {
    throw new FlightSignalWorkflowError("A closed flight cannot be refreshed.");
  }
  if (!flight.providerStatus) {
    throw new FlightSignalWorkflowError(
      "This pre-AirLabs assignment must be recreated before it can be refreshed.",
    );
  }
  if (
    flight.lastPolledAt &&
    now.getTime() - flight.lastPolledAt.getTime() <
      FLIGHT_MANUAL_REFRESH_COOLDOWN_MS
  ) {
    throw new FlightSignalWorkflowError(
      "AirLabs was checked less than one minute ago. Wait for the refresh cooldown.",
    );
  }

  const result = await pollFlight({
    database,
    flight,
    kind: "interactive",
    signal: options.signal,
    now,
    adapter: options.adapter,
  });
  if (!result.successful) {
    const [updated] = await database
      .select({ lastSourceError: flightInstances.lastSourceError })
      .from(flightInstances)
      .where(eq(flightInstances.id, flight.id))
      .limit(1);
    throw new FlightSignalWorkflowError(
      updated?.lastSourceError ?? "AirLabs could not refresh this flight.",
    );
  }

  return { flightInstanceId: flight.id };
}

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  changeFlightAssignmentInputSchema,
  createFlightTrackingInputSchema,
  type CreateFlightTrackingInput,
} from "@/features/flights/domain";
import { nextScheduledPollAt } from "@/features/flights/scheduling";
import {
  FlightLookupTokenError,
  openFlightLookup,
} from "@/features/flights/server/confirmation-token";
import { getDatabase } from "@/lib/db/client";
import {
  activityLog,
  flightAssignments,
  flightInstances,
  flightObservations,
  operators,
  protectees,
  workspaces,
} from "@/lib/db/schema";

export class FlightSignalWorkflowError extends Error {}
export class FlightSignalConflictError extends FlightSignalWorkflowError {}
export class FlightSignalNotFoundError extends FlightSignalWorkflowError {}

type FlightDatabase = ReturnType<typeof getDatabase>;
const workspaceSlug = () => process.env.CREDSIGNAL_WORKSPACE_SLUG ?? "local";

async function getLocalWorkspace() {
  const database = getDatabase();
  const [workspace] = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug()))
    .limit(1);

  if (!workspace) {
    throw new FlightSignalNotFoundError(
      "Priority Signals has not been initialized. Run the database seed command first.",
    );
  }

  return { database, workspace };
}

async function resolveActor(workspaceId: string, requestedOperatorId?: string) {
  if (!requestedOperatorId) {
    return undefined;
  }

  const database = getDatabase();
  const [operator] = await database
    .select()
    .from(operators)
    .where(
      and(
        eq(operators.id, z.string().uuid().parse(requestedOperatorId)),
        eq(operators.workspaceId, workspaceId),
        eq(operators.status, "active"),
      ),
    )
    .limit(1);

  if (!operator) {
    throw new FlightSignalNotFoundError(
      "The selected operator is not active in this workspace.",
    );
  }

  return operator;
}

async function requirePerson(
  database: FlightDatabase,
  workspaceId: string,
  personId: string,
  requireActive = true,
) {
  const [person] = await database
    .select()
    .from(protectees)
    .where(
      and(
        eq(protectees.id, z.string().uuid().parse(personId)),
        eq(protectees.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!person) {
    throw new FlightSignalNotFoundError(
      "The selected person no longer exists in this workspace.",
    );
  }
  if (requireActive && person.status !== "active") {
    throw new FlightSignalWorkflowError(
      "Only active people can be assigned to a tracked flight.",
    );
  }

  return person;
}

async function requireFlight(
  database: FlightDatabase,
  workspaceId: string,
  flightInstanceId: string,
) {
  const [flight] = await database
    .select()
    .from(flightInstances)
    .where(
      and(
        eq(flightInstances.id, z.string().uuid().parse(flightInstanceId)),
        eq(flightInstances.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!flight) {
    throw new FlightSignalNotFoundError(
      "The selected tracked flight no longer exists in this workspace.",
    );
  }

  return flight;
}

async function requireAssignment(
  database: FlightDatabase,
  workspaceId: string,
  assignmentId: string,
) {
  const [assignment] = await database
    .select()
    .from(flightAssignments)
    .where(
      and(
        eq(flightAssignments.id, z.string().uuid().parse(assignmentId)),
        eq(flightAssignments.workspaceId, workspaceId),
      ),
    )
    .limit(1);

  if (!assignment) {
    throw new FlightSignalNotFoundError(
      "The selected flight assignment no longer exists in this workspace.",
    );
  }

  return assignment;
}

export async function createTrackedFlight(
  rawInput: CreateFlightTrackingInput,
  actorOperatorId?: string,
) {
  const input = createFlightTrackingInputSchema.parse(rawInput);
  let resolvedFlight;
  try {
    resolvedFlight = openFlightLookup(input.confirmationToken);
  } catch (error) {
    if (error instanceof FlightLookupTokenError) {
      throw new FlightSignalWorkflowError(error.message);
    }
    throw error;
  }
  if (
    resolvedFlight.phase === "landed" ||
    resolvedFlight.phase === "cancelled"
  ) {
    throw new FlightSignalWorkflowError(
      "This AirLabs flight is already closed and cannot receive a new traveler assignment.",
    );
  }
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const person = await requirePerson(database, workspace.id, input.personId);
  const scheduledDepartureAt = new Date(resolvedFlight.scheduledDepartureAt);
  const scheduledArrivalAt = resolvedFlight.scheduledArrivalAt
    ? new Date(resolvedFlight.scheduledArrivalAt)
    : undefined;
  const [existingFlight] = await database
    .select()
    .from(flightInstances)
    .where(
      and(
        eq(flightInstances.workspaceId, workspace.id),
        eq(
          flightInstances.passengerFlightNumber,
          resolvedFlight.passengerFlightNumber,
        ),
        eq(flightInstances.scheduledDepartureAt, scheduledDepartureAt),
        eq(flightInstances.originIata, resolvedFlight.origin.iata),
        eq(flightInstances.destinationIata, resolvedFlight.destination.iata),
      ),
    )
    .limit(1);

  if (
    existingFlight?.trackingStatus === "completed" ||
    existingFlight?.trackingStatus === "cancelled"
  ) {
    throw new FlightSignalConflictError(
      "This dated flight has already been closed. Choose the correct departure time before assigning it again.",
    );
  }

  if (existingFlight) {
    const [existingAssignment] = await database
      .select({ id: flightAssignments.id })
      .from(flightAssignments)
      .where(
        and(
          eq(flightAssignments.flightInstanceId, existingFlight.id),
          eq(flightAssignments.protecteeId, person.id),
        ),
      )
      .limit(1);
    if (existingAssignment) {
      throw new FlightSignalConflictError(
        `${person.displayName} is already assigned to this dated flight.`,
      );
    }
  }

  return database.transaction(async (transaction) => {
    const now = new Date();
    const estimatedDepartureAt = resolvedFlight.estimatedDepartureAt
      ? new Date(resolvedFlight.estimatedDepartureAt)
      : undefined;
    const estimatedArrivalAt = resolvedFlight.estimatedArrivalAt
      ? new Date(resolvedFlight.estimatedArrivalAt)
      : undefined;
    const nextPollAt = nextScheduledPollAt({
      now,
      phase: resolvedFlight.phase,
      timing: {
        scheduledDepartureAt,
        scheduledArrivalAt,
        estimatedDepartureAt,
        estimatedArrivalAt,
        durationMinutes: resolvedFlight.durationMinutes,
      },
    });
    const flightValues = {
      passengerFlightNumber: resolvedFlight.passengerFlightNumber,
      adsbCallsign:
        resolvedFlight.flightIcao ?? resolvedFlight.passengerFlightNumber,
      providerFlightIcao: resolvedFlight.flightIcao,
      airlineIata: resolvedFlight.airlineIata,
      airlineIcao: resolvedFlight.airlineIcao,
      airlineName: resolvedFlight.airlineName,
      originIata: resolvedFlight.origin.iata,
      originIcao: resolvedFlight.origin.icao,
      originName: resolvedFlight.origin.name,
      originLatitude: resolvedFlight.origin.latitude,
      originLongitude: resolvedFlight.origin.longitude,
      destinationIata: resolvedFlight.destination.iata,
      destinationIcao: resolvedFlight.destination.icao,
      destinationName: resolvedFlight.destination.name,
      destinationLatitude: resolvedFlight.destination.latitude,
      destinationLongitude: resolvedFlight.destination.longitude,
      scheduledDepartureAt,
      scheduledArrivalAt,
      estimatedDepartureAt,
      actualDepartureAt: resolvedFlight.actualDepartureAt
        ? new Date(resolvedFlight.actualDepartureAt)
        : undefined,
      estimatedArrivalAt,
      actualArrivalAt: resolvedFlight.actualArrivalAt
        ? new Date(resolvedFlight.actualArrivalAt)
        : undefined,
      departureTerminal: resolvedFlight.departureTerminal,
      departureGate: resolvedFlight.departureGate,
      destinationTerminal: resolvedFlight.destinationTerminal,
      destinationGate: resolvedFlight.destinationGate,
      destinationBaggage: resolvedFlight.destinationBaggage,
      departureDelayMinutes:
        resolvedFlight.departureDelayMinutes !== undefined
          ? Math.round(resolvedFlight.departureDelayMinutes)
          : undefined,
      arrivalDelayMinutes:
        resolvedFlight.arrivalDelayMinutes !== undefined
          ? Math.round(resolvedFlight.arrivalDelayMinutes)
          : undefined,
      durationMinutes: resolvedFlight.durationMinutes
        ? Math.round(resolvedFlight.durationMinutes)
        : undefined,
      progressPercent: resolvedFlight.progressPercent,
      etaMinutes:
        resolvedFlight.etaMinutes !== undefined
          ? Math.round(resolvedFlight.etaMinutes)
          : undefined,
      providerStatus: resolvedFlight.providerStatus,
      trackingStatus:
        resolvedFlight.phase === "active"
          ? ("tracking" as const)
          : ("scheduled" as const),
      aircraftIcaoHex: resolvedFlight.aircraftIcaoHex,
      aircraftRegistration: resolvedFlight.aircraftRegistration,
      aircraftType: resolvedFlight.aircraftType,
      aircraftModel: resolvedFlight.aircraftModel,
      aircraftManufacturer: resolvedFlight.aircraftManufacturer,
      aircraftResolvedAt: resolvedFlight.aircraftIcaoHex
        ? new Date(resolvedFlight.retrievedAt)
        : undefined,
      lastPolledAt: new Date(resolvedFlight.retrievedAt),
      lastSuccessfulPollAt: new Date(resolvedFlight.retrievedAt),
      nextPollAt,
      consecutiveSourceErrors: 0,
      sourceErrorCode: null,
      lastSourceError: null,
      notes: input.notes || null,
      updatedAt: now,
    };
    const flight = existingFlight
      ? (
          await transaction
            .update(flightInstances)
            .set(flightValues)
            .where(eq(flightInstances.id, existingFlight.id))
            .returning()
        )[0]
      : (
          await transaction
            .insert(flightInstances)
            .values({
              workspaceId: workspace.id,
              ...flightValues,
              createdByOperatorId: actor?.id,
            })
            .returning()
        )[0];

    if (resolvedFlight.observation) {
      const sourceObservedAt = new Date(
        resolvedFlight.observation.sourceObservedAt,
      );
      const [latestStored] = await transaction
        .select({ sourceObservedAt: flightObservations.sourceObservedAt })
        .from(flightObservations)
        .where(eq(flightObservations.flightInstanceId, flight.id))
        .orderBy(desc(flightObservations.sourceObservedAt))
        .limit(1);
      if (
        !latestStored ||
        latestStored.sourceObservedAt.getTime() < sourceObservedAt.getTime()
      ) {
        await transaction.insert(flightObservations).values({
          flightInstanceId: flight.id,
          source: "airlabs",
          ...resolvedFlight.observation,
          sourceObservedAt,
          retrievedAt: new Date(resolvedFlight.observation.retrievedAt),
        });
      }
    }

    const [assignment] = await transaction
      .insert(flightAssignments)
      .values({
        workspaceId: workspace.id,
        flightInstanceId: flight.id,
        protecteeId: person.id,
        assignedByOperatorId: actor?.id,
        notes: input.notes || null,
      })
      .returning();

    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "flight.assigned",
      entityType: "flight_assignment",
      entityId: assignment.id,
      summary: `${person.displayName} was assigned to ${flight.passengerFlightNumber} from ${flight.originIata} to ${flight.destinationIata}.`,
      metadata: {
        flightInstanceId: flight.id,
        personId: person.id,
        provider: "airlabs",
        providerFlightIcao: flight.providerFlightIcao,
        scheduledDepartureAt: flight.scheduledDepartureAt.toISOString(),
      },
    });

    return { flightInstanceId: flight.id, assignmentId: assignment.id };
  });
}

export async function confirmTravelerOnboard(
  rawInput: z.input<typeof changeFlightAssignmentInputSchema>,
  actorOperatorId?: string,
) {
  const input = changeFlightAssignmentInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const assignment = await requireAssignment(
    database,
    workspace.id,
    input.assignmentId,
  );
  const flight = await requireFlight(
    database,
    workspace.id,
    assignment.flightInstanceId,
  );
  const person = await requirePerson(
    database,
    workspace.id,
    assignment.protecteeId,
  );

  if (assignment.status !== "planned") {
    throw new FlightSignalWorkflowError(
      "Only a planned assignment can be confirmed onboard.",
    );
  }
  if (!flight.aircraftIcaoHex || !flight.aircraftResolvedAt) {
    throw new FlightSignalWorkflowError(
      "AirLabs has not yet linked this flight to an observed aircraft.",
    );
  }
  if (["completed", "cancelled"].includes(flight.trackingStatus)) {
    throw new FlightSignalWorkflowError(
      "A person cannot enter travel mode on a closed flight.",
    );
  }

  const [activeTravel] = await database
    .select({ id: flightAssignments.id })
    .from(flightAssignments)
    .where(
      and(
        eq(flightAssignments.protecteeId, person.id),
        eq(flightAssignments.status, "onboard_confirmed"),
      ),
    )
    .limit(1);
  if (activeTravel) {
    throw new FlightSignalConflictError(
      `${person.displayName} is already in active travel mode on another flight.`,
    );
  }

  const now = new Date();
  await database.transaction(async (transaction) => {
    await transaction
      .update(flightAssignments)
      .set({
        status: "onboard_confirmed",
        onboardConfirmedByOperatorId: actor?.id,
        onboardConfirmedAt: now,
        updatedAt: now,
      })
      .where(eq(flightAssignments.id, assignment.id));
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "flight.traveler_onboard_confirmed",
      entityType: "flight_assignment",
      entityId: assignment.id,
      summary: `${person.displayName} was confirmed onboard ${flight.passengerFlightNumber}; aircraft position now represents inferred presence.`,
      metadata: {
        flightInstanceId: flight.id,
        personId: person.id,
        aircraftIcaoHex: flight.aircraftIcaoHex,
      },
    });
  });

  return { flightInstanceId: flight.id, assignmentId: assignment.id };
}

export async function completeTravelerFlight(
  rawInput: z.input<typeof changeFlightAssignmentInputSchema>,
  actorOperatorId?: string,
) {
  const input = changeFlightAssignmentInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const assignment = await requireAssignment(
    database,
    workspace.id,
    input.assignmentId,
  );
  const flight = await requireFlight(
    database,
    workspace.id,
    assignment.flightInstanceId,
  );
  const person = await requirePerson(
    database,
    workspace.id,
    assignment.protecteeId,
    false,
  );

  if (assignment.status !== "onboard_confirmed") {
    throw new FlightSignalWorkflowError(
      "Only an onboard traveler can complete a flight.",
    );
  }
  if (flight.trackingStatus !== "possible_arrival") {
    throw new FlightSignalWorkflowError(
      "AirLabs has not reported a possible arrival for this flight.",
    );
  }

  const now = new Date();
  await database.transaction(async (transaction) => {
    await transaction
      .update(flightAssignments)
      .set({
        status: "completed",
        completedByOperatorId: actor?.id,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(flightAssignments.id, assignment.id));
    const siblingAssignments = await transaction
      .select({ id: flightAssignments.id, status: flightAssignments.status })
      .from(flightAssignments)
      .where(eq(flightAssignments.flightInstanceId, flight.id));
    const flightIsComplete = siblingAssignments.every(
      (item) =>
        item.id === assignment.id ||
        item.status === "completed" ||
        item.status === "cancelled",
    );
    if (flightIsComplete) {
      await transaction
        .update(flightInstances)
        .set({ trackingStatus: "completed", nextPollAt: null, updatedAt: now })
        .where(eq(flightInstances.id, flight.id));
    }
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "flight.travel_completed",
      entityType: "flight_assignment",
      entityId: assignment.id,
      summary: `${person.displayName}'s travel on ${flight.passengerFlightNumber} was completed by an operator.`,
      metadata: {
        flightInstanceId: flight.id,
        personId: person.id,
        approvedLocationUnchanged: true,
      },
    });
  });

  return { flightInstanceId: flight.id, assignmentId: assignment.id };
}

export async function cancelFlightAssignment(
  rawInput: z.input<typeof changeFlightAssignmentInputSchema>,
  actorOperatorId?: string,
) {
  const input = changeFlightAssignmentInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const assignment = await requireAssignment(
    database,
    workspace.id,
    input.assignmentId,
  );
  const flight = await requireFlight(
    database,
    workspace.id,
    assignment.flightInstanceId,
  );
  const person = await requirePerson(
    database,
    workspace.id,
    assignment.protecteeId,
    false,
  );

  if (assignment.status === "completed" || assignment.status === "cancelled") {
    throw new FlightSignalWorkflowError(
      "This flight assignment is already closed.",
    );
  }

  const now = new Date();
  await database.transaction(async (transaction) => {
    await transaction
      .update(flightAssignments)
      .set({ status: "cancelled", updatedAt: now })
      .where(eq(flightAssignments.id, assignment.id));
    const siblingAssignments = await transaction
      .select({ id: flightAssignments.id, status: flightAssignments.status })
      .from(flightAssignments)
      .where(eq(flightAssignments.flightInstanceId, flight.id));
    const noOpenAssignments = siblingAssignments.every(
      (item) =>
        item.id === assignment.id ||
        item.status === "completed" ||
        item.status === "cancelled",
    );
    if (noOpenAssignments) {
      await transaction
        .update(flightInstances)
        .set({ trackingStatus: "cancelled", nextPollAt: null, updatedAt: now })
        .where(eq(flightInstances.id, flight.id));
    }
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "flight.assignment_cancelled",
      entityType: "flight_assignment",
      entityId: assignment.id,
      summary: `${person.displayName}'s assignment to ${flight.passengerFlightNumber} was cancelled.`,
      metadata: { flightInstanceId: flight.id, personId: person.id },
    });
  });

  return { flightInstanceId: flight.id, assignmentId: assignment.id };
}

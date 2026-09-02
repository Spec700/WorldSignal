import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  changeFlightAssignmentInputSchema,
  confirmAircraftInputSchema,
  createFlightTrackingInputSchema,
  parseFlightDesignator,
  resolveAdsbCallsign,
  type CreateFlightTrackingInput,
} from "@/features/flights/domain";
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
const AIRCRAFT_CANDIDATE_MAX_AGE_MS = 15 * 60 * 1_000;
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
  const parsedDesignator = parseFlightDesignator(input.passengerFlightNumber);
  const adsbCallsign = resolveAdsbCallsign(
    parsedDesignator.passengerFlightNumber,
    input.adsbCallsign,
  );
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const person = await requirePerson(database, workspace.id, input.personId);
  const [existingFlight] = await database
    .select()
    .from(flightInstances)
    .where(
      and(
        eq(flightInstances.workspaceId, workspace.id),
        eq(
          flightInstances.passengerFlightNumber,
          parsedDesignator.passengerFlightNumber,
        ),
        eq(flightInstances.scheduledDepartureAt, input.scheduledDepartureAt),
        eq(flightInstances.originIata, input.originIata),
        eq(flightInstances.destinationIata, input.destinationIata),
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
    const flight = existingFlight
      ? existingFlight
      : (
          await transaction
            .insert(flightInstances)
            .values({
              workspaceId: workspace.id,
              passengerFlightNumber: parsedDesignator.passengerFlightNumber,
              adsbCallsign,
              originIata: input.originIata,
              originName: input.originName,
              originLatitude: input.originLatitude,
              originLongitude: input.originLongitude,
              destinationIata: input.destinationIata,
              destinationName: input.destinationName,
              destinationLatitude: input.destinationLatitude,
              destinationLongitude: input.destinationLongitude,
              scheduledDepartureAt: input.scheduledDepartureAt,
              scheduledArrivalAt: input.scheduledArrivalAt,
              notes: input.notes || null,
              createdByOperatorId: actor?.id,
            })
            .returning()
        )[0];
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
        adsbCallsign: flight.adsbCallsign,
        scheduledDepartureAt: flight.scheduledDepartureAt.toISOString(),
      },
    });

    return { flightInstanceId: flight.id, assignmentId: assignment.id };
  });
}

export async function confirmFlightAircraft(
  rawInput: z.input<typeof confirmAircraftInputSchema>,
  actorOperatorId?: string,
  now = new Date(),
) {
  const input = confirmAircraftInputSchema.parse(rawInput);
  const { database, workspace } = await getLocalWorkspace();
  const actor = await resolveActor(workspace.id, actorOperatorId);
  const flight = await requireFlight(
    database,
    workspace.id,
    input.flightInstanceId,
  );

  if (["completed", "cancelled"].includes(flight.trackingStatus)) {
    throw new FlightSignalWorkflowError(
      "A closed flight cannot receive a new aircraft match.",
    );
  }

  const [candidate] = await database
    .select()
    .from(flightObservations)
    .where(
      and(
        eq(flightObservations.flightInstanceId, flight.id),
        eq(flightObservations.aircraftIcaoHex, input.aircraftIcaoHex),
      ),
    )
    .orderBy(desc(flightObservations.sourceObservedAt))
    .limit(1);

  if (!candidate) {
    throw new FlightSignalNotFoundError(
      "That aircraft has not been observed for this flight callsign.",
    );
  }
  if (
    now.getTime() - candidate.sourceObservedAt.getTime() >
    AIRCRAFT_CANDIDATE_MAX_AGE_MS
  ) {
    throw new FlightSignalWorkflowError(
      "That aircraft candidate is stale. Wait for a fresh ADS-B observation before confirming it.",
    );
  }

  await database.transaction(async (transaction) => {
    await transaction
      .update(flightInstances)
      .set({
        aircraftIcaoHex: candidate.aircraftIcaoHex,
        aircraftRegistration: candidate.registration,
        aircraftType: candidate.aircraftType,
        aircraftConfirmedByOperatorId: actor?.id,
        aircraftConfirmedAt: now,
        trackingStatus: "tracking",
        updatedAt: now,
      })
      .where(eq(flightInstances.id, flight.id));
    await transaction.insert(activityLog).values({
      workspaceId: workspace.id,
      actorOperatorId: actor?.id,
      action: "flight.aircraft_confirmed",
      entityType: "flight_instance",
      entityId: flight.id,
      summary: `${candidate.registration ?? candidate.aircraftIcaoHex} was confirmed as the aircraft for ${flight.passengerFlightNumber}.`,
      metadata: {
        aircraftIcaoHex: candidate.aircraftIcaoHex,
        candidateObservedAt: candidate.sourceObservedAt.toISOString(),
      },
    });
  });

  return { flightInstanceId: flight.id };
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
  if (!flight.aircraftIcaoHex || !flight.aircraftConfirmedAt) {
    throw new FlightSignalWorkflowError(
      "Confirm the aircraft match before confirming a person onboard.",
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
      "FlightSignal has not observed the aircraft on the ground near the confirmed destination.",
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
        .set({ trackingStatus: "completed", updatedAt: now })
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
        .set({ trackingStatus: "cancelled", updatedAt: now })
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

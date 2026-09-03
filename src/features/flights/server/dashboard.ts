import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { deriveFlightDisplayStatus } from "@/features/flights/status";
import type {
  FlightObservationDto,
  FlightSignalDashboardDto,
  TrackedFlightDto,
} from "@/features/flights/types";
import { getDatabase } from "@/lib/db/client";
import {
  flightAssignments,
  flightInstances,
  flightObservations,
  operators,
  protectees,
  workspaces,
} from "@/lib/db/schema";

const emptyDashboard: FlightSignalDashboardDto = {
  setupRequired: true,
  generatedAt: new Date(0).toISOString(),
  operators: [],
  people: [],
  flights: [],
  metrics: {
    tracked: 0,
    activeTravelers: 0,
    attention: 0,
    sourceErrors: 0,
  },
  source: {
    label: "ADSB.lol",
    authentication: "No API key",
    license: "ODbL",
  },
};

function toObservationDto(
  observation: typeof flightObservations.$inferSelect,
): FlightObservationDto {
  return {
    id: observation.id,
    aircraftIcaoHex: observation.aircraftIcaoHex,
    callsign: observation.callsign ?? undefined,
    registration: observation.registration ?? undefined,
    aircraftType: observation.aircraftType ?? undefined,
    latitude: observation.latitude ?? undefined,
    longitude: observation.longitude ?? undefined,
    barometricAltitudeFeet: observation.barometricAltitudeFeet ?? undefined,
    geometricAltitudeFeet: observation.geometricAltitudeFeet ?? undefined,
    groundSpeedKnots: observation.groundSpeedKnots ?? undefined,
    trackDegrees: observation.trackDegrees ?? undefined,
    verticalRateFeetPerMinute:
      observation.verticalRateFeetPerMinute ?? undefined,
    squawk: observation.squawk ?? undefined,
    onGround: observation.onGround,
    sourceObservedAt: observation.sourceObservedAt.toISOString(),
    retrievedAt: observation.retrievedAt.toISOString(),
  };
}

export async function getFlightSignalDashboard(
  now = new Date(),
): Promise<FlightSignalDashboardDto> {
  const database = getDatabase();
  const workspaceSlug = process.env.CREDSIGNAL_WORKSPACE_SLUG ?? "local";
  const [workspace] = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug))
    .limit(1);

  if (!workspace) {
    return emptyDashboard;
  }

  const [operatorRows, personRows, flightRows] = await Promise.all([
    database
      .select()
      .from(operators)
      .where(
        and(
          eq(operators.workspaceId, workspace.id),
          eq(operators.status, "active"),
        ),
      )
      .orderBy(asc(operators.displayName)),
    database
      .select()
      .from(protectees)
      .where(eq(protectees.workspaceId, workspace.id))
      .orderBy(asc(protectees.displayName)),
    database
      .select()
      .from(flightInstances)
      .where(eq(flightInstances.workspaceId, workspace.id))
      .orderBy(desc(flightInstances.scheduledDepartureAt)),
  ]);

  const flightIds = flightRows.map((flight) => flight.id);
  const [assignmentRows, observationRows] = await Promise.all([
    flightIds.length > 0
      ? database
          .select()
          .from(flightAssignments)
          .where(inArray(flightAssignments.flightInstanceId, flightIds))
          .orderBy(asc(flightAssignments.assignedAt))
      : [],
    flightIds.length > 0
      ? database
          .select()
          .from(flightObservations)
          .where(inArray(flightObservations.flightInstanceId, flightIds))
          .orderBy(desc(flightObservations.sourceObservedAt))
          .limit(2_000)
      : [],
  ]);
  const peopleById = new Map(personRows.map((person) => [person.id, person]));

  const flights = flightRows.map<TrackedFlightDto>((flight) => {
    const observations = observationRows
      .filter((observation) => observation.flightInstanceId === flight.id)
      .map(toObservationDto);
    const relevantObservations = flight.aircraftIcaoHex
      ? observations.filter(
          (observation) =>
            observation.aircraftIcaoHex === flight.aircraftIcaoHex,
        )
      : observations;
    const latestObservation = relevantObservations[0];
    const candidateAircraft = observations.filter(
      (observation, index) =>
        observations.findIndex(
          (candidate) =>
            candidate.aircraftIcaoHex === observation.aircraftIcaoHex,
        ) === index,
    );

    const assignments = assignmentRows
      .filter((assignment) => assignment.flightInstanceId === flight.id)
      .flatMap((assignment) => {
        const person = peopleById.get(assignment.protecteeId);
        if (!person) {
          return [];
        }
        return [
          {
            id: assignment.id,
            person: {
              id: person.id,
              displayName: person.displayName,
              title: person.title ?? undefined,
              organization: person.organization ?? undefined,
              tier: person.tier,
              status: person.status,
            },
            status: assignment.status,
            assignedAt: assignment.assignedAt.toISOString(),
            onboardConfirmedAt: assignment.onboardConfirmedAt?.toISOString(),
            completedAt: assignment.completedAt?.toISOString(),
            notes: assignment.notes ?? undefined,
          },
        ];
      });

    return {
      id: flight.id,
      passengerFlightNumber: flight.passengerFlightNumber,
      adsbCallsign: flight.adsbCallsign,
      origin: {
        iata: flight.originIata,
        name: flight.originName,
        latitude: flight.originLatitude,
        longitude: flight.originLongitude,
      },
      destination: {
        iata: flight.destinationIata,
        name: flight.destinationName,
        latitude: flight.destinationLatitude,
        longitude: flight.destinationLongitude,
      },
      scheduledDepartureAt: flight.scheduledDepartureAt.toISOString(),
      scheduledArrivalAt: flight.scheduledArrivalAt?.toISOString(),
      trackingStatus: flight.trackingStatus,
      displayStatus: deriveFlightDisplayStatus({
        trackingStatus: flight.trackingStatus,
        scheduledDepartureAt: flight.scheduledDepartureAt.toISOString(),
        latestObservation,
        lastPolledAt: flight.lastPolledAt?.toISOString(),
        lastSuccessfulPollAt: flight.lastSuccessfulPollAt?.toISOString(),
        lastSourceError: flight.lastSourceError ?? undefined,
        now,
      }),
      aircraftIcaoHex: flight.aircraftIcaoHex ?? undefined,
      aircraftRegistration: flight.aircraftRegistration ?? undefined,
      aircraftType: flight.aircraftType ?? undefined,
      aircraftConfirmedAt: flight.aircraftConfirmedAt?.toISOString(),
      lastPolledAt: flight.lastPolledAt?.toISOString(),
      lastSuccessfulPollAt: flight.lastSuccessfulPollAt?.toISOString(),
      lastSourceError: flight.lastSourceError ?? undefined,
      notes: flight.notes ?? undefined,
      assignments,
      latestObservation,
      candidateAircraft,
      trail: relevantObservations
        .filter(
          (observation) =>
            observation.latitude !== undefined &&
            observation.longitude !== undefined,
        )
        .slice(0, 120)
        .reverse(),
      createdAt: flight.createdAt.toISOString(),
      updatedAt: flight.updatedAt.toISOString(),
    };
  });

  return {
    setupRequired: false,
    generatedAt: now.toISOString(),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
    },
    operators: operatorRows.map((operator) => ({
      id: operator.id,
      displayName: operator.displayName,
      email: operator.email,
    })),
    people: personRows.map((person) => ({
      id: person.id,
      displayName: person.displayName,
      title: person.title ?? undefined,
      organization: person.organization ?? undefined,
      tier: person.tier,
      status: person.status,
    })),
    flights,
    metrics: {
      tracked: flights.filter(
        (flight) =>
          flight.trackingStatus !== "completed" &&
          flight.trackingStatus !== "cancelled",
      ).length,
      activeTravelers: flights
        .flatMap((flight) => flight.assignments)
        .filter((assignment) => assignment.status === "onboard_confirmed")
        .length,
      attention: flights.filter((flight) =>
        [
          "match_required",
          "signal_stale",
          "source_error",
          "possible_arrival",
        ].includes(flight.displayStatus),
      ).length,
      sourceErrors: flights.filter(
        (flight) => flight.displayStatus === "source_error",
      ).length,
    },
    source: {
      label: "ADSB.lol",
      authentication: "No API key",
      license: "ODbL",
    },
  };
}

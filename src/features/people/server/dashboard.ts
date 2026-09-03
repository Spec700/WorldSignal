import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { activeObservationIntervalMs } from "@/features/flights/scheduling";
import { FLIGHT_SIGNAL_STALE_AFTER_MS } from "@/features/flights/status";
import { currentPersonLocation } from "@/features/people/location-model";
import type {
  PeopleDashboardDto,
  PersonIdentityDto,
  PersonLocationDto,
} from "@/features/people/types";
import { getDatabase } from "@/lib/db/client";
import {
  flightAssignments,
  flightInstances,
  flightObservations,
  operators,
  protecteeIdentities,
  protecteeLocations,
  protectees,
  workspaces,
} from "@/lib/db/schema";

const emptyDashboard: PeopleDashboardDto = {
  setupRequired: true,
  operators: [],
  people: [],
  metrics: {
    total: 0,
    active: 0,
    traveling: 0,
    located: 0,
    highAttention: 0,
  },
};

export async function getPeopleDashboard(
  now = new Date(),
): Promise<PeopleDashboardDto> {
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

  const [operatorRows, personRows] = await Promise.all([
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
  ]);

  const personIds = personRows.map((person) => person.id);
  const [identityRows, locationRows, activeTravelRows] = await Promise.all([
    personIds.length > 0
      ? database
          .select()
          .from(protecteeIdentities)
          .where(inArray(protecteeIdentities.protecteeId, personIds))
          .orderBy(desc(protecteeIdentities.isPrimary))
      : [],
    personIds.length > 0
      ? database
          .select()
          .from(protecteeLocations)
          .where(inArray(protecteeLocations.protecteeId, personIds))
          .orderBy(desc(protecteeLocations.effectiveFrom))
      : [],
    personIds.length > 0
      ? database
          .select({
            assignmentId: flightAssignments.id,
            protecteeId: flightAssignments.protecteeId,
            flightInstanceId: flightInstances.id,
            passengerFlightNumber: flightInstances.passengerFlightNumber,
            providerFlightIcao: flightInstances.providerFlightIcao,
            airlineName: flightInstances.airlineName,
            providerStatus: flightInstances.providerStatus,
            originIata: flightInstances.originIata,
            originName: flightInstances.originName,
            originLatitude: flightInstances.originLatitude,
            originLongitude: flightInstances.originLongitude,
            destinationIata: flightInstances.destinationIata,
            destinationName: flightInstances.destinationName,
            destinationLatitude: flightInstances.destinationLatitude,
            destinationLongitude: flightInstances.destinationLongitude,
            scheduledDepartureAt: flightInstances.scheduledDepartureAt,
            scheduledArrivalAt: flightInstances.scheduledArrivalAt,
            estimatedArrivalAt: flightInstances.estimatedArrivalAt,
            durationMinutes: flightInstances.durationMinutes,
            aircraftIcaoHex: flightInstances.aircraftIcaoHex,
            aircraftRegistration: flightInstances.aircraftRegistration,
            aircraftType: flightInstances.aircraftType,
            lastSourceError: flightInstances.lastSourceError,
          })
          .from(flightAssignments)
          .innerJoin(
            flightInstances,
            eq(flightInstances.id, flightAssignments.flightInstanceId),
          )
          .where(
            and(
              eq(flightAssignments.workspaceId, workspace.id),
              eq(flightAssignments.status, "onboard_confirmed"),
            ),
          )
      : [],
  ]);

  const activeTravelFlightIds = activeTravelRows.map(
    (travel) => travel.flightInstanceId,
  );
  const travelObservationRows =
    activeTravelFlightIds.length > 0
      ? await database
          .selectDistinctOn([flightObservations.flightInstanceId], {
            flightInstanceId: flightObservations.flightInstanceId,
            aircraftIcaoHex: flightObservations.aircraftIcaoHex,
            latitude: flightObservations.latitude,
            longitude: flightObservations.longitude,
            barometricAltitudeFeet: flightObservations.barometricAltitudeFeet,
            groundSpeedKnots: flightObservations.groundSpeedKnots,
            trackDegrees: flightObservations.trackDegrees,
            onGround: flightObservations.onGround,
            sourceObservedAt: flightObservations.sourceObservedAt,
            retrievedAt: flightObservations.retrievedAt,
          })
          .from(flightObservations)
          .innerJoin(
            flightInstances,
            and(
              eq(flightInstances.id, flightObservations.flightInstanceId),
              eq(
                flightInstances.aircraftIcaoHex,
                flightObservations.aircraftIcaoHex,
              ),
            ),
          )
          .where(
            inArray(flightObservations.flightInstanceId, activeTravelFlightIds),
          )
          .orderBy(
            flightObservations.flightInstanceId,
            desc(flightObservations.sourceObservedAt),
          )
      : [];
  const activeTravelByPersonId = new Map(
    activeTravelRows.map((travel) => {
      const observation = travelObservationRows.find(
        (candidate) => candidate.flightInstanceId === travel.flightInstanceId,
      );
      const position =
        observation?.latitude !== null &&
        observation?.latitude !== undefined &&
        observation.longitude !== null &&
        observation.longitude !== undefined
          ? {
              latitude: observation.latitude,
              longitude: observation.longitude,
              barometricAltitudeFeet:
                observation.barometricAltitudeFeet ?? undefined,
              groundSpeedKnots: observation.groundSpeedKnots ?? undefined,
              trackDegrees: observation.trackDegrees ?? undefined,
              onGround: observation.onGround,
              observedAt: observation.sourceObservedAt.toISOString(),
              retrievedAt: observation.retrievedAt.toISOString(),
              isStale:
                now.getTime() - observation.sourceObservedAt.getTime() >
                Math.max(
                  FLIGHT_SIGNAL_STALE_AFTER_MS,
                  activeObservationIntervalMs({
                    scheduledDepartureAt: travel.scheduledDepartureAt,
                    scheduledArrivalAt: travel.scheduledArrivalAt,
                    estimatedArrivalAt: travel.estimatedArrivalAt,
                    durationMinutes: travel.durationMinutes,
                  }) * 2.5,
                ),
            }
          : undefined;

      return [
        travel.protecteeId,
        {
          assignmentId: travel.assignmentId,
          flightInstanceId: travel.flightInstanceId,
          passengerFlightNumber: travel.passengerFlightNumber,
          providerFlightIcao: travel.providerFlightIcao ?? undefined,
          airlineName: travel.airlineName ?? undefined,
          providerStatus: travel.providerStatus ?? undefined,
          origin: {
            iata: travel.originIata,
            name: travel.originName,
            latitude: travel.originLatitude,
            longitude: travel.originLongitude,
          },
          destination: {
            iata: travel.destinationIata,
            name: travel.destinationName,
            latitude: travel.destinationLatitude,
            longitude: travel.destinationLongitude,
          },
          scheduledDepartureAt: travel.scheduledDepartureAt.toISOString(),
          scheduledArrivalAt: travel.scheduledArrivalAt?.toISOString(),
          estimatedArrivalAt: travel.estimatedArrivalAt?.toISOString(),
          aircraft: {
            icaoHex: travel.aircraftIcaoHex ?? undefined,
            registration: travel.aircraftRegistration ?? undefined,
            type: travel.aircraftType ?? undefined,
          },
          sourceError: travel.lastSourceError ?? undefined,
          position,
        },
      ] as const;
    }),
  );

  const people = personRows.map((person) => {
    const identities = identityRows
      .filter((identity) => identity.protecteeId === person.id)
      .map<PersonIdentityDto>((identity) => ({
        id: identity.id,
        type: identity.type,
        displayValue: identity.displayValue,
        isPrimary: identity.isPrimary,
        isActive: identity.isActive,
        verifiedAt: identity.verifiedAt?.toISOString(),
      }));
    const locationHistory = locationRows
      .filter((location) => location.protecteeId === person.id)
      .map<PersonLocationDto>((location) => ({
        id: location.id,
        label: location.label,
        latitude: location.latitude,
        longitude: location.longitude,
        precision: location.precision,
        isActive: location.isActive,
        effectiveFrom: location.effectiveFrom.toISOString(),
        effectiveTo: location.effectiveTo?.toISOString(),
      }));

    return {
      id: person.id,
      displayName: person.displayName,
      title: person.title ?? undefined,
      organization: person.organization ?? undefined,
      tier: person.tier,
      status: person.status,
      notes: person.notes ?? undefined,
      identities,
      location: currentPersonLocation(locationHistory),
      locationHistory,
      activeTravel: activeTravelByPersonId.get(person.id),
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString(),
    };
  });

  const activePeople = people.filter((person) => person.status === "active");

  return {
    setupRequired: false,
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
    people,
    metrics: {
      total: people.length,
      active: activePeople.length,
      traveling: activePeople.filter((person) => person.activeTravel).length,
      located: activePeople.filter((person) => person.location).length,
      highAttention: activePeople.filter(
        (person) => person.tier === "high" || person.tier === "critical",
      ).length,
    },
  };
}

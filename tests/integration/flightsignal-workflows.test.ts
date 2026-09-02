// @vitest-environment node

import { and, eq } from "drizzle-orm";

import { getFlightSignalDashboard } from "@/features/flights/server/dashboard";
import {
  completeTravelerFlight,
  confirmFlightAircraft,
  confirmTravelerOnboard,
  createTrackedFlight,
  FlightSignalNotFoundError,
} from "@/features/flights/server/workflows";
import { createPerson } from "@/features/people/server/workflows";
import { closeDatabase, getDatabase } from "@/lib/db/client";
import {
  activityLog,
  flightAssignments,
  flightInstances,
  flightObservations,
  operators,
  protecteeLocations,
  workspaces,
} from "@/lib/db/schema";

const runDatabaseTests = process.env.RUN_FLIGHTSIGNAL_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase("FlightSignal PostgreSQL workflows", () => {
  const workspaceSlug = `flightsignal-integration-${process.pid}`;
  let workspaceId = "";
  let operatorId = "";

  beforeAll(async () => {
    process.env.CREDSIGNAL_WORKSPACE_SLUG = workspaceSlug;
    const database = getDatabase();
    const [workspace] = await database
      .insert(workspaces)
      .values({ name: "FlightSignal Integration", slug: workspaceSlug })
      .returning();
    workspaceId = workspace.id;
    const [operator] = await database
      .insert(operators)
      .values({
        workspaceId,
        displayName: "Flight Integration Analyst",
        email: `flight-analyst-${process.pid}@integration.example`,
      })
      .returning();
    operatorId = operator.id;
  });

  afterAll(async () => {
    const database = getDatabase();
    if (workspaceId) {
      await database
        .delete(flightAssignments)
        .where(eq(flightAssignments.workspaceId, workspaceId));
      await database
        .delete(flightInstances)
        .where(eq(flightInstances.workspaceId, workspaceId));
      await database.delete(workspaces).where(eq(workspaces.id, workspaceId));
    }
    await closeDatabase();
  });

  it("keeps assignment, aircraft confirmation, travel, and completion distinct", async () => {
    const database = getDatabase();
    const person = await createPerson(
      {
        displayName: "Flight Integration Protectee",
        title: "Chief Test Traveler",
        organization: "Integration Labs",
        tier: "high",
        identityType: "work_email",
        identityValue: "flight-traveler@integration.example",
        locationLabel: "Approved Home Location",
        latitude: 38.9072,
        longitude: -77.0369,
      },
      operatorId,
    );
    const tracked = await createTrackedFlight(
      {
        personId: person.personId,
        passengerFlightNumber: "UA 2276",
        originIata: "IAD",
        originName: "Washington Dulles International Airport",
        originLatitude: 38.9445,
        originLongitude: -77.4558,
        destinationIata: "LAX",
        destinationName: "Los Angeles International Airport",
        destinationLatitude: 33.9425,
        destinationLongitude: -118.408,
        scheduledDepartureAt: new Date("2026-09-02T18:00:00.000Z"),
        scheduledArrivalAt: new Date("2026-09-02T23:30:00.000Z"),
      },
      operatorId,
    );

    await expect(
      confirmFlightAircraft(
        {
          flightInstanceId: tracked.flightInstanceId,
          aircraftIcaoHex: "aa3ae5",
        },
        operatorId,
      ),
    ).rejects.toBeInstanceOf(FlightSignalNotFoundError);

    const observedAt = new Date("2026-09-02T18:05:00.000Z");
    await database.insert(flightObservations).values({
      flightInstanceId: tracked.flightInstanceId,
      aircraftIcaoHex: "aa3ae5",
      callsign: "UAL2276",
      registration: "N00000",
      aircraftType: "B738",
      latitude: 39.1,
      longitude: -78.2,
      barometricAltitudeFeet: 12_000,
      groundSpeedKnots: 310,
      trackDegrees: 270,
      onGround: false,
      sourceObservedAt: observedAt,
      retrievedAt: observedAt,
    });
    await database
      .update(flightInstances)
      .set({
        trackingStatus: "match_required",
        lastPolledAt: observedAt,
        lastSuccessfulPollAt: observedAt,
      })
      .where(eq(flightInstances.id, tracked.flightInstanceId));
    await confirmFlightAircraft(
      {
        flightInstanceId: tracked.flightInstanceId,
        aircraftIcaoHex: "aa3ae5",
      },
      operatorId,
      new Date("2026-09-02T18:06:00.000Z"),
    );
    await confirmTravelerOnboard(
      { assignmentId: tracked.assignmentId },
      operatorId,
    );

    const activeDashboard = await getFlightSignalDashboard(
      new Date("2026-09-02T18:06:30.000Z"),
    );
    expect(activeDashboard.metrics.activeTravelers).toBe(1);
    expect(activeDashboard.flights[0]).toMatchObject({
      displayStatus: "live_airborne",
      aircraftIcaoHex: "aa3ae5",
      assignments: [{ status: "onboard_confirmed" }],
    });

    const [approvedLocationBefore] = await database
      .select()
      .from(protecteeLocations)
      .where(
        and(
          eq(protecteeLocations.protecteeId, person.personId),
          eq(protecteeLocations.isActive, true),
        ),
      );
    await database
      .update(flightInstances)
      .set({ trackingStatus: "possible_arrival" })
      .where(eq(flightInstances.id, tracked.flightInstanceId));
    await completeTravelerFlight(
      { assignmentId: tracked.assignmentId },
      operatorId,
    );

    const completedDashboard = await getFlightSignalDashboard();
    expect(completedDashboard.metrics.activeTravelers).toBe(0);
    expect(completedDashboard.flights[0]).toMatchObject({
      displayStatus: "completed",
      assignments: [{ status: "completed" }],
    });
    const [approvedLocationAfter] = await database
      .select()
      .from(protecteeLocations)
      .where(
        and(
          eq(protecteeLocations.protecteeId, person.personId),
          eq(protecteeLocations.isActive, true),
        ),
      );
    expect(approvedLocationAfter.id).toBe(approvedLocationBefore.id);

    const actions = await database
      .select({ action: activityLog.action })
      .from(activityLog)
      .where(eq(activityLog.workspaceId, workspaceId));
    expect(actions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "flight.assigned",
        "flight.aircraft_confirmed",
        "flight.traveler_onboard_confirmed",
        "flight.travel_completed",
      ]),
    );
  });
});

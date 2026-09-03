// @vitest-environment node

import { and, eq } from "drizzle-orm";

import { getFlightSignalDashboard } from "@/features/flights/server/dashboard";
import { pollTrackedFlights } from "@/features/flights/server/polling";
import {
  cancelFlightAssignment,
  completeTravelerFlight,
  confirmTravelerOnboard,
  createTrackedFlight,
} from "@/features/flights/server/workflows";
import { sealFlightLookup } from "@/features/flights/server/confirmation-token";
import { getPeopleDashboard } from "@/features/people/server/dashboard";
import { createPerson } from "@/features/people/server/workflows";
import { closeDatabase, getDatabase } from "@/lib/db/client";
import {
  activityLog,
  flightAssignments,
  flightInstances,
  flightObservations,
  flightSourceStates,
  operators,
  protecteeLocations,
  workspaces,
} from "@/lib/db/schema";
import { AirLabsAdapter } from "@/lib/sources/airlabs/adapter";

const runDatabaseTests = process.env.RUN_FLIGHTSIGNAL_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase("FlightSignal PostgreSQL workflows", () => {
  const workspaceSlug = `flightsignal-integration-${process.pid}`;
  let workspaceId = "";
  let operatorId = "";

  beforeAll(async () => {
    process.env.CREDSIGNAL_WORKSPACE_SLUG = workspaceSlug;
    process.env.AIRLABS_API_KEY = "integration-test-airlabs-key";
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

  it("keeps assignment, onboard confirmation, travel, and completion distinct", async () => {
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
        confirmationToken: sealFlightLookup({
          passengerFlightNumber: "UA2276",
          flightIcao: "UAL2276",
          origin: {
            iata: "IAD",
            icao: "KIAD",
            name: "Washington Dulles International Airport",
            city: "Washington",
            country: "United States",
            latitude: 38.9445,
            longitude: -77.4558,
          },
          destination: {
            iata: "LAX",
            icao: "KLAX",
            name: "Los Angeles International Airport",
            city: "Los Angeles",
            country: "United States",
            latitude: 33.9425,
            longitude: -118.408,
          },
          scheduledDepartureAt: "2026-09-02T18:00:00.000Z",
          scheduledArrivalAt: "2026-09-02T23:30:00.000Z",
          durationMinutes: 330,
          providerStatus: "en-route",
          phase: "active",
          aircraftIcaoHex: "aa3ae5",
          aircraftRegistration: "N00000",
          aircraftType: "B738",
          observation: {
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
            sourceObservedAt: "2026-09-02T18:05:00.000Z",
            retrievedAt: "2026-09-02T18:05:00.000Z",
          },
          usage: {},
          retrievedAt: "2026-09-02T18:05:00.000Z",
        }).confirmationToken,
      },
      operatorId,
    );

    const observedAt = new Date("2026-09-02T18:05:00.000Z");
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
    const activePeopleDashboard = await getPeopleDashboard();
    const activeTraveler = activePeopleDashboard.people.find(
      (candidate) => candidate.id === person.personId,
    );
    expect(activePeopleDashboard.metrics.traveling).toBe(1);
    expect(activeTraveler).toMatchObject({
      location: { label: "Approved Home Location" },
      activeTravel: {
        flightInstanceId: tracked.flightInstanceId,
        passengerFlightNumber: "UA2276",
        origin: { iata: "IAD" },
        destination: { iata: "LAX" },
        position: {
          latitude: 39.1,
          longitude: -78.2,
          observedAt: observedAt.toISOString(),
        },
      },
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
    const completedPeopleDashboard = await getPeopleDashboard();
    const completedTraveler = completedPeopleDashboard.people.find(
      (candidate) => candidate.id === person.personId,
    );
    expect(completedPeopleDashboard.metrics.traveling).toBe(0);
    expect(completedTraveler?.activeTravel).toBeUndefined();
    expect(completedTraveler?.location?.label).toBe("Approved Home Location");
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
        "flight.traveler_onboard_confirmed",
        "flight.travel_completed",
      ]),
    );
  });

  it("clears the polling schedule when the last assignment is cancelled", async () => {
    const database = getDatabase();
    const person = await createPerson(
      {
        displayName: "Cancelled Flight Protectee",
        title: "Test Traveler",
        organization: "Integration Labs",
        tier: "standard",
        identityType: "work_email",
        identityValue: "cancelled-flight@integration.example",
        locationLabel: "Approved Office",
        latitude: 38.9072,
        longitude: -77.0369,
      },
      operatorId,
    );
    const tracked = await createTrackedFlight(
      {
        personId: person.personId,
        confirmationToken: sealFlightLookup({
          passengerFlightNumber: "DL204",
          flightIcao: "DAL204",
          origin: {
            iata: "IAD",
            icao: "KIAD",
            name: "Washington Dulles International Airport",
            city: "Washington",
            country: "United States",
            latitude: 38.9445,
            longitude: -77.4558,
          },
          destination: {
            iata: "LAX",
            icao: "KLAX",
            name: "Los Angeles International Airport",
            city: "Los Angeles",
            country: "United States",
            latitude: 33.9425,
            longitude: -118.408,
          },
          scheduledDepartureAt: "2026-09-04T18:00:00.000Z",
          scheduledArrivalAt: "2026-09-04T23:00:00.000Z",
          durationMinutes: 300,
          providerStatus: "scheduled",
          phase: "scheduled",
          usage: {},
          retrievedAt: "2026-09-03T19:00:00.000Z",
        }).confirmationToken,
      },
      operatorId,
    );
    await database
      .update(flightInstances)
      .set({ nextPollAt: new Date("2026-09-04T17:30:00.000Z") })
      .where(eq(flightInstances.id, tracked.flightInstanceId));

    await cancelFlightAssignment(
      { assignmentId: tracked.assignmentId },
      operatorId,
    );

    const [cancelledFlight] = await database
      .select()
      .from(flightInstances)
      .where(eq(flightInstances.id, tracked.flightInstanceId));
    expect(cancelledFlight).toMatchObject({
      trackingStatus: "cancelled",
      nextPollAt: null,
    });
  });

  it("polls a due flight, stores its trail, and stops after the terminal observation", async () => {
    const database = getDatabase();
    const person = await createPerson(
      {
        displayName: "Scheduled Flight Protectee",
        title: "Test Traveler",
        organization: "Integration Labs",
        tier: "standard",
        identityType: "work_email",
        identityValue: "scheduled-flight@integration.example",
        locationLabel: "Approved Office",
        latitude: 38.9072,
        longitude: -77.0369,
      },
      operatorId,
    );
    const scheduledDepartureAt = "2026-09-03T15:00:00.000Z";
    const scheduledArrivalAt = "2026-09-03T17:00:00.000Z";
    const tracked = await createTrackedFlight(
      {
        personId: person.personId,
        confirmationToken: sealFlightLookup({
          passengerFlightNumber: "AA101",
          flightIcao: "AAL101",
          origin: {
            iata: "IAD",
            icao: "KIAD",
            name: "Washington Dulles International Airport",
            city: "Washington",
            country: "United States",
            latitude: 38.9445,
            longitude: -77.4558,
          },
          destination: {
            iata: "LAX",
            icao: "KLAX",
            name: "Los Angeles International Airport",
            city: "Los Angeles",
            country: "United States",
            latitude: 33.9425,
            longitude: -118.408,
          },
          scheduledDepartureAt,
          scheduledArrivalAt,
          durationMinutes: 120,
          providerStatus: "scheduled",
          phase: "scheduled",
          usage: {},
          retrievedAt: "2026-09-03T14:30:00.000Z",
        }).confirmationToken,
      },
      operatorId,
    );
    const pollNow = new Date("2026-09-03T14:45:00.000Z");
    await database
      .update(flightInstances)
      .set({ nextPollAt: pollNow })
      .where(eq(flightInstances.id, tracked.flightInstanceId));

    const fetchImplementation = vi.fn(async () =>
      Response.json({
        request: {
          key: {
            id: 99,
            type: "free",
            limits_by_month: 1000,
            usage_by_month: 10,
          },
        },
        response: {
          hex: "aa0001",
          reg_number: "N101AA",
          lat: 38.5,
          lng: -80.25,
          alt: 9_144,
          dir: 270,
          speed: 800,
          flight_icao: "AAL101",
          flight_iata: "AA101",
          aircraft_icao: "B738",
          dep_iata: "IAD",
          dep_name: "Washington Dulles International Airport",
          dep_time_ts: Date.parse(scheduledDepartureAt) / 1_000,
          arr_iata: "LAX",
          arr_name: "Los Angeles International Airport",
          arr_time_ts: Date.parse(scheduledArrivalAt) / 1_000,
          duration: 120,
          updated: pollNow.getTime() / 1_000,
          status: "en-route",
          percent: 5,
        },
      }),
    );
    const adapter = new AirLabsAdapter({
      fetchImplementation,
      now: () => pollNow,
    });
    const summary = await pollTrackedFlights({
      signal: new AbortController().signal,
      now: pollNow,
      adapter,
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({
      eligible: 1,
      attempted: 1,
      successful: 1,
      observationsStored: 1,
    });
    const [flight] = await database
      .select()
      .from(flightInstances)
      .where(eq(flightInstances.id, tracked.flightInstanceId));
    expect(flight).toMatchObject({
      trackingStatus: "tracking",
      providerStatus: "en-route",
      aircraftIcaoHex: "aa0001",
      consecutiveSourceErrors: 0,
    });
    expect(flight.nextPollAt).toEqual(new Date("2026-09-03T14:46:00.000Z"));
    const observations = await database
      .select()
      .from(flightObservations)
      .where(eq(flightObservations.flightInstanceId, tracked.flightInstanceId));
    expect(observations).toHaveLength(1);
    const [sourceState] = await database
      .select()
      .from(flightSourceStates)
      .where(eq(flightSourceStates.workspaceId, workspaceId));
    expect(sourceState).toMatchObject({
      automationRequestCount: 1,
      providerMonthlyRemaining: 990,
    });

    const landingNow = new Date("2026-09-03T17:02:00.000Z");
    await database
      .update(flightInstances)
      .set({ nextPollAt: landingNow })
      .where(eq(flightInstances.id, tracked.flightInstanceId));
    fetchImplementation.mockImplementationOnce(async () =>
      Response.json({
        request: {
          key: {
            id: 99,
            type: "free",
            limits_by_month: 1000,
            usage_by_month: 11,
          },
        },
        response: {
          flight_icao: "AAL101",
          flight_iata: "AA101",
          dep_iata: "IAD",
          dep_name: "Washington Dulles International Airport",
          dep_time_ts: Date.parse(scheduledDepartureAt) / 1_000,
          arr_iata: "LAX",
          arr_name: "Los Angeles International Airport",
          arr_time_ts: Date.parse(scheduledArrivalAt) / 1_000,
          arr_actual_ts: landingNow.getTime() / 1_000,
          duration: 120,
          updated: landingNow.getTime() / 1_000,
          status: "landed",
          percent: 100,
        },
      }),
    );

    const landingSummary = await pollTrackedFlights({
      signal: new AbortController().signal,
      now: landingNow,
      adapter,
    });
    expect(landingSummary).toMatchObject({ attempted: 1, successful: 1 });
    const [landedFlight] = await database
      .select()
      .from(flightInstances)
      .where(eq(flightInstances.id, tracked.flightInstanceId));
    expect(landedFlight).toMatchObject({
      trackingStatus: "possible_arrival",
      providerStatus: "landed",
      nextPollAt: null,
    });

    const stoppedSummary = await pollTrackedFlights({
      signal: new AbortController().signal,
      now: new Date("2026-09-03T17:30:00.000Z"),
      adapter,
    });
    expect(stoppedSummary).toMatchObject({ eligible: 0, attempted: 0 });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
});

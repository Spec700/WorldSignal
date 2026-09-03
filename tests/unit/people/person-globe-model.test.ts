import { describe, expect, it } from "vitest";

import {
  formatProximityDistance,
  personPointTooltip,
  rankPeopleByEventProximity,
  toPersonGlobePoints,
} from "@/components/people/person-globe-model";
import type { PersonDto } from "@/features/people/types";
import { earthquakeFixture } from "../../fixtures/events";

const person: PersonDto = {
  id: "person-1",
  displayName: "Avery <Chen>",
  organization: "Northstar & Labs",
  tier: "critical",
  status: "active",
  identities: [],
  location: {
    id: "location-current",
    label: "London, United Kingdom",
    latitude: 51.5072,
    longitude: -0.1276,
    precision: "city",
    isActive: true,
    effectiveFrom: "2026-08-10T00:00:00.000Z",
  },
  locationHistory: [
    {
      id: "location-current",
      label: "London, United Kingdom",
      latitude: 51.5072,
      longitude: -0.1276,
      precision: "city",
      isActive: true,
      effectiveFrom: "2026-08-10T00:00:00.000Z",
    },
    {
      id: "location-previous",
      label: "New York, NY",
      latitude: 40.7128,
      longitude: -74.006,
      precision: "city",
      isActive: false,
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      effectiveTo: "2026-08-10T00:00:00.000Z",
    },
  ],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

describe("person globe model", () => {
  it("maps current approved locations for active people", () => {
    expect(toPersonGlobePoints([person])).toEqual([
      expect.objectContaining({
        kind: "person",
        id: "person-1",
        latitude: 51.5072,
        longitude: -0.1276,
        locationLabel: "London, United Kingdom",
        tier: "critical",
      }),
    ]);

    expect(toPersonGlobePoints([{ ...person, status: "paused" }])).toEqual([]);
    expect(toPersonGlobePoints([{ ...person, location: undefined }])).toEqual(
      [],
    );
  });

  it("resolves the approved location at a supplied timeline instant", () => {
    const [point] = toPersonGlobePoints([person], "2026-08-05T12:00:00.000Z");

    expect(point).toEqual(
      expect.objectContaining({
        locationLabel: "New York, NY",
        latitude: 40.7128,
        longitude: -74.006,
      }),
    );
    expect(toPersonGlobePoints([person], "2026-07-01T00:00:00.000Z")).toEqual(
      [],
    );
  });

  it("uses a confirmed aircraft position only when live travel is requested", () => {
    const traveler: PersonDto = {
      ...person,
      activeTravel: {
        assignmentId: "assignment-1",
        flightInstanceId: "flight-1",
        passengerFlightNumber: "UA2276",
        origin: {
          iata: "IAD",
          name: "Washington Dulles International Airport",
          latitude: 38.9445,
          longitude: -77.4558,
        },
        destination: {
          iata: "LAX",
          name: "Los Angeles International Airport",
          latitude: 33.9425,
          longitude: -118.408,
        },
        scheduledDepartureAt: "2026-09-02T18:00:00.000Z",
        aircraft: { icaoHex: "aa3ae5" },
        position: {
          latitude: 39.1,
          longitude: -78.2,
          trackDegrees: 270,
          onGround: false,
          observedAt: "2026-09-02T18:05:00.000Z",
          retrievedAt: "2026-09-02T18:05:01.000Z",
          isStale: false,
        },
      },
    };

    expect(toPersonGlobePoints([traveler])[0]).toMatchObject({
      markerType: "point",
      positionMode: "approved_location",
      latitude: 51.5072,
      longitude: -0.1276,
    });
    expect(toPersonGlobePoints([traveler], undefined, true)[0]).toMatchObject({
      markerType: "aircraft",
      positionMode: "inferred_aircraft",
      latitude: 39.1,
      longitude: -78.2,
      locationLabel: "UA2276 · IAD → LAX",
      trackDegrees: 270,
    });

    const travelerWithoutPosition = {
      ...traveler,
      activeTravel: { ...traveler.activeTravel!, position: undefined },
    };
    expect(
      toPersonGlobePoints([travelerWithoutPosition], undefined, true)[0],
    ).toMatchObject({
      markerType: "point",
      positionMode: "approved_location",
      latitude: 51.5072,
      longitude: -0.1276,
    });
  });

  it("escapes operator-managed values in globe tooltips", () => {
    const [point] = toPersonGlobePoints([person]);
    const tooltip = personPointTooltip(point!);

    expect(tooltip).toContain("Avery &lt;Chen&gt;");
    expect(tooltip).toContain("Northstar &amp; Labs");
    expect(tooltip).not.toContain("Avery <Chen>");
  });

  it("ranks people nearest-first using the event geometry", () => {
    const [london] = toPersonGlobePoints([person]);
    const tokyo = {
      ...london!,
      id: "person-tokyo",
      displayName: "Kenji Sato",
      locationLabel: "Tokyo, Japan",
      latitude: 35.6762,
      longitude: 139.6503,
    };

    const ranked = rankPeopleByEventProximity(
      [london!, tokyo],
      earthquakeFixture,
    );

    expect(ranked.map(({ person }) => person.id)).toEqual([
      "person-tokyo",
      "person-1",
    ]);
    expect(ranked[0]!.distanceKm).toBeLessThan(ranked[1]!.distanceKm);
  });

  it("re-ranks against detailed paths and affected areas when they arrive", () => {
    const [london] = toPersonGlobePoints([person]);
    const nearCentroid = {
      ...london!,
      id: "near-centroid",
      latitude: 38,
      longitude: 143,
    };
    const nearDetail = {
      ...london!,
      id: "near-detail",
      latitude: 20.5,
      longitude: -167.2,
    };
    const detailGeometry = {
      type: "FeatureCollection" as const,
      features: [
        {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [-167.2, 20.5] },
          properties: {},
        },
      ],
    };

    expect(
      rankPeopleByEventProximity(
        [nearDetail, nearCentroid],
        earthquakeFixture,
      )[0]!.person.id,
    ).toBe("near-centroid");
    expect(
      rankPeopleByEventProximity(
        [nearDetail, nearCentroid],
        earthquakeFixture,
        detailGeometry,
      )[0]!.person.id,
    ).toBe("near-detail");
  });

  it("formats proximity distances for compact operational display", () => {
    expect(formatProximityDistance(0)).toBe("<1 km");
    expect(formatProximityDistance(4.25)).toBe("4.3 km");
    expect(formatProximityDistance(1234.4)).toBe("1,234 km");
  });
});

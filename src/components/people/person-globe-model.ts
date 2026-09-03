import { personLocationAt } from "@/features/people/location-model";
import type {
  PersonActiveTravelDto,
  PersonLocationDto,
  PersonStatus,
  PersonTier,
} from "@/features/people/types";
import type { WorldEvent } from "@/lib/events/types";
import {
  distanceBetweenPointsKm,
  distanceToGeometryCollectionKm,
  distanceToGeometryKm,
} from "@/lib/geo/proximity";
import type { GdacsGeometryCollection } from "@/lib/sources/gdacs/geometry";

export interface PersonLocationSubject {
  id: string;
  displayName: string;
  organization?: string;
  tier: PersonTier;
  status: PersonStatus;
  location?: PersonLocationDto;
  locationHistory: PersonLocationDto[];
  activeTravel?: PersonActiveTravelDto;
}

const tierColor: Record<PersonTier, string> = {
  standard: "#69d2df",
  high: "#f2c46d",
  critical: "#f2f7f8",
};

const tierRadius: Record<PersonTier, number> = {
  standard: 0.22,
  high: 0.27,
  critical: 0.32,
};

export interface PersonGlobePoint {
  kind: "person";
  markerType: "point" | "aircraft";
  id: string;
  latitude: number;
  longitude: number;
  color: string;
  radius: number;
  altitude: number;
  displayName: string;
  organization?: string;
  locationLabel: string;
  locationPrecision: string;
  positionMode: "approved_location" | "inferred_aircraft";
  activeTravelFlightNumber?: string;
  trackDegrees?: number;
  tier: PersonTier;
}

export interface PersonEventProximity {
  distanceKm: number;
  person: PersonGlobePoint;
}

export function toPersonGlobePoints(
  people: PersonLocationSubject[],
  atTimestamp?: string,
  includeActiveTravel = false,
): PersonGlobePoint[] {
  return people.flatMap((person) => {
    if (person.status !== "active") {
      return [];
    }
    const approvedLocation = atTimestamp
      ? personLocationAt(person.locationHistory, atTimestamp)
      : person.location;
    const travelPosition = includeActiveTravel
      ? person.activeTravel?.position
      : undefined;

    if (!approvedLocation && !travelPosition) {
      return [];
    }

    const usesAircraftPosition = Boolean(travelPosition);
    const latitude = travelPosition?.latitude ?? approvedLocation!.latitude;
    const longitude = travelPosition?.longitude ?? approvedLocation!.longitude;
    const locationLabel = usesAircraftPosition
      ? `${person.activeTravel!.passengerFlightNumber} · ${person.activeTravel!.origin.iata} → ${person.activeTravel!.destination.iata}`
      : approvedLocation!.label;

    return [
      {
        kind: "person" as const,
        markerType: usesAircraftPosition
          ? ("aircraft" as const)
          : ("point" as const),
        id: person.id,
        latitude,
        longitude,
        color:
          usesAircraftPosition &&
          (travelPosition!.isStale || person.activeTravel?.sourceError)
            ? "#789398"
            : tierColor[person.tier],
        radius: tierRadius[person.tier],
        altitude: usesAircraftPosition ? 0.045 : 0.014,
        displayName: person.displayName,
        organization: person.organization,
        locationLabel,
        locationPrecision: usesAircraftPosition
          ? travelPosition!.isStale
            ? "stale inferred aircraft position"
            : "current inferred aircraft position"
          : approvedLocation!.precision,
        positionMode: usesAircraftPosition
          ? ("inferred_aircraft" as const)
          : ("approved_location" as const),
        activeTravelFlightNumber: person.activeTravel?.passengerFlightNumber,
        trackDegrees: travelPosition?.trackDegrees,
        tier: person.tier,
      },
    ];
  });
}

function distanceFromEvent(
  person: PersonGlobePoint,
  event: WorldEvent,
  detailGeometry?: GdacsGeometryCollection,
): number {
  if (detailGeometry) {
    const detailDistance = distanceToGeometryCollectionKm(
      person,
      detailGeometry,
    );
    if (Number.isFinite(detailDistance)) {
      return detailDistance;
    }
  }

  const eventGeometryDistance = distanceToGeometryKm(person, event.geometry);
  return Number.isFinite(eventGeometryDistance)
    ? eventGeometryDistance
    : distanceBetweenPointsKm(person, event.centroid);
}

export function rankPeopleByEventProximity(
  people: PersonGlobePoint[],
  event: WorldEvent,
  detailGeometry?: GdacsGeometryCollection,
): PersonEventProximity[] {
  return people
    .map((person, originalIndex) => ({
      distanceKm: distanceFromEvent(person, event, detailGeometry),
      originalIndex,
      person,
    }))
    .sort(
      (left, right) =>
        left.distanceKm - right.distanceKm ||
        left.originalIndex - right.originalIndex,
    )
    .map(({ distanceKm, person }) => ({ distanceKm, person }));
}

export function formatProximityDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return "<1 km";
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: distanceKm < 10 ? 1 : 0,
  }).format(distanceKm)} km`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character,
  );
}

export function personPointTooltip(point: PersonGlobePoint): string {
  const tier = escapeHtml(point.tier);
  const name = escapeHtml(point.displayName);
  const location = escapeHtml(point.locationLabel);
  const organization = point.organization
    ? ` · ${escapeHtml(point.organization)}`
    : "";

  const positionSource =
    point.positionMode === "inferred_aircraft"
      ? `Travel mode · ${escapeHtml(point.locationPrecision)}`
      : `Person · ${tier} protection tier`;

  return `<div class="globe-tooltip"><span>${positionSource}</span><strong>${name}</strong><small>${location}${organization}</small></div>`;
}
